import supabase from '../lib/supabase.js';
import { getSessionUser } from '../lib/jwt.js';
import { ok, fail } from '../lib/response.js';
import { logAudit } from '../lib/audit.js';
import { applyPagination, paginatedResult } from '../lib/paginate.js';

/**
 * Actions:
 *  - getBehaviorRecords { studentId?, filters? }
 *      studentId موجود  → سجل سلوك طالب معيّن كامل (لأي معلم، لعرض السجل التراكمي)
 *      studentId غائب   → قائمة عامة مقيّدة بصاحب السجل (أدمن يرى الكل مع فلاتر)
 *  - saveBehaviorRow    { id?, data }   → تعديل مقيّد بصاحب السجل
 *  - deleteBehaviorRow  { id }          → نفس التقييد
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 'Method not allowed', 405);

  const user = getSessionUser(req);
  if (!user) return fail(res, 'الجلسة غير صالحة أو منتهية', 401);

  const { action, ...body } = req.body || {};

  try {
    switch (action) {
      case 'getBehaviorRecords':
        return await getBehaviorRecords(req, res, user, body);
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

function scopeToOwner(query, user, col = 'employee_id') {
  if (user.role === 'admin') return query;
  return query.eq(col, user.employeeId);
}

async function getBehaviorRecords(req, res, user, { studentId, filters = {}, page, pageSize } = {}) {
  if (studentId) {
    // سجل تراكمي لطالب معيّن — غير مُرقَّم عمدًا (محدود طبيعيًا بعدد سجلات طالب واحد)
    const { data, error } = await supabase
      .from('behavior')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });
    if (error) return fail(res, 'تعذّر جلب سجلات السلوك', 500);
    return ok(res, data);
  }

  let query = supabase.from('behavior').select('*', { count: 'exact' });
  query = scopeToOwner(query, user);
  if (filters.branch) query = query.eq('branch', filters.branch);
  if (filters.term) query = query.eq('term', filters.term);
  if (filters.week) query = query.eq('week', filters.week);

  query = query.order('created_at', { ascending: false });

  const paged = applyPagination(query, { page, pageSize });
  const { data, error, count } = await paged.query;
  if (error) return fail(res, 'تعذّر جلب سجلات السلوك', 500);
  return ok(res, paginatedResult(data, count, paged.page, paged.pageSize));
}

async function saveBehaviorRow(req, res, user, { id, data } = {}) {
  if (!data) return fail(res, 'بيانات ناقصة', 400);

  if (id) {
    let query = supabase.from('behavior').update(data).eq('id', id);
    query = scopeToOwner(query, user);
    const { error } = await query;
    if (error) return fail(res, 'تعذّر تعديل سجل السلوك', 500);
    await logAudit(user, 'saveBehaviorRow', `تعديل سلوك: ${id}`);
    return ok(res, { id });
  }

  if (!data.student_id || !data.status) {
    return fail(res, 'الطالب وحالة السلوك مطلوبان', 400);
  }

  const insertData = {
    ...data,
    employee_id: user.employeeId,
    employee_name: user.name,
    person_type: user.role
  };

  const { data: inserted, error } = await supabase.from('behavior').insert(insertData).select().single();
  if (error) return fail(res, 'تعذّر إضافة سجل السلوك', 500);

  await logAudit(user, 'saveBehaviorRow', `إضافة سلوك: ${inserted.id} - طالب ${inserted.student_id}`);
  return ok(res, inserted, 201);
}

async function deleteBehaviorRow(req, res, user, { id } = {}) {
  if (!id) return fail(res, 'معرّف سجل السلوك مطلوب', 400);

  let query = supabase.from('behavior').delete().eq('id', id);
  query = scopeToOwner(query, user);
  const { error } = await query;
  if (error) return fail(res, 'تعذّر حذف سجل السلوك', 500);

  await logAudit(user, 'deleteBehaviorRow', `حذف سلوك: ${id}`);
  return ok(res, { id });
}
