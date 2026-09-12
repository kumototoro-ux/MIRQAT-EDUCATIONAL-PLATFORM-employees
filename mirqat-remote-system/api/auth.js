import bcrypt from 'bcryptjs';
import supabase from '../lib/supabase.js';
import { signToken, getSessionUser } from '../lib/jwt.js';
import { checkLoginRateLimit } from '../lib/rateLimit.js';
import { ok, fail } from '../lib/response.js';
import { logAudit } from '../lib/audit.js';

/**
 * ملف API موحّد لكل ما يخص المصادقة وإدارة الحسابات — كل العمليات تمر
 * عبر action واحد بدل ملف منفصل لكل عملية (التزامًا بحد الـ12 ملف API
 * في Vercel Hobby). إضافة عملية جديدة مستقبلًا = حالة جديدة في switch،
 * وليس ملفًا جديدًا.
 *
 * Actions:
 *  - login              { username, password }              → عام (بدون توكن)
 *  - session             {}                                  → يتطلب توكن
 *  - listAccounts        { kind }                             → أدمن فقط
 *  - createAccount       { kind, ownerId, username, password }→ أدمن فقط
 *  - updateAccount       { kind, userId, username?, password?}→ أدمن فقط
 *  - toggleAccountStatus { kind, userId, newStatus }          → أدمن فقط
 *  - deleteAccount       { kind, userId }                     → أدمن فقط
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return fail(res, 'Method not allowed', 405);
  }

  const { action, ...body } = req.body || {};

  try {
    switch (action) {
      case 'login':
        return await handleLogin(req, res, body);
      case 'session':
        return await handleSession(req, res);
      case 'listAccounts':
        return await handleListAccounts(req, res, body);
      case 'createAccount':
        return await handleCreateAccount(req, res, body);
      case 'updateAccount':
        return await handleUpdateAccount(req, res, body);
      case 'toggleAccountStatus':
        return await handleToggleAccountStatus(req, res, body);
      case 'deleteAccount':
        return await handleDeleteAccount(req, res, body);
      default:
        return fail(res, 'إجراء غير معروف', 400);
    }
  } catch (e) {
    console.error('auth.js error:', e);
    return fail(res, 'حدث خطأ في الخادم', 500);
  }
}

/* ---------------- تسجيل الدخول ---------------- */
// هذا الملف يخدم بوابة الموظفين فقط — حسابات الطلاب (student_accounts)
// تُستخدم لاحقًا من مشروع بوابة الطالب المنفصل الذي يشارك نفس القاعدة
async function handleLogin(req, res, { username, password }) {
  if (!username || !password) {
    return fail(res, 'يرجى إدخال اسم المستخدم وكلمة المرور', 400);
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  const allowed = await checkLoginRateLimit(`${username}:${ip}`);
  if (!allowed) {
    return fail(res, 'محاولات كثيرة جدًا، حاول لاحقًا بعد دقيقة', 429);
  }

  const { data: account, error } = await supabase
    .from('staff_accounts')
    .select('user_id, employee_id, username, password_hash, status')
    .eq('username', username)
    .maybeSingle();

  if (error) return fail(res, 'حدث خطأ أثناء تسجيل الدخول', 500);
  if (!account) return fail(res, 'اسم المستخدم أو كلمة المرور غير صحيحة', 401);
  if (account.status !== 'active') return fail(res, 'الحساب موقوف — راجع الإدارة', 403);

  const validPassword = await bcrypt.compare(password, account.password_hash);
  if (!validPassword) return fail(res, 'اسم المستخدم أو كلمة المرور غير صحيحة', 401);

  const { data: employee, error: empError } = await supabase
    .from('employees')
    .select('id, name_ar, role, branch, stages, grades, sections, subject, is_active')
    .eq('id', account.employee_id)
    .maybeSingle();

  if (empError || !employee) return fail(res, 'تعذّر العثور على بيانات الموظف المرتبطة', 500);
  if (!employee.is_active) return fail(res, 'حساب الموظف غير نشط — راجع الإدارة', 403);

  const payload = {
    userId: account.user_id,
    employeeId: employee.id,
    name: employee.name_ar,
    role: employee.role,
    branch: employee.branch,
    stages: employee.stages,
    grades: employee.grades,
    sections: employee.sections,
    subject: employee.subject
  };

  const token = signToken(payload);
  await logAudit(payload, 'login', 'تسجيل دخول ناجح');

  return ok(res, { token, user: payload });
}

/* ---------------- التحقق من الجلسة الحالية ---------------- */
async function handleSession(req, res) {
  const user = getSessionUser(req);
  if (!user) return fail(res, 'الجلسة غير صالحة أو منتهية', 401);
  return ok(res, { user });
}

/* ---------------- أدوات صلاحيات ---------------- */
function requireAdmin(req) {
  const user = getSessionUser(req);
  if (!user) return { error: 'الجلسة غير صالحة أو منتهية', status: 401 };
  if (user.role !== 'admin') return { error: 'هذا الإجراء يتطلب صلاحية أدمن', status: 403 };
  return { user };
}

function accountsTable(kind) {
  return kind === 'student' ? 'student_accounts' : 'staff_accounts';
}

function ownerColumn(kind) {
  return kind === 'student' ? 'student_id' : 'employee_id';
}

/* ---------------- إدارة الحسابات (أدمن فقط) ---------------- */
async function handleListAccounts(req, res, { kind }) {
  const auth = requireAdmin(req);
  if (auth.error) return fail(res, auth.error, auth.status);

  const table = accountsTable(kind);
  const { data, error } = await supabase
    .from(table)
    .select('user_id, username, status, created_at, ' + ownerColumn(kind))
    .order('created_at', { ascending: false });

  if (error) return fail(res, 'تعذّر جلب الحسابات', 500);
  return ok(res, data);
}

async function handleCreateAccount(req, res, { kind, ownerId, username, password }) {
  const auth = requireAdmin(req);
  if (auth.error) return fail(res, auth.error, auth.status);

  if (!ownerId || !username || !password) {
    return fail(res, 'بيانات ناقصة لإنشاء الحساب', 400);
  }
  if (password.length < 6) {
    return fail(res, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل', 400);
  }

  const table = accountsTable(kind);
  const password_hash = await bcrypt.hash(password, 10);

  const { data, error } = await supabase
    .from(table)
    .insert({ [ownerColumn(kind)]: ownerId, username, password_hash })
    .select('user_id, username, status')
    .single();

  if (error) {
    if (error.code === '23505') return fail(res, 'اسم المستخدم مستخدم مسبقًا', 409);
    return fail(res, 'تعذّر إنشاء الحساب', 500);
  }

  await logAudit(auth.user, 'createAccount', `إنشاء حساب ${kind || 'staff'}: ${username}`);
  return ok(res, data, 201);
}

async function handleUpdateAccount(req, res, { kind, userId, username, password }) {
  const auth = requireAdmin(req);
  if (auth.error) return fail(res, auth.error, auth.status);
  if (!userId) return fail(res, 'معرّف الحساب مطلوب', 400);

  const updates = {};
  if (username) updates.username = username;
  if (password) {
    if (password.length < 6) return fail(res, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل', 400);
    updates.password_hash = await bcrypt.hash(password, 10);
  }
  if (Object.keys(updates).length === 0) return fail(res, 'لا يوجد تعديل لتطبيقه', 400);

  const table = accountsTable(kind);
  const { error } = await supabase.from(table).update(updates).eq('user_id', userId);

  if (error) {
    if (error.code === '23505') return fail(res, 'اسم المستخدم مستخدم مسبقًا', 409);
    return fail(res, 'تعذّر تعديل الحساب', 500);
  }

  await logAudit(auth.user, 'updateAccount', `تعديل حساب ${kind || 'staff'}: ${userId}`);
  return ok(res, { userId });
}

async function handleToggleAccountStatus(req, res, { kind, userId, newStatus }) {
  const auth = requireAdmin(req);
  if (auth.error) return fail(res, auth.error, auth.status);
  if (!userId || !newStatus) return fail(res, 'بيانات ناقصة', 400);

  const table = accountsTable(kind);
  const { error } = await supabase.from(table).update({ status: newStatus }).eq('user_id', userId);
  if (error) return fail(res, 'تعذّر تغيير حالة الحساب', 500);

  await logAudit(auth.user, 'toggleAccountStatus', `${kind || 'staff'} ${userId} -> ${newStatus}`);
  return ok(res, { userId, status: newStatus });
}

async function handleDeleteAccount(req, res, { kind, userId }) {
  const auth = requireAdmin(req);
  if (auth.error) return fail(res, auth.error, auth.status);
  if (!userId) return fail(res, 'معرّف الحساب مطلوب', 400);

  const table = accountsTable(kind);
  const { error } = await supabase.from(table).delete().eq('user_id', userId);
  if (error) return fail(res, 'تعذّر حذف الحساب', 500);

  await logAudit(auth.user, 'deleteAccount', `حذف حساب ${kind || 'staff'}: ${userId}`);
  return ok(res, { userId });
}
