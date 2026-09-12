import supabase from '../lib/supabase.js';
import { getSessionUser } from '../lib/jwt.js';
import { ok, fail } from '../lib/response.js';
import { logAudit } from '../lib/audit.js';
import { generateNextId } from '../lib/idGen.js';
import { applyEmployeeScope } from '../lib/scope.js';
import { applyPagination, paginatedResult } from '../lib/paginate.js';

/**
 * Actions:
 *  - list    { filters?, page?, pageSize? } → مُرقَّم (افتراضي 25، أقصى 100 بالصفحة)
 *  - getStats {}                             → إحصائيات عد فقط (بدون جلب صفوف) لواجهة النظرة العامة
 *  - getRecent { limit? }                    → آخر الطلاب المُضافين (افتراضي 10)
 *  - create  { data }            → أدمن فقط
 *  - update  { id, data }        → أدمن فقط
 *  - delete  { id }              → أدمن فقط (حذف ناعم)
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 'Method not allowed', 405);

  const user = getSessionUser(req);
  if (!user) return fail(res, 'الجلسة غير صالحة أو منتهية', 401);

  const { action, ...body } = req.body || {};

  try {
    switch (action) {
      case 'list':
        return await listStudents(req, res, user, body);
      case 'getStats':
        return await getStats(req, res, user);
      case 'getRecent':
        return await getRecent(req, res, user, body);
      case 'create':
        return await createStudent(req, res, user, body);
      case 'update':
        return await updateStudent(req, res, user, body);
      case 'delete':
        return await deleteStudent(req, res, user, body);
      default:
        return fail(res, 'إجراء غير معروف', 400);
    }
  } catch (e) {
    console.error('students.js error:', e);
    return fail(res, 'حدث خطأ في الخادم', 500);
  }
}

function requireAdmin(user) {
  return user.role === 'admin';
}

async function listStudents(req, res, user, { filters = {}, page, pageSize } = {}) {
  let query = supabase.from('students').select('*', { count: 'exact' }).is('deleted_at', null);
  query = applyEmployeeScope(query, user);

  if (filters.branch) query = query.eq('branch', filters.branch);
  if (filters.stages) query = query.eq('stages', filters.stages);
  if (filters.grades) query = query.eq('grades', filters.grades);
  if (filters.sections) query = query.eq('sections', filters.sections);
  if (filters.search) query = query.ilike('name_ar', `%${filters.search}%`);

  query = query.order('id', { ascending: true });

  const paged = applyPagination(query, { page, pageSize });
  const { data, error, count } = await paged.query;
  if (error) return fail(res, 'تعذّر جلب بيانات الطلاب', 500);
  return ok(res, paginatedResult(data, count, paged.page, paged.pageSize));
}

/** إحصائيات عد فقط (head:true) — لا تجلب أي صف فعلي، رخيصة جدًا حتى مع ملايين السجلات */
async function getStats(req, res, user) {
  const countWhere = async (extra = {}) => {
    let q = supabase.from('students').select('*', { count: 'exact', head: true }).is('deleted_at', null);
    q = applyEmployeeScope(q, user);
    for (const [col, val] of Object.entries(extra)) q = q.eq(col, val);
    const { count, error } = await q;
    if (error) return 0;
    return count || 0;
  };

  const { data: branchRows } = await supabase.from('settings_lists').select('value').eq('list_key', 'branches');
  const { data: gradeRows } = await supabase.from('settings_lists').select('value').eq('list_key', 'grades');

  const total = await countWhere();

  const byBranch = await Promise.all(
    (branchRows || []).map(async r => ({ label: r.value, count: await countWhere({ branch: r.value }) }))
  );
  const byGrade = await Promise.all(
    (gradeRows || []).map(async r => ({ label: r.value, count: await countWhere({ grades: r.value }) }))
  );

  return ok(res, { total, byBranch, byGrade: byGrade.filter(g => g.count > 0) });
}

/** آخر الطلاب المُضافين — للعرض السريع بلا فلترة */
async function getRecent(req, res, user, { limit } = {}) {
  let query = supabase
    .from('students')
    .select('id, name_ar, branch, stages, grades, sections, created_at')
    .is('deleted_at', null);
  query = applyEmployeeScope(query, user);
  query = query.order('created_at', { ascending: false }).limit(Math.min(50, limit || 10));

  const { data, error } = await query;
  if (error) return fail(res, 'تعذّر جلب آخر الطلاب', 500);
  return ok(res, data);
}


  if (!requireAdmin(user)) return fail(res, 'هذا الإجراء يتطلب صلاحية أدمن', 403);
  if (!data || !data.name_ar) return fail(res, 'اسم الطالب مطلوب', 400);

  const id = await generateNextId('students', 'S', 4);

  const { data: inserted, error } = await supabase
    .from('students')
    .insert({
      id,
      national_id: data.national_id || null,
      name_ar: data.name_ar,
      name_en: data.name_en || null,
      nationality: data.nationality || null,
      dob: data.dob || null,
      gender: data.gender || null,
      branch: data.branch || null,
      stages: data.stages || null,
      grades: data.grades || null,
      sections: data.sections || null,
      fees_status: data.fees_status || null
    })
    .select()
    .single();

  if (error) return fail(res, 'تعذّر إضافة الطالب', 500);

  await logAudit(user, 'createStudent', `إضافة طالب: ${id} - ${data.name_ar}`);
  return ok(res, inserted, 201);
}

async function updateStudent(req, res, user, { id, data } = {}) {
  if (!requireAdmin(user)) return fail(res, 'هذا الإجراء يتطلب صلاحية أدمن', 403);
  if (!id || !data) return fail(res, 'بيانات ناقصة', 400);

  const { error } = await supabase.from('students').update(data).eq('id', id);
  if (error) return fail(res, 'تعذّر تعديل بيانات الطالب', 500);

  await logAudit(user, 'updateStudent', `تعديل طالب: ${id}`);
  return ok(res, { id });
}

async function deleteStudent(req, res, user, { id } = {}) {
  if (!requireAdmin(user)) return fail(res, 'هذا الإجراء يتطلب صلاحية أدمن', 403);
  if (!id) return fail(res, 'معرّف الطالب مطلوب', 400);

  const { error } = await supabase
    .from('students')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id);

  if (error) return fail(res, 'تعذّر حذف الطالب', 500);

  await logAudit(user, 'deleteStudent', `حذف طالب: ${id}`);
  return ok(res, { id });
}
