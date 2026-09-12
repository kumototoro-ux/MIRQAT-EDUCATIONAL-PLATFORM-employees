import crypto from 'crypto';
import supabase from '../lib/supabase.js';
import { getSessionUser } from '../lib/jwt.js';
import { ok, fail } from '../lib/response.js';
import { logAudit } from '../lib/audit.js';
import { applyEmployeeScope } from '../lib/scope.js';
import { applyPagination, paginatedResult } from '../lib/paginate.js';
import { windowCutoffIso, EDIT_WINDOW_HOURS, DELETE_WINDOW_HOURS } from '../lib/timeWindow.js';
import { resolveCurrentWeek, getWeeksUpToToday, formatWeekLabel } from '../lib/academicWeek.js';

/**
 * كل شيء هنا مبني حول "المادة" — المعلم لا يرى ولا يرصد إلا لمواده المسندة
 * (user.subject مفكوكة بفاصلة). الواجهة تبني تبويبات مواد من هذا الحقل.
 *
 * Actions:
 *  - getRoster           { filters }                     → طلاب شعبة لرصد درجاتهم
 *  - saveRoster           { records: [...] }              → رصد جماعي (يدوي أو مشاركة)
 *  - getGradingRecords    { filters?, page?, pageSize? }  → سجل الرصد (مُرقَّم)
 *  - getFinishedWeekRecords{ subject, term? }             → سجلات آخر أسبوع دراسي منتهٍ لمادة
 *  - updateRosterRecords  { updates: [{id,data}] }        → مقيّد بنافذة 6 أيام تعديل
 *  - deleteRosterRecords  { ids: [...] }                  → مقيّد بنافذة 6 ساعات حذف
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 'Method not allowed', 405);

  const user = getSessionUser(req);
  if (!user) return fail(res, 'الجلسة غير صالحة أو منتهية', 401);

  const { action, ...body } = req.body || {};

  try {
    switch (action) {
      case 'getRoster':
        return await getRoster(req, res, user, body);
      case 'saveRoster':
        return await saveRoster(req, res, user, body);
      case 'getGradingRecords':
        return await getGradingRecords(req, res, user, body);
      case 'getGradingBatchDetail':
        return await getGradingBatchDetail(req, res, user, body);
      case 'getFinishedWeekRecords':
        return await getFinishedWeekRecords(req, res, user, body);
      case 'getStats':
        return await getStats(req, res, user, body);
      case 'getOverview':
        return await getOverview(req, res, user);
      case 'getFilteredStats':
        return await getFilteredStats(req, res, user, body);
      case 'updateRosterRecords':
        return await updateRosterRecords(req, res, user, body);
      case 'deleteRosterRecords':
        return await deleteRosterRecords(req, res, user, body);
      default:
        return fail(res, 'إجراء غير معروف', 400);
    }
  } catch (e) {
    console.error('grading.js error:', e);
    return fail(res, 'حدث خطأ في الخادم', 500);
  }
}

function scopeToOwner(query, user, col = 'employee_id') {
  if (user.role === 'admin') return query;
  return query.eq(col, user.employeeId);
}

/** يتحقق أن المادة المطلوبة ضمن مواد المعلم المسندة (الأدمن معفى) */
function requireSubjectAccess(user, subject) {
  if (user.role === 'admin') return true;
  if (!subject || !user.subject) return false;
  const mySubjects = user.subject.split(',').map(s => s.trim());
  return mySubjects.includes(subject.trim());
}

/* ---------------- طلاب الشعبة لرصد درجاتهم ---------------- */
async function getRoster(req, res, user, { filters = {} } = {}) {
  if (filters.subject && !requireSubjectAccess(user, filters.subject)) {
    return fail(res, 'لا تملك صلاحية على هذه المادة', 403);
  }

  let query = supabase.from('students').select('id, name_ar, branch, stages, grades, sections').is('deleted_at', null);
  query = applyEmployeeScope(query, user);

  if (filters.branch) query = query.eq('branch', filters.branch);
  if (filters.stages) query = query.eq('stages', filters.stages);
  if (filters.grades) query = query.eq('grades', filters.grades);
  if (filters.sections) query = query.eq('sections', filters.sections);

  query = query.order('name_ar', { ascending: true });

  const { data, error } = await query;
  if (error) return fail(res, 'تعذّر جلب قائمة الطلاب', 500);
  return ok(res, data);
}

/* ---------------- رصد جماعي (يدوي أو مشاركة) ---------------- */
async function saveRoster(req, res, user, { records } = {}) {
  if (!Array.isArray(records) || records.length === 0) {
    return fail(res, 'لا يوجد درجات لحفظها', 400);
  }

  const subject = records[0]?.subject;
  if (!requireSubjectAccess(user, subject)) {
    return fail(res, 'لا تملك صلاحية على هذه المادة', 403);
  }

  const batchId = crypto.randomUUID();
  const rows = records.map(r => ({
    student_id: r.student_id,
    student_name: r.student_name || null,
    branch: r.branch || null,
    stages: r.stages || null,
    grades: r.grades || null,
    sections: r.sections || null,
    subject: r.subject || null,
    term: r.term || null,
    week: r.week || null,
    eval_type: r.eval_type || null,
    task_name: r.task_name || null,
    earned_score: r.earned_score,
    max_score: r.max_score,
    recorded_date: r.recorded_date || new Date().toISOString().slice(0, 10),
    employee_id: user.employeeId,
    employee_name: user.name,
    batch_id: batchId
  }));

  const { data, error } = await supabase.from('daily_follow_up').insert(rows).select();
  if (error) return fail(res, 'تعذّر حفظ الدرجات', 500);

  await logAudit(user, 'saveRoster', `رصد درجات ${rows.length} طالب - ${rows[0]?.task_name || ''}`);
  return ok(res, data, 201);
}

/* ---------------- سجل الرصد (مُرقَّم، بفلاتر ترم/أسبوع/تاريخ) ---------------- */
/* ---------------- سجل الرصد مُجمَّع ككشوفات (كشف واحد لكل عملية رصد) ---------------- */
async function getGradingRecords(req, res, user, { filters = {} } = {}) {
  if (filters.subject && !requireSubjectAccess(user, filters.subject)) {
    return fail(res, 'لا تملك صلاحية على هذه المادة', 403);
  }
  if (!filters.subject || !filters.term || !filters.week) {
    return fail(res, 'اختر المادة والترم والأسبوع أولًا', 400);
  }

  let query = supabase.from('daily_follow_up').select('*');
  query = scopeToOwner(query, user);
  if (user.role === 'admin' && filters.employeeId) query = query.eq('employee_id', filters.employeeId);

  query = query.eq('subject', filters.subject).eq('term', filters.term).eq('week', filters.week);
  if (filters.recordedDate) query = query.eq('recorded_date', filters.recordedDate);
  if (filters.evalType) query = query.eq('eval_type', filters.evalType);

  query = query.order('recorded_date', { ascending: false });

  const { data, error } = await query.limit(5000);
  if (error) return fail(res, 'تعذّر جلب سجلات الرصد', 500);

  const now = Date.now();
  const groups = new Map();
  (data || []).forEach(r => {
    const key = r.batch_id || ('legacy-' + r.id);
    if (!groups.has(key)) {
      groups.set(key, {
        batch_id: key,
        task_name: r.task_name, eval_type: r.eval_type, subject: r.subject,
        branch: r.branch, grades: r.grades, sections: r.sections,
        term: r.term, week: r.week, recorded_date: r.recorded_date,
        employee_name: r.employee_name, employee_id: r.employee_id,
        max_score: r.max_score, created_at: r.created_at, studentCount: 0
      });
    }
    const g = groups.get(key);
    g.studentCount += 1;
    if (new Date(r.created_at) < new Date(g.created_at)) g.created_at = r.created_at;
  });

  const rows = Array.from(groups.values()).map(g => ({
    ...g,
    can_edit: user.role === 'admin' || (now - new Date(g.created_at).getTime()) < EDIT_WINDOW_HOURS.grading * 3600 * 1000,
    can_delete: user.role === 'admin' || (now - new Date(g.created_at).getTime()) < DELETE_WINDOW_HOURS.grading * 3600 * 1000
  })).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return ok(res, paginatedResult(rows, rows.length, 1, rows.length || 1));
}

/* ---------------- تفاصيل كشف رصد واحد (كل الطلاب) ---------------- */
async function getGradingBatchDetail(req, res, user, { batchId } = {}) {
  if (!batchId) return fail(res, 'معرّف الكشف مطلوب', 400);

  let query;
  if (batchId.startsWith('legacy-')) {
    query = supabase.from('daily_follow_up').select('*').eq('id', batchId.replace('legacy-', ''));
  } else {
    query = supabase.from('daily_follow_up').select('*').eq('batch_id', batchId);
  }
  query = scopeToOwner(query, user);

  const { data, error } = await query.order('student_name', { ascending: true });
  if (error) return fail(res, 'تعذّر جلب تفاصيل الكشف', 500);
  if (!data.length) return fail(res, 'الكشف غير موجود أو لا تملك صلاحية عرضه', 404);

  const now = Date.now();
  const rows = data.map(r => ({
    ...r,
    can_edit: user.role === 'admin' || (now - new Date(r.created_at).getTime()) < EDIT_WINDOW_HOURS.grading * 3600 * 1000,
    can_delete: user.role === 'admin' || (now - new Date(r.created_at).getTime()) < DELETE_WINDOW_HOURS.grading * 3600 * 1000
  }));

  return ok(res, rows);
}

/* ---------------- إحصائيات سريعة (عدّ فقط) — تظهر فورًا بلا اختيار معلم/مادة ---------------- */
async function getStats(req, res, user) {
  if (user.role !== 'admin') return fail(res, 'الإحصائيات العامة مقيّدة بصلاحية أدمن فقط', 403);
  const currentWeek = await resolveCurrentWeek();

  let previousWeek = null;
  if (currentWeek) {
    const { data } = await supabase
      .from('school_calendar')
      .select('term, week')
      .lt('week_start_date', currentWeek.week_start_date)
      .order('week_start_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    previousWeek = data;
  }

  const { data: evalRows } = await supabase.from('settings_lists').select('value').eq('list_key', 'continuous_eval_types');
  const evalTypes = (evalRows || []).map(r => r.value);

  const recentWeeks = await getWeeksUpToToday(6);

  // استعلام واحد يجيب كل الصفوف اللازمة (بدل عشرات الاستعلامات المنفصلة)
  let rowsQuery = supabase.from('daily_follow_up').select('term, week, eval_type');
  rowsQuery = scopeToOwner(rowsQuery, user);
  const { data: rows } = await rowsQuery.limit(20000);
  const allRows = rows || [];

  const matchWeek = (r, w) => w && r.term === w.term && r.week === w.week;

  const totalAllTime = allRows.length;
  const totalThisWeek = currentWeek ? allRows.filter(r => matchWeek(r, currentWeek)).length : 0;
  const totalPreviousWeek = previousWeek ? allRows.filter(r => matchWeek(r, previousWeek)).length : 0;

  const byEvalType = evalTypes.map(et => ({
    label: et,
    count: currentWeek ? allRows.filter(r => matchWeek(r, currentWeek) && r.eval_type === et).length : 0
  })).filter(e => e.count > 0);

  const weeklyTrend = recentWeeks.map(w => ({
    label: formatWeekLabel(w),
    count: allRows.filter(r => matchWeek(r, w)).length
  }));

  return ok(res, { currentWeek, totalAllTime, totalThisWeek, totalPreviousWeek, byEvalType, weeklyTrend });
}

/* ---------------- نظرة عامة على كل الفروع: متوسط الأداء الفعلي — استعلام واحد فقط ---------------- */
async function getOverview(req, res, user) {
  if (user.role !== 'admin') return fail(res, 'الإحصائيات العامة مقيّدة بصلاحية أدمن فقط', 403);
  const { data: branchRows } = await supabase.from('settings_lists').select('value').eq('list_key', 'branches');
  const branches = (branchRows || []).map(r => r.value);

  let q = supabase.from('daily_follow_up').select('branch, term, week, earned_score, max_score');
  q = scopeToOwner(q, user);
  const { data: rows, error } = await q.limit(20000);
  if (error) return fail(res, 'تعذّر جلب النظرة العامة', 500);
  const allRows = rows || [];

  const perBranch = branches.map(branch => {
    const branchRowsData = allRows.filter(r => r.branch === branch);
    const valid = branchRowsData.filter(r => r.max_score > 0);
    const avgPct = valid.length
      ? Math.round((valid.reduce((sum, r) => sum + (r.earned_score / r.max_score) * 100, 0) / valid.length) * 10) / 10
      : 0;
    return { branch, total: branchRowsData.length, avgPct };
  });

  const weeks = await getWeeksUpToToday(12);
  const trendByBranch = branches.map(branch => ({
    branch,
    series: weeks.map(w => ({
      label: formatWeekLabel(w),
      count: allRows.filter(r => r.branch === branch && r.term === w.term && r.week === w.week).length
    }))
  }));

  return ok(res, { branches, perBranch, trendByBranch });
}


/* ---------------- إحصائيات مخصصة حسب فلتر محدد ---------------- */
async function getFilteredStats(req, res, user, { branch, term, week, subject, grades } = {}) {
  if (user.role !== 'admin') return fail(res, 'الإحصائيات العامة مقيّدة بصلاحية أدمن فقط', 403);
  let q = supabase.from('daily_follow_up').select('earned_score, max_score, eval_type');
  q = scopeToOwner(q, user);
  if (branch) q = q.eq('branch', branch);
  if (term) q = q.eq('term', term);
  if (week) q = q.eq('week', week);
  if (subject) q = q.eq('subject', subject);
  if (grades) q = q.eq('grades', grades);
  q = q.limit(5000);

  const { data: rows, error } = await q;
  if (error) return fail(res, 'تعذّر جلب الإحصائيات', 500);

  const valid = (rows || []).filter(r => r.max_score > 0);
  const avgPct = valid.length
    ? Math.round((valid.reduce((sum, r) => sum + (r.earned_score / r.max_score) * 100, 0) / valid.length) * 10) / 10
    : 0;

  const byEvalTypeMap = {};
  (rows || []).forEach(r => { byEvalTypeMap[r.eval_type] = (byEvalTypeMap[r.eval_type] || 0) + 1; });
  const byEvalType = Object.entries(byEvalTypeMap).map(([label, count]) => ({ label, count }));

  return ok(res, { total: (rows || []).length, avgPct, byEvalType });
}

/* ---------------- سجلات آخر أسبوع دراسي منتهٍ لمادة معيّنة ---------------- */
async function getFinishedWeekRecords(req, res, user, { subject, term, employeeId } = {}) {
  if (!subject) return fail(res, 'المادة مطلوبة', 400);
  if (!requireSubjectAccess(user, subject)) return fail(res, 'لا تملك صلاحية على هذه المادة', 403);

  const today = new Date().toISOString().slice(0, 10);
  let calQuery = supabase
    .from('school_calendar')
    .select('term, week, week_end_date')
    .lt('week_end_date', today)
    .order('week_end_date', { ascending: false })
    .limit(1);
  if (term) calQuery = calQuery.eq('term', term);

  const { data: lastWeek, error: calError } = await calQuery.maybeSingle();
  if (calError) return fail(res, 'تعذّر تحديد آخر أسبوع منتهٍ', 500);
  if (!lastWeek) return ok(res, { week: null, records: [] });

  let query = supabase.from('daily_follow_up').select('*')
    .eq('subject', subject)
    .eq('term', lastWeek.term)
    .eq('week', lastWeek.week);
  query = scopeToOwner(query, user);
  if (user.role === 'admin' && employeeId) query = query.eq('employee_id', employeeId);

  const { data, error } = await query.order('recorded_date', { ascending: false });
  if (error) return fail(res, 'تعذّر جلب سجلات الأسبوع المنتهي', 500);

  return ok(res, { week: lastWeek, records: data });
}

/* ---------------- تعديل جماعي — مقيّد بنافذة 6 أيام لغير الأدمن ---------------- */
async function updateRosterRecords(req, res, user, { updates } = {}) {
  if (!Array.isArray(updates) || updates.length === 0) {
    return fail(res, 'لا يوجد تعديلات لتطبيقها', 400);
  }

  const cutoff = windowCutoffIso(EDIT_WINDOW_HOURS.grading);

  const results = await Promise.all(updates.map(async ({ id, data }) => {
    if (!id || !data) return { id, ok: false, reason: 'بيانات ناقصة' };

    let query = supabase.from('daily_follow_up')
      .update({ ...data, is_edited: true, edited_date: new Date().toISOString() })
      .eq('id', id);
    query = scopeToOwner(query, user);
    if (user.role !== 'admin') query = query.gte('created_at', cutoff);

    const { data: updated, error } = await query.select();
    if (error) return { id, ok: false, reason: 'خطأ في الخادم' };
    if (!updated || updated.length === 0) {
      return { id, ok: false, reason: 'انتهت مهلة التعديل (6 أيام) — راجع الأدمن' };
    }
    return { id, ok: true };
  }));

  const failed = results.filter(r => !r.ok);
  await logAudit(user, 'updateRosterRecords', `تعديل ${results.length - failed.length} درجة`);

  if (failed.length > 0) {
    return ok(res, { updated: results.length - failed.length, failed }, 207);
  }
  return ok(res, { updated: results.length });
}

/* ---------------- حذف جماعي — مقيّد بنافذة 6 ساعات لغير الأدمن ---------------- */
async function deleteRosterRecords(req, res, user, { ids } = {}) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return fail(res, 'لا يوجد سجلات للحذف', 400);
  }

  const cutoff = windowCutoffIso(DELETE_WINDOW_HOURS.grading);

  let query = supabase.from('daily_follow_up').delete().in('id', ids);
  query = scopeToOwner(query, user);
  if (user.role !== 'admin') query = query.gte('created_at', cutoff);

  const { data: deleted, error } = await query.select('id');
  if (error) return fail(res, 'تعذّر حذف السجلات', 500);

  const deletedCount = deleted?.length || 0;
  await logAudit(user, 'deleteRosterRecords', `حذف ${deletedCount} سجل درجات`);

  if (deletedCount < ids.length) {
    return ok(res, {
      deleted: deletedCount,
      failed: ids.length - deletedCount,
      note: 'بعض السجلات تجاوزت مهلة الحذف (6 ساعات) — راجع الأدمن لحذفها'
    }, 207);
  }
  return ok(res, { deleted: deletedCount });
}
