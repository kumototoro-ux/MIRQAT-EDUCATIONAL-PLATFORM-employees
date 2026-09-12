import supabase from '../lib/supabase.js';
import { getSessionUser } from '../lib/jwt.js';
import { ok, fail } from '../lib/response.js';
import { applyEmployeeScope } from '../lib/scope.js';

/**
 * Actions:
 *  - getAuditLog             { filters? }     → أدمن فقط (افتراضيًا آخر 7 أيام)
 *  - getAuditActionTypes     {}               → أدمن فقط
 *  - getTeacherActivitySummary { employeeId? } → أدمن أو المعلم لنفسه فقط
 *  - getDashboardSummary     {}               → أرقام عامة، مقيّدة بنطاق المعلم تلقائيًا
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 'Method not allowed', 405);

  const user = getSessionUser(req);
  if (!user) return fail(res, 'الجلسة غير صالحة أو منتهية', 401);

  const { action, ...body } = req.body || {};

  try {
    switch (action) {
      case 'getAuditLog':
        return await getAuditLog(req, res, user, body);
      case 'getAuditActionTypes':
        return await getAuditActionTypes(req, res, user);
      case 'getTeacherActivitySummary':
        return await getTeacherActivitySummary(req, res, user, body);
      case 'getDashboardSummary':
        return await getDashboardSummary(req, res, user);
      default:
        return fail(res, 'إجراء غير معروف', 400);
    }
  } catch (e) {
    console.error('audit.js error:', e);
    return fail(res, 'حدث خطأ في الخادم', 500);
  }
}

function requireAdmin(user) {
  return user.role === 'admin';
}

/* ---------------- سجل التتبع ---------------- */
async function getAuditLog(req, res, user, { filters = {} } = {}) {
  if (!requireAdmin(user)) return fail(res, 'هذا الإجراء يتطلب صلاحية أدمن', 403);

  let query = supabase.from('audit_log').select('*');

  if (filters.empId) query = query.eq('emp_id', filters.empId);
  if (filters.action) query = query.eq('action', filters.action);

  if (filters.dateFrom || filters.dateTo) {
    if (filters.dateFrom) query = query.gte('ts', filters.dateFrom);
    if (filters.dateTo) query = query.lte('ts', filters.dateTo);
  } else {
    // افتراضيًا آخر 7 أيام إن لم يحدَّد نطاق تاريخ
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    query = query.gte('ts', sevenDaysAgo);
  }

  query = query.order('ts', { ascending: false }).limit(500);

  const { data, error } = await query;
  if (error) return fail(res, 'تعذّر جلب سجل التتبع', 500);
  return ok(res, data);
}

async function getAuditActionTypes(req, res, user) {
  if (!requireAdmin(user)) return fail(res, 'هذا الإجراء يتطلب صلاحية أدمن', 403);

  const { data, error } = await supabase.from('audit_log').select('action').limit(2000);
  if (error) return fail(res, 'تعذّر جلب أنواع الإجراءات', 500);

  const types = [...new Set(data.map(r => r.action).filter(Boolean))].sort();
  return ok(res, types);
}

/* ---------------- ملخص نشاط معلم ---------------- */
async function getTeacherActivitySummary(req, res, user, { employeeId } = {}) {
  const targetId = employeeId || user.employeeId;
  if (!requireAdmin(user) && targetId !== user.employeeId) {
    return fail(res, 'يمكنك عرض ملخص نشاطك الخاص فقط', 403);
  }
  if (!targetId) return fail(res, 'معرّف الموظف مطلوب', 400);

  const countFor = async (table) => {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('employee_id', targetId);
    return error ? 0 : (count || 0);
  };

  const [tasks, enrichments, gradingRecords, attendanceRecords, behaviorRecords] = await Promise.all([
    countFor('task_assignments'),
    countFor('enrichment_content'),
    countFor('daily_follow_up'),
    countFor('attendance'),
    countFor('behavior')
  ]);

  return ok(res, { employeeId: targetId, tasks, enrichments, gradingRecords, attendanceRecords, behaviorRecords });
}

/* ---------------- ملخص لوحة التحكم ---------------- */
async function getDashboardSummary(req, res, user) {
  let studentsQuery = supabase.from('students').select('*', { count: 'exact', head: true }).is('deleted_at', null);
  studentsQuery = applyEmployeeScope(studentsQuery, user);
  const { count: studentsCount } = await studentsQuery;

  let pendingTasksQuery = supabase.from('task_assignments').select('*', { count: 'exact', head: true }).eq('is_graded', false);
  if (user.role !== 'admin') pendingTasksQuery = pendingTasksQuery.eq('employee_id', user.employeeId);
  const { count: pendingTasksCount } = await pendingTasksQuery;

  const today = new Date().toISOString().slice(0, 10);
  let todayAttendanceQuery = supabase.from('attendance').select('*', { count: 'exact', head: true }).gte('recorded_at', today);
  if (user.role !== 'admin') todayAttendanceQuery = todayAttendanceQuery.eq('employee_id', user.employeeId);
  const { count: todayAttendanceCount } = await todayAttendanceQuery;

  const summary = {
    studentsCount: studentsCount || 0,
    pendingTasksCount: pendingTasksCount || 0,
    todayAttendanceCount: todayAttendanceCount || 0
  };

  if (user.role === 'admin') {
    const { count: employeesCount } = await supabase
      .from('employees').select('*', { count: 'exact', head: true }).is('deleted_at', null);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: recentAuditCount } = await supabase
      .from('audit_log').select('*', { count: 'exact', head: true }).gte('ts', sevenDaysAgo);

    summary.employeesCount = employeesCount || 0;
    summary.recentAuditCount = recentAuditCount || 0;
  }

  return ok(res, summary);
}
