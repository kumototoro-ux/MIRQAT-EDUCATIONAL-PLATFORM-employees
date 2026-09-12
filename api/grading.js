import supabase from '../lib/supabase.js';
import { getSessionUser } from '../lib/jwt.js';
import { ok, fail } from '../lib/response.js';
import { logAudit } from '../lib/audit.js';
import { applyEmployeeScope } from '../lib/scope.js';
import { applyPagination, paginatedResult } from '../lib/paginate.js';

/**
 * أي إضافة/تعديل/حذف هنا يُحدّث grade_aggregation تلقائيًا عبر trigger
 * في قاعدة البيانات (recalc_grade_aggregation_) — لا حاجة لأي كود إضافي هنا.
 *
 * Actions:
 *  - getRoster        { filters }              → طلاب شعبة معيّنة لرصد درجاتهم (مقيّد بنطاق المعلم)
 *  - saveRoster        { records: [...] }       → رصد جماعي لتكليف/تقييم واحد لكل الشعبة
 *  - getGradingRecords { filters? }             → سجلات المعلم نفسه (أدمن يرى الكل مع فلاتر)
 *  - updateRosterRecords{ updates: [{id,data}] } → تعديل جماعي (مقيّد بصاحب السجل)
 *  - deleteRosterRecords{ ids: [...] }          → حذف جماعي (نفس التقييد)
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

/* ---------------- طلاب الشعبة لرصد درجاتهم ---------------- */
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

/* ---------------- رصد جماعي ---------------- */
async function saveRoster(req, res, user, { records } = {}) {
  if (!Array.isArray(records) || records.length === 0) {
    return fail(res, 'لا يوجد درجات لحفظها', 400);
  }

  const rows = records.map(r => ({
    student_id: r.student_id,
    student_name: r.student_name || null,
    branch: r.branch || null,
    stages: r.stages || null,
    grades: r.grades || null,
    sections: r.sections || null,
    subject: r.subject || null,
    term: r.term || null,
    eval_type: r.eval_type || null,
    task_name: r.task_name || null,
    earned_score: r.earned_score,
    max_score: r.max_score,
    recorded_date: r.recorded_date || new Date().toISOString().slice(0, 10),
    employee_id: user.employeeId,
    employee_name: user.name
  }));

  const { data, error } = await supabase.from('daily_follow_up').insert(rows).select();
  if (error) return fail(res, 'تعذّر حفظ الدرجات', 500);

  await logAudit(user, 'saveRoster', `رصد درجات ${rows.length} طالب - ${rows[0]?.task_name || ''}`);
  return ok(res, data, 201);
}

/* ---------------- سجلات المعلم نفسه (أدمن يرى الكل) — مُرقَّم ---------------- */
async function getGradingRecords(req, res, user, { filters = {}, page, pageSize } = {}) {
  let query = supabase.from('daily_follow_up').select('*', { count: 'exact' });
  query = scopeToOwner(query, user);

  if (filters.branch) query = query.eq('branch', filters.branch);
  if (filters.subject) query = query.eq('subject', filters.subject);
  if (filters.term) query = query.eq('term', filters.term);
  if (filters.evalType) query = query.eq('eval_type', filters.evalType);
  if (filters.studentId) query = query.eq('student_id', filters.studentId);

  query = query.order('recorded_date', { ascending: false });

  const paged = applyPagination(query, { page, pageSize });
  const { data, error, count } = await paged.query;
  if (error) return fail(res, 'تعذّر جلب سجلات الرصد', 500);
  return ok(res, paginatedResult(data, count, paged.page, paged.pageSize));
}

/* ---------------- تعديل جماعي ---------------- */
async function updateRosterRecords(req, res, user, { updates } = {}) {
  if (!Array.isArray(updates) || updates.length === 0) {
    return fail(res, 'لا يوجد تعديلات لتطبيقها', 400);
  }

  const results = await Promise.all(updates.map(async ({ id, data }) => {
    if (!id || !data) return { id, ok: false };

    let query = supabase.from('daily_follow_up')
      .update({ ...data, is_edited: true, edited_date: new Date().toISOString() })
      .eq('id', id);
    query = scopeToOwner(query, user);

    const { error } = await query;
    return { id, ok: !error };
  }));

  const failed = results.filter(r => !r.ok);
  await logAudit(user, 'updateRosterRecords', `تعديل ${results.length - failed.length} درجة`);

  if (failed.length > 0) {
    return ok(res, { updated: results.length - failed.length, failed: failed.map(f => f.id) }, 207);
  }
  return ok(res, { updated: results.length });
}

/* ---------------- حذف جماعي ---------------- */
async function deleteRosterRecords(req, res, user, { ids } = {}) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return fail(res, 'لا يوجد سجلات للحذف', 400);
  }

  let query = supabase.from('daily_follow_up').delete().in('id', ids);
  query = scopeToOwner(query, user);

  const { error } = await query;
  if (error) return fail(res, 'تعذّر حذف السجلات', 500);

  await logAudit(user, 'deleteRosterRecords', `حذف ${ids.length} سجل درجات`);
  return ok(res, { deleted: ids.length });
}
