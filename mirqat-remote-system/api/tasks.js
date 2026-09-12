import supabase from '../lib/supabase.js';
import { getSessionUser } from '../lib/jwt.js';
import { ok, fail } from '../lib/response.js';
import { logAudit } from '../lib/audit.js';
import { applyPagination, paginatedResult } from '../lib/paginate.js';
import { windowCutoffIso, EDIT_WINDOW_HOURS, DELETE_WINDOW_HOURS } from '../lib/timeWindow.js';

/**
 * Actions — المهام والتكاليف والاختبارات (task_assignments):
 *  - getTasks        { filters? }
 *  - saveTask        { id?, data }
 *  - saveTaskRepeating { data, repeatUntilDate }   → تكرار أسبوعي حتى تاريخ معيّن
 *  - deleteTask      { id }
 *  - getPendingTasks { filters? }                  → لم تُرصد درجتها بعد (is_graded=false)
 *
 * Actions — الإثراءات والفيديوهات (enrichment_content) — منفصلة تمامًا عن أعلاه:
 *  - getEnrichments  { filters? }
 *  - saveEnrichment  { id?, data }
 *  - deleteEnrichment{ id }
 *  - getEnrichmentViews { enrichmentId }            → من شاهد المحتوى من الطلاب
 *
 * القاعدة: معلم يملك فقط سجلاته (employee_id = هو)، أدمن يرى/يعدّل كل شيء
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 'Method not allowed', 405);

  const user = getSessionUser(req);
  if (!user) return fail(res, 'الجلسة غير صالحة أو منتهية', 401);

  const { action, ...body } = req.body || {};

  try {
    switch (action) {
      case 'getTasks':
        return await getTasks(req, res, user, body);
      case 'saveTask':
        return await saveTask(req, res, user, body);
      case 'saveTaskRepeating':
        return await saveTaskRepeating(req, res, user, body);
      case 'deleteTask':
        return await deleteTask(req, res, user, body);
      case 'getPendingTasks':
        return await getPendingTasks(req, res, user, body);
      case 'getEnrichments':
        return await getEnrichments(req, res, user, body);
      case 'saveEnrichment':
        return await saveEnrichment(req, res, user, body);
      case 'deleteEnrichment':
        return await deleteEnrichment(req, res, user, body);
      case 'getEnrichmentViews':
        return await getEnrichmentViews(req, res, user, body);
      default:
        return fail(res, 'إجراء غير معروف', 400);
    }
  } catch (e) {
    console.error('tasks.js error:', e);
    return fail(res, 'حدث خطأ في الخادم', 500);
  }
}

function scopeToOwner(query, user, col = 'employee_id') {
  if (user.role === 'admin') return query;
  return query.eq(col, user.employeeId);
}

/** أسبوع التقويم الدراسي الحالي (اليوم بين بداية ونهاية الأسبوع) */
async function getCurrentWeek(term) {
  const today = new Date().toISOString().slice(0, 10);
  let q = supabase.from('school_calendar').select('term, week, week_start_date, week_end_date')
    .lte('week_start_date', today).gte('week_end_date', today).limit(1);
  if (term) q = q.eq('term', term);
  const { data } = await q.maybeSingle();
  return data;
}

/* ================= المهام والتكاليف والاختبارات ================= */

async function getTasks(req, res, user, { filters = {}, page, pageSize } = {}) {
  let query = supabase.from('task_assignments').select('*', { count: 'exact' });
  query = scopeToOwner(query, user);

  if (filters.branch) query = query.eq('branch', filters.branch);
  if (filters.stages) query = query.eq('stages', filters.stages);
  if (filters.grades) query = query.eq('grades', filters.grades);
  if (filters.sections) query = query.eq('sections', filters.sections);
  if (filters.subject) query = query.eq('subject', filters.subject);
  if (filters.term) query = query.eq('term', filters.term);

  // افتراضيًا: لا يظهر إلا تكاليف الأسبوع الدراسي الحالي فقط، ما لم يُطلب نطاق تاريخ صريح
  if (!filters.showAll && !filters.dateFrom) {
    const currentWeek = await getCurrentWeek(filters.term);
    if (currentWeek) {
      query = query.gte('issue_date', currentWeek.week_start_date).lte('issue_date', currentWeek.week_end_date);
    }
  }

  query = query.order('due_date', { ascending: true });

  const paged = applyPagination(query, { page, pageSize });
  const { data, error, count } = await paged.query;
  if (error) return fail(res, 'تعذّر جلب التكاليف', 500);

  const now = Date.now();
  const editableRows = data.map(t => ({
    ...t,
    can_edit: user.role === 'admin' || (now - new Date(t.created_at).getTime()) < EDIT_WINDOW_HOURS.task * 3600 * 1000,
    can_delete: user.role === 'admin' || (now - new Date(t.created_at).getTime()) < DELETE_WINDOW_HOURS.task * 3600 * 1000
  }));

  return ok(res, paginatedResult(editableRows, count, paged.page, paged.pageSize));
}

async function saveTask(req, res, user, { id, data } = {}) {
  if (!data) return fail(res, 'بيانات ناقصة', 400);

  if (id) {
    let query = supabase.from('task_assignments').update({ ...data, is_edited: true }).eq('id', id);
    query = scopeToOwner(query, user);
    if (user.role !== 'admin') query = query.gte('created_at', windowCutoffIso(EDIT_WINDOW_HOURS.task));
    const { data: updated, error } = await query.select();
    if (error) return fail(res, 'تعذّر تعديل التكليف', 500);
    if (!updated || updated.length === 0) return fail(res, 'انتهت مهلة التعديل (6 أيام) — راجع الأدمن', 403);
    await logAudit(user, 'saveTask', `تعديل تكليف: ${id}`);
    return ok(res, { id });
  }

  const insertData = {
    ...data,
    employee_id: user.role === 'admin' && data.employee_id ? data.employee_id : user.employeeId,
    employee_name: user.role === 'admin' && data.employee_name ? data.employee_name : user.name
  };

  const { data: inserted, error } = await supabase.from('task_assignments').insert(insertData).select().single();
  if (error) return fail(res, 'تعذّر إضافة التكليف', 500);

  await logAudit(user, 'saveTask', `إضافة تكليف: ${inserted.id} - ${inserted.task_name}`);
  return ok(res, inserted, 201);
}

/** ينشئ نسخة أسبوعية من نفس التكليف حتى تاريخ معيّن (يحافظ على الفارق بين تاريخ الطرح والانتهاء) */
async function saveTaskRepeating(req, res, user, { data, repeatUntilDate } = {}) {
  if (!data || !data.issue_date || !repeatUntilDate) {
    return fail(res, 'بيانات ناقصة للتكرار الأسبوعي', 400);
  }

  const issueStart = new Date(data.issue_date);
  const until = new Date(repeatUntilDate);
  if (isNaN(issueStart) || isNaN(until) || until < issueStart) {
    return fail(res, 'تواريخ غير صالحة', 400);
  }

  const dueOffsetMs = data.due_date ? new Date(data.due_date) - issueStart : 0;

  const rows = [];
  let cursor = new Date(issueStart);
  while (cursor <= until) {
    const issueDate = new Date(cursor);
    const dueDate = data.due_date ? new Date(issueDate.getTime() + dueOffsetMs) : null;

    rows.push({
      ...data,
      issue_date: issueDate.toISOString().slice(0, 10),
      due_date: dueDate ? dueDate.toISOString().slice(0, 10) : null,
      employee_id: user.role === 'admin' && data.employee_id ? data.employee_id : user.employeeId,
      employee_name: user.role === 'admin' && data.employee_name ? data.employee_name : user.name
    });

    cursor.setDate(cursor.getDate() + 7);
  }

  if (rows.length === 0) return fail(res, 'لا توجد أسابيع ضمن النطاق المحدد', 400);

  const { data: inserted, error } = await supabase.from('task_assignments').insert(rows).select();
  if (error) return fail(res, 'تعذّر إنشاء التكاليف المتكررة', 500);

  await logAudit(user, 'saveTaskRepeating', `إضافة ${rows.length} تكليف متكرر: ${data.task_name}`);
  return ok(res, inserted, 201);
}

async function deleteTask(req, res, user, { id } = {}) {
  if (!id) return fail(res, 'معرّف التكليف مطلوب', 400);

  let query = supabase.from('task_assignments').delete().eq('id', id);
  query = scopeToOwner(query, user);
  if (user.role !== 'admin') query = query.gte('created_at', windowCutoffIso(DELETE_WINDOW_HOURS.task));
  const { data: deleted, error } = await query.select('id');
  if (error) return fail(res, 'تعذّر حذف التكليف', 500);
  if (!deleted || deleted.length === 0) return fail(res, 'انتهت مهلة الحذف (6 ساعات) — راجع الأدمن', 403);

  await logAudit(user, 'deleteTask', `حذف تكليف: ${id}`);
  return ok(res, { id });
}

async function getPendingTasks(req, res, user, { filters = {} } = {}) {
  let query = supabase.from('task_assignments').select('*').eq('is_graded', false);
  query = scopeToOwner(query, user);

  if (filters.branch) query = query.eq('branch', filters.branch);
  if (filters.subject) query = query.eq('subject', filters.subject);

  if (!filters.showAll) {
    const currentWeek = await getCurrentWeek(filters.term);
    if (currentWeek) {
      query = query.gte('issue_date', currentWeek.week_start_date).lte('issue_date', currentWeek.week_end_date);
    }
  }

  query = query.order('due_date', { ascending: true });

  const { data, error } = await query;
  if (error) return fail(res, 'تعذّر جلب التكاليف المعلّقة', 500);
  return ok(res, data);
}

/* ================= الإثراءات والفيديوهات ================= */

async function getEnrichments(req, res, user, { filters = {}, page, pageSize } = {}) {
  let query = supabase.from('enrichment_content').select('*', { count: 'exact' });
  query = scopeToOwner(query, user);

  if (filters.branch) query = query.eq('branch', filters.branch);
  if (filters.stages) query = query.eq('stages', filters.stages);
  if (filters.grades) query = query.eq('grades', filters.grades);
  if (filters.sections) query = query.eq('sections', filters.sections);
  if (filters.subject) query = query.eq('subject', filters.subject);
  if (filters.contentType) query = query.eq('content_type', filters.contentType);

  if (!filters.showAll && !filters.dateFrom) {
    const currentWeek = await getCurrentWeek(filters.term);
    if (currentWeek) {
      query = query.gte('publish_date', currentWeek.week_start_date).lte('publish_date', currentWeek.week_end_date);
    }
  }

  query = query.order('publish_date', { ascending: false });

  const paged = applyPagination(query, { page, pageSize });
  const { data, error, count } = await paged.query;
  if (error) return fail(res, 'تعذّر جلب الإثراءات', 500);

  const now = Date.now();
  const editableRows = data.map(en => ({
    ...en,
    can_edit: user.role === 'admin' || (now - new Date(en.created_at).getTime()) < EDIT_WINDOW_HOURS.task * 3600 * 1000,
    can_delete: user.role === 'admin' || (now - new Date(en.created_at).getTime()) < DELETE_WINDOW_HOURS.task * 3600 * 1000
  }));

  return ok(res, paginatedResult(editableRows, count, paged.page, paged.pageSize));
}

async function saveEnrichment(req, res, user, { id, data } = {}) {
  if (!data) return fail(res, 'بيانات ناقصة', 400);

  if (id) {
    let query = supabase.from('enrichment_content').update(data).eq('id', id);
    query = scopeToOwner(query, user);
    if (user.role !== 'admin') query = query.gte('created_at', windowCutoffIso(EDIT_WINDOW_HOURS.task));
    const { data: updated, error } = await query.select();
    if (error) return fail(res, 'تعذّر تعديل الإثراء', 500);
    if (!updated || updated.length === 0) return fail(res, 'انتهت مهلة التعديل (6 أيام) — راجع الأدمن', 403);
    await logAudit(user, 'saveEnrichment', `تعديل إثراء: ${id}`);
    return ok(res, { id });
  }

  if (!data.title || !data.content_type) {
    return fail(res, 'عنوان المحتوى ونوعه مطلوبان', 400);
  }

  const insertData = {
    ...data,
    employee_id: user.role === 'admin' && data.employee_id ? data.employee_id : user.employeeId,
    employee_name: user.role === 'admin' && data.employee_name ? data.employee_name : user.name
  };

  const { data: inserted, error } = await supabase.from('enrichment_content').insert(insertData).select().single();
  if (error) return fail(res, 'تعذّر إضافة الإثراء', 500);

  await logAudit(user, 'saveEnrichment', `إضافة إثراء: ${inserted.id} - ${inserted.title}`);
  return ok(res, inserted, 201);
}

async function deleteEnrichment(req, res, user, { id } = {}) {
  if (!id) return fail(res, 'معرّف الإثراء مطلوب', 400);

  let query = supabase.from('enrichment_content').delete().eq('id', id);
  query = scopeToOwner(query, user);
  if (user.role !== 'admin') query = query.gte('created_at', windowCutoffIso(DELETE_WINDOW_HOURS.task));
  const { data: deleted, error } = await query.select('id');
  if (error) return fail(res, 'تعذّر حذف الإثراء', 500);
  if (!deleted || deleted.length === 0) return fail(res, 'انتهت مهلة الحذف (6 ساعات) — راجع الأدمن', 403);

  await logAudit(user, 'deleteEnrichment', `حذف إثراء: ${id}`);
  return ok(res, { id });
}

/** من شاهد إثراء معيّن من الطلاب — يتحقق أولاً أن المعلم يملك هذا الإثراء (أو أدمن) */
async function getEnrichmentViews(req, res, user, { enrichmentId } = {}) {
  if (!enrichmentId) return fail(res, 'معرّف الإثراء مطلوب', 400);

  if (user.role !== 'admin') {
    const { data: owner, error: ownerErr } = await supabase
      .from('enrichment_content')
      .select('employee_id')
      .eq('id', enrichmentId)
      .maybeSingle();
    if (ownerErr || !owner) return fail(res, 'الإثراء غير موجود', 404);
    if (owner.employee_id !== user.employeeId) return fail(res, 'لا تملك صلاحية عرض هذا الإثراء', 403);
  }

  const { data, error } = await supabase
    .from('enrichment_views')
    .select('student_id, is_seen, seen_at, students(name_ar)')
    .eq('enrichment_id', enrichmentId);

  if (error) return fail(res, 'تعذّر جلب إحصائية المشاهدة', 500);
  return ok(res, data);
}
