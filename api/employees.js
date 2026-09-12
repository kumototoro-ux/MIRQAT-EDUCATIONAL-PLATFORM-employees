import supabase from '../lib/supabase.js';
import { getSessionUser } from '../lib/jwt.js';
import { ok, fail } from '../lib/response.js';
import { logAudit } from '../lib/audit.js';
import { generateNextId } from '../lib/idGen.js';

/**
 * إدارة سجلات الموظفين (بيانات الموظف نفسه — ليس حساب الدخول، ذلك في api/auth.js).
 * كل العمليات هنا محصورة بالأدمن — دليل الموظفين بيانات حساسة.
 *
 * Actions:
 *  - list    { filters? }
 *  - create  { data }
 *  - update  { id, data }
 *  - delete  { id }   → حذف ناعم
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 'Method not allowed', 405);

  const user = getSessionUser(req);
  if (!user) return fail(res, 'الجلسة غير صالحة أو منتهية', 401);
  if (user.role !== 'admin') return fail(res, 'هذا القسم يتطلب صلاحية أدمن', 403);

  const { action, ...body } = req.body || {};

  try {
    switch (action) {
      case 'list':
        return await listEmployees(req, res, body);
      case 'create':
        return await createEmployee(req, res, user, body);
      case 'update':
        return await updateEmployee(req, res, user, body);
      case 'delete':
        return await deleteEmployee(req, res, user, body);
      default:
        return fail(res, 'إجراء غير معروف', 400);
    }
  } catch (e) {
    console.error('employees.js error:', e);
    return fail(res, 'حدث خطأ في الخادم', 500);
  }
}

async function listEmployees(req, res, { filters = {} } = {}) {
  let query = supabase.from('employees').select('*').is('deleted_at', null);

  if (filters.branch) query = query.eq('branch', filters.branch);
  if (filters.role) query = query.eq('role', filters.role);
  if (filters.search) query = query.ilike('name_ar', `%${filters.search}%`);

  query = query.order('id', { ascending: true });

  const { data, error } = await query;
  if (error) return fail(res, 'تعذّر جلب بيانات الموظفين', 500);
  return ok(res, data);
}

async function createEmployee(req, res, user, { data } = {}) {
  if (!data || !data.name_ar || !data.role) {
    return fail(res, 'اسم الموظف والدور مطلوبان', 400);
  }

  const id = await generateNextId('employees', 'E', 3);

  const { data: inserted, error } = await supabase
    .from('employees')
    .insert({
      id,
      national_id: data.national_id || null,
      name_ar: data.name_ar,
      name_en: data.name_en || null,
      user_type: data.user_type || null,
      role: data.role,
      gender: data.gender || null,
      branch: data.branch || null,
      stages: data.stages || null,
      grades: data.grades || null,
      sections: data.sections || null,
      subject: data.subject || null
    })
    .select()
    .single();

  if (error) return fail(res, 'تعذّر إضافة الموظف', 500);

  await logAudit(user, 'createEmployee', `إضافة موظف: ${id} - ${data.name_ar}`);
  return ok(res, inserted, 201);
}

async function updateEmployee(req, res, user, { id, data } = {}) {
  if (!id || !data) return fail(res, 'بيانات ناقصة', 400);

  const { error } = await supabase.from('employees').update(data).eq('id', id);
  if (error) return fail(res, 'تعذّر تعديل بيانات الموظف', 500);

  await logAudit(user, 'updateEmployee', `تعديل موظف: ${id}`);
  return ok(res, { id });
}

async function deleteEmployee(req, res, user, { id } = {}) {
  if (!id) return fail(res, 'معرّف الموظف مطلوب', 400);
  if (id === user.employeeId) return fail(res, 'لا يمكنك حذف حسابك الخاص', 400);

  const { error } = await supabase
    .from('employees')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id);

  if (error) return fail(res, 'تعذّر حذف الموظف', 500);

  await logAudit(user, 'deleteEmployee', `حذف موظف: ${id}`);
  return ok(res, { id });
}
