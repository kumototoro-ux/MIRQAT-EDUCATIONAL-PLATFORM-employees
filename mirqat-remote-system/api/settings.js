import supabase from '../lib/supabase.js';
import { getSessionUser } from '../lib/jwt.js';
import { ok, fail } from '../lib/response.js';
import { logAudit } from '../lib/audit.js';

/**
 * Actions:
 *  - getSchoolInfo             {}                    → عام، بدون جلسة (يُستخدم قبل تحميل الواجهة)
 *  - getSettingsLists          {}                     → كل القوائم مجمّعة بمفتاحها
 *  - getEvalTypes              {}                     → أنواع التقييم المستمر
 *  - getVisibilitySettings     {}                     → نتائج/درجات/جدول اختبارات ظاهرة لمن
 *  - getSubjectMatrixForForms  {}                      → لبناء نماذج اختيار المواد
 *  - getSubjectMatrixRows      {}                      → أدمن (صفحة إدارة)
 *  - getGradeDistributionRows  {}                      → لأي مستخدم (يحتاجها المعلم عند رصد الدرجات)
 *  - addSettingsItem           { key, value }          → أدمن فقط
 *  - removeSettingsItem        { key, value }          → أدمن فقط
 *  - setSchoolInfo             { name, logoUrl }       → أدمن فقط
 *  - saveSubjectMatrixRow      { id?, data }           → أدمن فقط
 *  - deleteSubjectMatrixRow    { id }                  → أدمن فقط
 *  - saveGradeDistRow          { id?, data }           → أدمن فقط
 *  - deleteGradeDistRow        { id }                  → أدمن فقط
 *  - setVisibilitySettings     { key, values }         → أدمن فقط
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 'Method not allowed', 405);

  const { action, ...body } = req.body || {};

  // الوحيدة المتاحة بدون جلسة — تُستخدم في لحظات مبكرة من تحميل الواجهة
  if (action === 'getSchoolInfo') {
    return await getSchoolInfo(req, res);
  }

  const user = getSessionUser(req);
  if (!user) return fail(res, 'الجلسة غير صالحة أو منتهية', 401);

  try {
    switch (action) {
      case 'getSettingsLists':
        return await getSettingsLists(req, res);
      case 'getEvalTypes':
        return await getEvalTypes(req, res);
      case 'getVisibilitySettings':
        return await getVisibilitySettings(req, res);
      case 'getSubjectMatrixForForms':
        return await getSubjectMatrixForForms(req, res);
      case 'getSubjectMatrixRows':
        return await getSubjectMatrixRows(req, res, user);
      case 'getGradeDistributionRows':
        return await getGradeDistributionRows(req, res);
      case 'addSettingsItem':
        return await addSettingsItem(req, res, user, body);
      case 'removeSettingsItem':
        return await removeSettingsItem(req, res, user, body);
      case 'setSchoolInfo':
        return await setSchoolInfo(req, res, user, body);
      case 'saveSubjectMatrixRow':
        return await saveSubjectMatrixRow(req, res, user, body);
      case 'deleteSubjectMatrixRow':
        return await deleteSubjectMatrixRow(req, res, user, body);
      case 'saveGradeDistRow':
        return await saveGradeDistRow(req, res, user, body);
      case 'deleteGradeDistRow':
        return await deleteGradeDistRow(req, res, user, body);
      case 'setVisibilitySettings':
        return await setVisibilitySettings(req, res, user, body);
      default:
        return fail(res, 'إجراء غير معروف', 400);
    }
  } catch (e) {
    console.error('settings.js error:', e);
    return fail(res, 'حدث خطأ في الخادم', 500);
  }
}

function requireAdmin(user) {
  return user.role === 'admin';
}

/* ---------------- معلومات المدرسة ---------------- */
async function getSchoolInfo(req, res) {
  const { data, error } = await supabase.from('school_info').select('school_name, logo_url').eq('id', 1).maybeSingle();
  if (error || !data) return ok(res, { name: 'مِرقاة', logo: '' });
  return ok(res, { name: data.school_name, logo: data.logo_url || '' });
}

async function setSchoolInfo(req, res, user, { name, logoUrl } = {}) {
  if (!requireAdmin(user)) return fail(res, 'هذا الإجراء يتطلب صلاحية أدمن', 403);
  if (!name) return fail(res, 'اسم المدرسة مطلوب', 400);

  const { error } = await supabase.from('school_info').update({ school_name: name, logo_url: logoUrl || null }).eq('id', 1);
  if (error) return fail(res, 'تعذّر تحديث معلومات المدرسة', 500);

  await logAudit(user, 'setSchoolInfo', `تحديث معلومات المدرسة: ${name}`);
  return ok(res, { name, logoUrl });
}

/* ---------------- القوائم ---------------- */
async function getSettingsLists(req, res) {
  const { data, error } = await supabase.from('settings_lists').select('list_key, value').order('sort_order', { ascending: true });
  if (error) return fail(res, 'تعذّر جلب القوائم', 500);

  const lists = {};
  data.forEach(row => {
    if (!lists[row.list_key]) lists[row.list_key] = [];
    lists[row.list_key].push(row.value);
  });
  return ok(res, lists);
}

async function getEvalTypes(req, res) {
  const { data, error } = await supabase
    .from('settings_lists')
    .select('value')
    .eq('list_key', 'continuous_eval_types')
    .order('sort_order', { ascending: true });

  if (error) return fail(res, 'تعذّر جلب أنواع التقييم', 500);
  return ok(res, data.map(r => r.value));
}

async function addSettingsItem(req, res, user, { key, value } = {}) {
  if (!requireAdmin(user)) return fail(res, 'هذا الإجراء يتطلب صلاحية أدمن', 403);
  if (!key || !value) return fail(res, 'المفتاح والقيمة مطلوبان', 400);

  const { count } = await supabase.from('settings_lists').select('*', { count: 'exact', head: true }).eq('list_key', key);

  const { error } = await supabase.from('settings_lists').insert({ list_key: key, value, sort_order: count || 0 });
  if (error) {
    if (error.code === '23505') return fail(res, 'هذه القيمة موجودة مسبقًا', 409);
    return fail(res, 'تعذّر إضافة العنصر', 500);
  }

  await logAudit(user, 'addSettingsItem', `${key}: ${value}`);
  return ok(res, { key, value }, 201);
}

async function removeSettingsItem(req, res, user, { key, value } = {}) {
  if (!requireAdmin(user)) return fail(res, 'هذا الإجراء يتطلب صلاحية أدمن', 403);
  if (!key || !value) return fail(res, 'المفتاح والقيمة مطلوبان', 400);

  const { error } = await supabase.from('settings_lists').delete().eq('list_key', key).eq('value', value);
  if (error) return fail(res, 'تعذّر حذف العنصر', 500);

  await logAudit(user, 'removeSettingsItem', `${key}: ${value}`);
  return ok(res, { key, value });
}

/* ---------------- مصفوفة توزيع المواد ---------------- */
async function getSubjectMatrixForForms(req, res) {
  const { data, error } = await supabase.from('subject_distribution_matrix').select('branch, stages, grades, sections, subject');
  if (error) return fail(res, 'تعذّر جلب مصفوفة المواد', 500);
  return ok(res, data);
}

async function getSubjectMatrixRows(req, res, user) {
  if (!requireAdmin(user)) return fail(res, 'هذا الإجراء يتطلب صلاحية أدمن', 403);

  const { data, error } = await supabase.from('subject_distribution_matrix').select('*').order('id', { ascending: true });
  if (error) return fail(res, 'تعذّر جلب مصفوفة المواد', 500);
  return ok(res, data);
}

async function saveSubjectMatrixRow(req, res, user, { id, data } = {}) {
  if (!requireAdmin(user)) return fail(res, 'هذا الإجراء يتطلب صلاحية أدمن', 403);
  if (!data) return fail(res, 'بيانات ناقصة', 400);

  if (id) {
    const { error } = await supabase.from('subject_distribution_matrix').update(data).eq('id', id);
    if (error) return fail(res, 'تعذّر تعديل الصف', 500);
    await logAudit(user, 'saveSubjectMatrixRow', `تعديل: ${id}`);
    return ok(res, { id });
  }

  const { data: inserted, error } = await supabase.from('subject_distribution_matrix').insert(data).select().single();
  if (error) return fail(res, 'تعذّر إضافة الصف', 500);

  await logAudit(user, 'saveSubjectMatrixRow', `إضافة: ${inserted.id}`);
  return ok(res, inserted, 201);
}

async function deleteSubjectMatrixRow(req, res, user, { id } = {}) {
  if (!requireAdmin(user)) return fail(res, 'هذا الإجراء يتطلب صلاحية أدمن', 403);
  if (!id) return fail(res, 'معرّف الصف مطلوب', 400);

  const { error } = await supabase.from('subject_distribution_matrix').delete().eq('id', id);
  if (error) return fail(res, 'تعذّر حذف الصف', 500);

  await logAudit(user, 'deleteSubjectMatrixRow', `حذف: ${id}`);
  return ok(res, { id });
}

/* ---------------- توزيع الدرجات ---------------- */
async function getGradeDistributionRows(req, res) {
  const { data, error } = await supabase.from('grade_distribution').select('*').order('subject', { ascending: true });
  if (error) return fail(res, 'تعذّر جلب توزيع الدرجات', 500);
  return ok(res, data);
}

async function saveGradeDistRow(req, res, user, { id, data } = {}) {
  if (!requireAdmin(user)) return fail(res, 'هذا الإجراء يتطلب صلاحية أدمن', 403);
  if (!data || !data.subject || !data.eval_type || data.percentage === undefined) {
    return fail(res, 'المادة ونوع التقييم والنسبة مطلوبة', 400);
  }

  if (id) {
    const { error } = await supabase.from('grade_distribution').update(data).eq('id', id);
    if (error) return fail(res, 'تعذّر تعديل الصف', 500);
    await logAudit(user, 'saveGradeDistRow', `تعديل: ${id}`);
    return ok(res, { id });
  }

  const { data: inserted, error } = await supabase.from('grade_distribution').insert(data).select().single();
  if (error) return fail(res, 'تعذّر إضافة الصف', 500);

  await logAudit(user, 'saveGradeDistRow', `إضافة: ${inserted.subject} - ${inserted.eval_type}`);
  return ok(res, inserted, 201);
}

async function deleteGradeDistRow(req, res, user, { id } = {}) {
  if (!requireAdmin(user)) return fail(res, 'هذا الإجراء يتطلب صلاحية أدمن', 403);
  if (!id) return fail(res, 'معرّف الصف مطلوب', 400);

  const { error } = await supabase.from('grade_distribution').delete().eq('id', id);
  if (error) return fail(res, 'تعذّر حذف الصف', 500);

  await logAudit(user, 'deleteGradeDistRow', `حذف: ${id}`);
  return ok(res, { id });
}

/* ---------------- إعدادات الظهور (نتائج/درجات/جدول اختبارات) ---------------- */
async function getVisibilitySettings(req, res) {
  const { data, error } = await supabase.from('visibility_settings').select('setting_key, values');
  if (error) return fail(res, 'تعذّر جلب إعدادات الظهور', 500);

  const settings = {};
  data.forEach(row => { settings[row.setting_key] = row.values; });
  return ok(res, settings);
}

async function setVisibilitySettings(req, res, user, { key, values } = {}) {
  if (!requireAdmin(user)) return fail(res, 'هذا الإجراء يتطلب صلاحية أدمن', 403);
  if (!key || !Array.isArray(values)) return fail(res, 'المفتاح والقيم مطلوبة', 400);

  const { error } = await supabase
    .from('visibility_settings')
    .upsert({ setting_key: key, values, updated_at: new Date().toISOString() }, { onConflict: 'setting_key' });

  if (error) return fail(res, 'تعذّر تحديث إعدادات الظهور', 500);

  await logAudit(user, 'setVisibilitySettings', `${key}: ${JSON.stringify(values)}`);
  return ok(res, { key, values });
}
