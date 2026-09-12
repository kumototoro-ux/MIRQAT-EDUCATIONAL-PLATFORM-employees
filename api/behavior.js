import supabase from '../lib/supabase.js';
import { getSessionUser } from '../lib/jwt.js';
import { ok, fail } from '../lib/response.js';
import { logAudit } from '../lib/audit.js';

/**
 * كل هذا الملف مقيّد بالأدمن فقط — لا يستطيع أي معلم عرض أو رصد سلوك أي طالب.
 * الصفحة أصبحت لوحة إحصائيات عامة (أداء الطلاب ككل)، وليست أداة رصد فردي.
 *
 * Actions:
 *  - getStats           {}                → إحصائيات عامة (للرسوم البيانية)
 *  - getBehaviorRecords { filters? }       → سجلات عامة (لمراجعة الأدمن فقط)
 *  - saveBehaviorRow    { id?, data }      → تصحيح/إضافة من الأدمن
 *  - deleteBehaviorRow  { id }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 'Method not allowed', 405);

  const user = getSessionUser(req);
  if (!user) return fail(res, 'الجلسة غير صالحة أو منتهية', 401);
  if (user.role !== 'admin') return fail(res, 'صفحة السلوك مقيّدة بصلاحية أدمن فقط', 403);

  const { action, ...body } = req.body || {};

  try {
    switch (action) {
      case 'getStats':
        return await getStats(req, res);
      case 'getBehaviorRecords':
        return await getBehaviorRecords(req, res, body);
      case 'saveBehaviorRow':
        return await saveBehaviorRow(req, res, user, body);
      case 'deleteBehaviorRow':
        return await deleteBehaviorRow(req, res, user, body);
      default:
        return fail(res, 'إجراء غير معروف', 400);
    }
  } catch (e) {
    console.error('behavior.js error:', e);
    return fail(res, 'حدث خطأ في الخادم', 500);
  }
}

/* ---------------- إحصائيات عامة ---------------- */
async function getStats(req, res) {
  const countWhere = async (col, val) => {
    let q = supabase.from('behavior').select('*', { count: 'exact', head: true });
    if (val) q = q.eq(col, val);
    const { count } = await q;
    return count || 0;
  };

  const { data: statusRows } = await supabase.from('settings_lists').select('value').eq('list_key', 'behavior_statuses');
  const { data: termRows } = await supabase.from('settings_lists').select('value').eq('list_key', 'terms');
  const { data: branchRows } = await supabase.from('settings_lists').select('value').eq('list_key', 'branches');

  const total = await countWhere();
  const byStatus = await Promise.all((statusRows || []).map(async r => ({ label: r.value, count: await countWhere('status', r.value) })));
  const byTerm = await Promise.all((termRows || []).map(async r => ({ label: r.value, count: await countWhere('term', r.value) })));
  const byBranch = await Promise.all((branchRows || []).map(async r => ({ label: r.value, count: await countWhere('branch', r.value) })));

  return ok(res, { total, byStatus, byTerm, byBranch: byBranch.filter(b => b.count > 0) });
}

/* ---------------- سجلات عامة (مراجعة الأدمن) ---------------- */
async function getBehaviorRecords(req, res, { filters = {} } = {}) {
  let query = supabase.from('behavior').select('*');
  if (filters.branch) query = query.eq('branch', filters.branch);
  if (filters.term) query = query.eq('term', filters.term);
  if (filters.status) query = query.eq('status', filters.status);

  query = query.order('created_at', { ascending: false }).limit(100);

  const { data, error } = await query;
  if (error) return fail(res, 'تعذّر جلب سجلات السلوك', 500);
  return ok(res, data);
}

async function saveBehaviorRow(req, res, user, { id, data } = {}) {
  if (!data) return fail(res, 'بيانات ناقصة', 400);

  if (id) {
    const { error } = await supabase.from('behavior').update(data).eq('id', id);
    if (error) return fail(res, 'تعذّر تعديل سجل السلوك', 500);
    await logAudit(user, 'saveBehaviorRow', `تعديل سلوك: ${id}`);
    return ok(res, { id });
  }

  if (!data.student_id || !data.status) return fail(res, 'الطالب وحالة السلوك مطلوبان', 400);

  const insertData = { ...data, employee_id: user.employeeId, employee_name: user.name, person_type: user.role };
  const { data: inserted, error } = await supabase.from('behavior').insert(insertData).select().single();
  if (error) return fail(res, 'تعذّر إضافة سجل السلوك', 500);

  await logAudit(user, 'saveBehaviorRow', `إضافة سلوك: ${inserted.id}`);
  return ok(res, inserted, 201);
}

async function deleteBehaviorRow(req, res, user, { id } = {}) {
  if (!id) return fail(res, 'معرّف سجل السلوك مطلوب', 400);

  const { error } = await supabase.from('behavior').delete().eq('id', id);
  if (error) return fail(res, 'تعذّر حذف سجل السلوك', 500);

  await logAudit(user, 'deleteBehaviorRow', `حذف سلوك: ${id}`);
  return ok(res, { id });
}
