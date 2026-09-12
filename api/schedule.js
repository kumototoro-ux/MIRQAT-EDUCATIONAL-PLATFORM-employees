import supabase from '../lib/supabase.js';
import { getSessionUser } from '../lib/jwt.js';
import { ok, fail } from '../lib/response.js';
import { logAudit } from '../lib/audit.js';
import { applyEmployeeScope } from '../lib/scope.js';
import { resolveCurrentWeek } from '../lib/academicWeek.js';

/**
 * Actions:
 *  - getCalendar         { term? }
 *  - saveCalendarEvent   { id?, data }        → أدمن فقط
 *  - deleteCalendarEvent { id }                → أدمن فقط
 *  - getCalendarTerms    {}
 *  - getCurrentTermInfo  {}
 *  - getTimetable        { type, filters? }    → 'حصة' | 'اختبار'، مقيّد بنطاق المعلم
 *  - saveTimetableEntry  { id?, data }         → أدمن فقط
 *  - deleteTimetableEntry{ id }                → أدمن فقط
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 'Method not allowed', 405);

  const user = getSessionUser(req);
  if (!user) return fail(res, 'الجلسة غير صالحة أو منتهية', 401);

  const { action, ...body } = req.body || {};

  try {
    switch (action) {
      case 'getCalendar':
        return await getCalendar(req, res, body);
      case 'saveCalendarEvent':
        return await saveCalendarEvent(req, res, user, body);
      case 'deleteCalendarEvent':
        return await deleteCalendarEvent(req, res, user, body);
      case 'getCalendarTerms':
        return await getCalendarTerms(req, res);
      case 'getCurrentTermInfo':
        return await getCurrentTermInfo(req, res);
      case 'getTimetable':
        return await getTimetable(req, res, user, body);
      case 'saveTimetableEntry':
        return await saveTimetableEntry(req, res, user, body);
      case 'deleteTimetableEntry':
        return await deleteTimetableEntry(req, res, user, body);
      default:
        return fail(res, 'إجراء غير معروف', 400);
    }
  } catch (e) {
    console.error('schedule.js error:', e);
    return fail(res, 'حدث خطأ في الخادم', 500);
  }
}

function requireAdmin(user) {
  return user.role === 'admin';
}

/* ---------------- التقويم الدراسي ---------------- */
async function getCalendar(req, res, { term } = {}) {
  let query = supabase.from('school_calendar').select('*').order('week_start_date', { ascending: true });
  if (term) query = query.eq('term', term);

  const { data, error } = await query;
  if (error) return fail(res, 'تعذّر جلب التقويم الدراسي', 500);
  return ok(res, data);
}

async function saveCalendarEvent(req, res, user, { id, data } = {}) {
  if (!requireAdmin(user)) return fail(res, 'هذا الإجراء يتطلب صلاحية أدمن', 403);
  if (!data) return fail(res, 'بيانات ناقصة', 400);

  if (id) {
    const { error } = await supabase.from('school_calendar').update(data).eq('id', id);
    if (error) return fail(res, 'تعذّر تعديل الحدث', 500);
    await logAudit(user, 'saveCalendarEvent', `تعديل حدث تقويم: ${id}`);
    return ok(res, { id });
  }

  const { data: inserted, error } = await supabase.from('school_calendar').insert(data).select().single();
  if (error) return fail(res, 'تعذّر إضافة الحدث', 500);

  await logAudit(user, 'saveCalendarEvent', `إضافة حدث تقويم: ${inserted.id}`);
  return ok(res, inserted, 201);
}

async function deleteCalendarEvent(req, res, user, { id } = {}) {
  if (!requireAdmin(user)) return fail(res, 'هذا الإجراء يتطلب صلاحية أدمن', 403);
  if (!id) return fail(res, 'معرّف الحدث مطلوب', 400);

  const { error } = await supabase.from('school_calendar').delete().eq('id', id);
  if (error) return fail(res, 'تعذّر حذف الحدث', 500);

  await logAudit(user, 'deleteCalendarEvent', `حذف حدث تقويم: ${id}`);
  return ok(res, { id });
}

async function getCalendarTerms(req, res) {
  const { data, error } = await supabase
    .from('settings_lists')
    .select('value')
    .eq('list_key', 'terms')
    .order('sort_order', { ascending: true });

  if (error) return fail(res, 'تعذّر جلب الترمات', 500);
  return ok(res, data.map(r => r.value));
}

async function getCurrentTermInfo(req, res) {
  const data = await resolveCurrentWeek();
  if (!data) return ok(res, null); // لا يوجد أي أسبوع في التقويم بعد
  return ok(res, data);
}

/* ---------------- جدول الحصص والاختبارات ---------------- */
async function getTimetable(req, res, user, { type, filters = {} } = {}) {
  let query = supabase.from('class_timetable').select('*');
  if (type) query = query.eq('entry_type', type);

  query = applyEmployeeScope(query, user, { branchCol: 'branch', stageCol: 'stage', gradeCol: 'grade', sectionCol: 'section' });

  if (filters.branch) query = query.eq('branch', filters.branch);
  if (filters.stage) query = query.eq('stage', filters.stage);
  if (filters.grade) query = query.eq('grade', filters.grade);
  if (filters.section) query = query.eq('section', filters.section);

  query = query.order('day', { ascending: true }).order('period_number', { ascending: true });

  const { data, error } = await query;
  if (error) return fail(res, 'تعذّر جلب الجدول', 500);
  return ok(res, data);
}

async function saveTimetableEntry(req, res, user, { id, data } = {}) {
  if (!requireAdmin(user)) return fail(res, 'هذا الإجراء يتطلب صلاحية أدمن', 403);
  if (!data) return fail(res, 'بيانات ناقصة', 400);

  if (id) {
    const { error } = await supabase.from('class_timetable').update(data).eq('id', id);
    if (error) return fail(res, 'تعذّر تعديل حصة الجدول', 500);
    await logAudit(user, 'saveTimetableEntry', `تعديل حصة جدول: ${id}`);
    return ok(res, { id });
  }

  const { data: inserted, error } = await supabase.from('class_timetable').insert(data).select().single();
  if (error) return fail(res, 'تعذّر إضافة حصة الجدول', 500);

  await logAudit(user, 'saveTimetableEntry', `إضافة حصة جدول: ${inserted.id}`);
  return ok(res, inserted, 201);
}

async function deleteTimetableEntry(req, res, user, { id } = {}) {
  if (!requireAdmin(user)) return fail(res, 'هذا الإجراء يتطلب صلاحية أدمن', 403);
  if (!id) return fail(res, 'معرّف حصة الجدول مطلوب', 400);

  const { error } = await supabase.from('class_timetable').delete().eq('id', id);
  if (error) return fail(res, 'تعذّر حذف حصة الجدول', 500);

  await logAudit(user, 'deleteTimetableEntry', `حذف حصة جدول: ${id}`);
  return ok(res, { id });
}
