import supabase from '../lib/supabase.js';
import { getSessionUser } from '../lib/jwt.js';
import { ok, fail } from '../lib/response.js';
import { logAudit } from '../lib/audit.js';
import { applyEmployeeScope } from '../lib/scope.js';
import { applyPagination, paginatedResult } from '../lib/paginate.js';
import { windowCutoffIso, EDIT_WINDOW_HOURS, DELETE_WINDOW_HOURS } from '../lib/timeWindow.js';
import { resolveCurrentWeek, getWeeksUpToToday, formatWeekLabel } from '../lib/academicWeek.js';

/**
 * Actions:
 *  - getRoster              { filters }                 → طلاب شعبة الموظف (مقيّد بنطاقه تلقائيًا)
 *  - saveAttendanceRoster   { records: [...] }           → حفظ تحضير حصة كاملة دفعة واحدة
 *  - getAttendanceRecords   { filters?, page?, pageSize?}→ سجلات الموظف نفسه (أدمن يرى الكل) — مُرقَّم
 *  - getFinishedWeekRecords { branch?, term? }           → سجلات آخر أسبوع دراسي منتهٍ
 *  - updateAttendanceRecords{ updates: [{id, data}] }    → مقيّد بنافذة 3 أيام تعديل
 *  - deleteAttendanceRecords{ ids: [...] }               → مقيّد بنافذة 6 ساعات حذف
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
      case 'saveAttendanceRoster':
        return await saveAttendanceRoster(req, res, user, body);
      case 'getAttendanceRecords':
        return await getAttendanceRecords(req, res, user, body);
      case 'getFinishedWeekRecords':
        return await getFinishedWeekRecords(req, res, user, body);
      case 'getStats':
        return await getStats(req, res, user, body);
      case 'getOverview':
        return await getOverview(req, res, user);
      case 'getFilteredStats':
        return await getFilteredStats(req, res, user, body);
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

/* ---------------- طلاب شعبة الموظف (مقيّد بنطاقه) ---------------- */
async function getRoster(req, res, user, { filters = {} } = {}) {
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

/* ---------------- سجلات الموظف نفسه (أدمن يرى الكل مع فلاتر) — مُرقَّم ---------------- */
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
  if (filters.day) query = query.eq('day', filters.day);

  query = query.order('recorded_at', { ascending: false });

  const paged = applyPagination(query, { page, pageSize });
  const { data, error, count } = await paged.query;
  if (error) return fail(res, 'تعذّر جلب السجلات', 500);

  const now = Date.now();
  const editableRows = data.map(r => ({
    ...r,
    can_edit: user.role === 'admin' || (now - new Date(r.recorded_at).getTime()) < EDIT_WINDOW_HOURS.attendance * 3600 * 1000,
    can_delete: user.role === 'admin' || (now - new Date(r.recorded_at).getTime()) < DELETE_WINDOW_HOURS.attendance * 3600 * 1000
  }));

  return ok(res, paginatedResult(editableRows, count, paged.page, paged.pageSize));
}

/* ---------------- إحصائيات سريعة (عدّ فقط — بلا جلب صفوف) للأسبوع الدراسي الحالي — أدمن فقط ---------------- */
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

  const { data: statusRows } = await supabase.from('settings_lists').select('value').eq('list_key', 'attendance_statuses');
  const statuses = (statusRows || []).map(r => r.value);

  const recentWeeks = await getWeeksUpToToday(6);

  // استعلام واحد يجيب كل الصفوف المطلوبة (بدل عشرات الاستعلامات المنفصلة لكل أسبوع/حالة)
  let rowsQuery = supabase.from('attendance').select('status, term, week');
  if (user.role !== 'admin') rowsQuery = rowsQuery.eq('employee_id', user.employeeId);
  const { data: rows } = await rowsQuery.limit(20000);
  const allRows = rows || [];

  const matchWeek = (r, w) => w && r.term === w.term && r.week === w.week;

  const total = currentWeek ? allRows.filter(r => matchWeek(r, currentWeek)).length : 0;
  const totalPreviousWeek = previousWeek ? allRows.filter(r => matchWeek(r, previousWeek)).length : 0;
  const byStatus = statuses.map(s => ({
    label: s,
    count: currentWeek ? allRows.filter(r => matchWeek(r, currentWeek) && r.status === s).length : 0
  }));

  const weeklyTrend = recentWeeks.map(w => ({
    label: formatWeekLabel(w),
    count: allRows.filter(r => matchWeek(r, w)).length
  }));

  return ok(res, { currentWeek, total, totalPreviousWeek, byStatus, weeklyTrend });
}

/* ---------------- نظرة عامة على كل الفروع (من أول أسبوع لآخر أسبوع حالي) — استعلام واحد فقط ---------------- */
async function getOverview(req, res, user) {
  if (user.role !== 'admin') return fail(res, 'الإحصائيات العامة مقيّدة بصلاحية أدمن فقط', 403);
  const { data: branchRows } = await supabase.from('settings_lists').select('value').eq('list_key', 'branches');
  const { data: statusRows } = await supabase.from('settings_lists').select('value').eq('list_key', 'attendance_statuses');
  const branches = (branchRows || []).map(r => r.value);
  const statuses = (statusRows || []).map(r => r.value);

  let q = supabase.from('attendance').select('branch, status, term, week');
  if (user.role !== 'admin') q = q.eq('employee_id', user.employeeId);
  const { data: rows, error } = await q.limit(20000);
  if (error) return fail(res, 'تعذّر جلب النظرة العامة', 500);
  const allRows = rows || [];

  const perBranch = branches.map(branch => {
    const branchRowsData = allRows.filter(r => r.branch === branch);
    const total = branchRowsData.length;
    const byStatus = statuses.map(s => {
      const count = branchRowsData.filter(r => r.status === s).length;
      return { label: s, count, pct: total ? Math.round((count / total) * 1000) / 10 : 0 };
    });
    return { branch, total, byStatus };
  });

  const weeks = await getWeeksUpToToday(12);
  const trendByBranch = branches.map(branch => ({
    branch,
    series: weeks.map(w => ({
      label: formatWeekLabel(w),
      count: allRows.filter(r => r.branch === branch && r.term === w.term && r.week === w.week).length
    }))
  }));

  return ok(res, { branches, statuses, perBranch, trendByBranch });
}

/* ---------------- إحصائيات مخصصة حسب فلتر محدد — استعلام واحد فقط ---------------- */
async function getFilteredStats(req, res, user, { branch, term, week, day, grades } = {}) {
  if (user.role !== 'admin') return fail(res, 'الإحصائيات العامة مقيّدة بصلاحية أدمن فقط', 403);
  const { data: statusRows } = await supabase.from('settings_lists').select('value').eq('list_key', 'attendance_statuses');
  const statuses = (statusRows || []).map(r => r.value);

  let q = supabase.from('attendance').select('status');
  if (user.role !== 'admin') q = q.eq('employee_id', user.employeeId);
  if (branch) q = q.eq('branch', branch);
  if (term) q = q.eq('term', term);
  if (week) q = q.eq('week', week);
  if (day) q = q.eq('day', day);
  const { data: rows, error } = await q.limit(20000);
  if (error) return fail(res, 'تعذّر جلب الإحصائيات', 500);
  const allRows = rows || [];

  const byStatus = statuses.map(s => ({ label: s, count: allRows.filter(r => r.status === s).length }));

  return ok(res, { total: allRows.length, byStatus });
}


/* ---------------- سجلات آخر أسبوع دراسي منتهٍ ---------------- */
async function getFinishedWeekRecords(req, res, user, { term } = {}) {
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

  let query = supabase.from('attendance').select('*')
    .eq('term', lastWeek.term)
    .eq('week', lastWeek.week);
  if (user.role !== 'admin') query = query.eq('employee_id', user.employeeId);

  const { data, error } = await query.order('recorded_at', { ascending: false });
  if (error) return fail(res, 'تعذّر جلب سجلات الأسبوع المنتهي', 500);

  return ok(res, { week: lastWeek, records: data });
}

/* ---------------- تعديل جماعي — مقيّد بنافذة 3 أيام لغير الأدمن ---------------- */
async function updateAttendanceRecords(req, res, user, { updates } = {}) {
  if (!Array.isArray(updates) || updates.length === 0) {
    return fail(res, 'لا يوجد تعديلات لتطبيقها', 400);
  }

  const cutoff = windowCutoffIso(EDIT_WINDOW_HOURS.attendance);

  const results = await Promise.all(updates.map(async ({ id, data }) => {
    if (!id || !data) return { id, ok: false, reason: 'بيانات ناقصة' };

    let query = supabase.from('attendance').update({ ...data, is_edited: true }).eq('id', id);
    if (user.role !== 'admin') {
      query = query.eq('employee_id', user.employeeId).gte('recorded_at', cutoff);
    }

    const { data: updated, error } = await query.select();
    if (error) return { id, ok: false, reason: 'خطأ في الخادم' };
    if (!updated || updated.length === 0) {
      return { id, ok: false, reason: 'انتهت مهلة التعديل (3 أيام) — راجع الأدمن' };
    }
    return { id, ok: true };
  }));

  const failed = results.filter(r => !r.ok);
  await logAudit(user, 'updateAttendanceRecords', `تعديل ${results.length - failed.length} سجل تحضير`);

  if (failed.length > 0) {
    return ok(res, { updated: results.length - failed.length, failed }, 207);
  }
  return ok(res, { updated: results.length });
}

/* ---------------- حذف جماعي — مقيّد بنافذة 6 ساعات لغير الأدمن ---------------- */
async function deleteAttendanceRecords(req, res, user, { ids } = {}) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return fail(res, 'لا يوجد سجلات للحذف', 400);
  }

  const cutoff = windowCutoffIso(DELETE_WINDOW_HOURS.attendance);

  let query = supabase.from('attendance').delete().in('id', ids);
  if (user.role !== 'admin') {
    query = query.eq('employee_id', user.employeeId).gte('recorded_at', cutoff);
  }

  const { data: deleted, error } = await query.select('id');
  if (error) return fail(res, 'تعذّر حذف السجلات', 500);

  const deletedCount = deleted?.length || 0;
  await logAudit(user, 'deleteAttendanceRecords', `حذف ${deletedCount} سجل تحضير`);

  if (deletedCount < ids.length) {
    return ok(res, {
      deleted: deletedCount,
      failed: ids.length - deletedCount,
      note: 'بعض السجلات تجاوزت مهلة الحذف (6 ساعات) — راجع الأدمن لحذفها'
    }, 207);
  }
  return ok(res, { deleted: deletedCount });
}
