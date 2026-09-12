import supabase from '../lib/supabase.js';
import { getSessionUser } from '../lib/jwt.js';
import { ok, fail } from '../lib/response.js';
import { logAudit } from '../lib/audit.js';
import { applyPagination, paginatedResult } from '../lib/paginate.js';

/**
 * Actions:
 *  - getAttendance          { filters? }              → عرض عام مفلتر (فرع/ترم/اسبوع/مادة/طالب)
 *  - saveAttendanceRoster   { records: [...] }         → حفظ تحضير حصة كاملة دفعة واحدة
 *  - getAttendanceRecords   { filters? }               → سجلات المعلم نفسه (أدمن يرى الكل)
 *  - updateAttendanceRecords{ updates: [{id, data}] }  → تعديل جماعي (مقيّد بصاحب السجل ما لم يكن أدمن)
 *  - deleteAttendanceRecords{ ids: [...] }             → حذف جماعي (نفس التقييد)
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 'Method not allowed', 405);

  const user = getSessionUser(req);
  if (!user) return fail(res, 'الجلسة غير صالحة أو منتهية', 401);

  const { action, ...body } = req.body || {};

  try {
    switch (action) {
      case 'getAttendance':
        return await getAttendance(req, res, body);
      case 'saveAttendanceRoster':
        return await saveAttendanceRoster(req, res, user, body);
      case 'getAttendanceRecords':
        return await getAttendanceRecords(req, res, user, body);
      case 'updateAttendanceRecords':
        return await updateAttendanceRecords(req, res, user, body);
      case 'deleteAttendanceRecords':
        return await deleteAttendanceRecords(req, res, user, body);
      default:
        return fail(res, 'إجراء غير معروف', 400);
    }
  } catch (e) {
    console.error('attendance.js error:', e);
    return fail(res, 'حدث خطأ في الخادم', 500);
  }
}

/* ---------------- عرض عام (بدون تقييد بصاحب السجل) ---------------- */
async function getAttendance(req, res, { filters = {} } = {}) {
  let query = supabase.from('attendance').select('*');

  if (filters.branch) query = query.eq('branch', filters.branch);
  if (filters.term) query = query.eq('term', filters.term);
  if (filters.week) query = query.eq('week', filters.week);
  if (filters.subject) query = query.eq('subject', filters.subject);
  if (filters.studentId) query = query.eq('student_id', filters.studentId);

  query = query.order('recorded_at', { ascending: false });

  const { data, error } = await query;
  if (error) return fail(res, 'تعذّر جلب سجلات التحضير', 500);
  return ok(res, data);
}

/* ---------------- حفظ تحضير حصة كاملة (روستر) ---------------- */
async function saveAttendanceRoster(req, res, user, { records } = {}) {
  if (!Array.isArray(records) || records.length === 0) {
    return fail(res, 'لا يوجد سجلات لحفظها', 400);
  }

  const rows = records.map(r => ({
    student_id: r.student_id,
    student_name: r.student_name || null,
    branch: r.branch || null,
    term: r.term || null,
    week: r.week || null,
    day: r.day || null,
    period: r.period || null,
    status: r.status || null,
    note: r.note || null,
    subject: r.subject || null,
    employee_id: user.employeeId,
    employee_name: user.name,
    person_type: user.role
  }));

  const { data, error } = await supabase.from('attendance').insert(rows).select();
  if (error) return fail(res, 'تعذّر حفظ التحضير', 500);

  await logAudit(user, 'saveAttendanceRoster', `حفظ تحضير ${rows.length} طالب`);
  return ok(res, data, 201);
}

/* ---------------- سجلات المعلم نفسه (أدمن يرى الكل مع فلاتر) — مُرقَّم ---------------- */
async function getAttendanceRecords(req, res, user, { filters = {}, page, pageSize } = {}) {
  let query = supabase.from('attendance').select('*', { count: 'exact' });

  if (user.role !== 'admin') {
    query = query.eq('employee_id', user.employeeId);
  } else {
    if (filters.employeeId) query = query.eq('employee_id', filters.employeeId);
  }

  if (filters.branch) query = query.eq('branch', filters.branch);
  if (filters.term) query = query.eq('term', filters.term);
  if (filters.week) query = query.eq('week', filters.week);

  query = query.order('recorded_at', { ascending: false });

  const paged = applyPagination(query, { page, pageSize });
  const { data, error, count } = await paged.query;
  if (error) return fail(res, 'تعذّر جلب السجلات', 500);
  return ok(res, paginatedResult(data, count, paged.page, paged.pageSize));
}

/* ---------------- تعديل جماعي ---------------- */
async function updateAttendanceRecords(req, res, user, { updates } = {}) {
  if (!Array.isArray(updates) || updates.length === 0) {
    return fail(res, 'لا يوجد تعديلات لتطبيقها', 400);
  }

  const results = await Promise.all(updates.map(async ({ id, data }) => {
    if (!id || !data) return { id, ok: false };

    let query = supabase.from('attendance').update({ ...data, is_edited: true }).eq('id', id);
    if (user.role !== 'admin') query = query.eq('employee_id', user.employeeId);

    const { error } = await query;
    return { id, ok: !error };
  }));

  const failed = results.filter(r => !r.ok);
  await logAudit(user, 'updateAttendanceRecords', `تعديل ${results.length - failed.length} سجل تحضير`);

  if (failed.length > 0) {
    return ok(res, { updated: results.length - failed.length, failed: failed.map(f => f.id) }, 207);
  }
  return ok(res, { updated: results.length });
}

/* ---------------- حذف جماعي ---------------- */
async function deleteAttendanceRecords(req, res, user, { ids } = {}) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return fail(res, 'لا يوجد سجلات للحذف', 400);
  }

  let query = supabase.from('attendance').delete().in('id', ids);
  if (user.role !== 'admin') query = query.eq('employee_id', user.employeeId);

  const { error } = await query;
  if (error) return fail(res, 'تعذّر حذف السجلات', 500);

  await logAudit(user, 'deleteAttendanceRecords', `حذف ${ids.length} سجل تحضير`);
  return ok(res, { deleted: ids.length });
}
