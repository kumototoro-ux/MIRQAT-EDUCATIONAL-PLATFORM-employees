import supabase from '../lib/supabase.js';
import { getSessionUser } from '../lib/jwt.js';
import { ok, fail } from '../lib/response.js';
import { logAudit } from '../lib/audit.js';
import { applyEmployeeScope, applySubjectScope } from '../lib/scope.js';

const SCORE_COLS = [
  'homework', 'research_reports', 'worksheets', 'participation', 'quizzes',
  'monthly_exams', 'final_exam', 'oral_exam', 'written_exam'
];

function withTotal(row) {
  const total = SCORE_COLS.reduce((sum, c) => sum + (Number(row[c]) || 0), 0);
  return { ...row, total: Math.round(total * 100) / 100 };
}

/**
 * Actions:
 *  - getGradeAggregation   { studentId, term? }              → كل مواد طالب (معلم مقيّد بمادته)
 *  - toggleGradeVisibility { id, visible }                    → معلم يملك مادته فقط، أدمن أي شيء
 *  - searchStudentsForReport { query }                        → بحث مقيّد بنطاق المعلم
 *  - getStudentReportCard  { studentId, term }                → بيانات الطالب + كل درجاته
 *  - getClassComparison    { studentId, term, subject? }      → مقارنة الطالب بمتوسط شعبته
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 'Method not allowed', 405);

  const user = getSessionUser(req);
  if (!user) return fail(res, 'الجلسة غير صالحة أو منتهية', 401);

  const { action, ...body } = req.body || {};

  try {
    switch (action) {
      case 'getGradeAggregation':
        return await getGradeAggregation(req, res, user, body);
      case 'toggleGradeVisibility':
        return await toggleGradeVisibility(req, res, user, body);
      case 'searchStudentsForReport':
        return await searchStudentsForReport(req, res, user, body);
      case 'getStudentReportCard':
        return await getStudentReportCard(req, res, user, body);
      case 'getClassComparison':
        return await getClassComparison(req, res, user, body);
      default:
        return fail(res, 'إجراء غير معروف', 400);
    }
  } catch (e) {
    console.error('reports.js error:', e);
    return fail(res, 'حدث خطأ في الخادم', 500);
  }
}

/* ---------------- كل درجات طالب ---------------- */
async function getGradeAggregation(req, res, user, { studentId, term } = {}) {
  if (!studentId) return fail(res, 'معرّف الطالب مطلوب', 400);

  let query = supabase.from('grade_aggregation').select('*').eq('student_id', studentId);
  if (term) query = query.eq('term', term);
  query = applySubjectScope(query, user);

  const { data, error } = await query;
  if (error) return fail(res, 'تعذّر جلب الدرجات', 500);
  return ok(res, data.map(withTotal));
}

/* ---------------- إظهار/إخفاء نتيجة مادة لولي الأمر/الطالب ---------------- */
async function toggleGradeVisibility(req, res, user, { id, visible } = {}) {
  if (!id || typeof visible !== 'boolean') return fail(res, 'بيانات ناقصة', 400);

  let query = supabase.from('grade_aggregation').update({ is_visible: visible }).eq('id', id);
  query = applySubjectScope(query, user);

  const { error } = await query;
  if (error) return fail(res, 'تعذّر تغيير حالة الظهور', 500);

  await logAudit(user, 'toggleGradeVisibility', `${id} -> ${visible ? 'ظاهر' : 'مخفي'}`);
  return ok(res, { id, visible });
}

/* ---------------- بحث طلاب لإعداد تقرير ---------------- */
async function searchStudentsForReport(req, res, user, { query: search } = {}) {
  if (!search || search.trim().length < 2) return fail(res, 'أدخل حرفين على الأقل للبحث', 400);

  let query = supabase.from('students').select('id, name_ar, branch, stages, grades, sections').is('deleted_at', null);
  query = applyEmployeeScope(query, user);
  query = query.or(`name_ar.ilike.%${search}%,id.ilike.%${search}%`).limit(20);

  const { data, error } = await query;
  if (error) return fail(res, 'تعذّر البحث عن الطلاب', 500);
  return ok(res, data);
}

/* ---------------- بطاقة تقرير الطالب ---------------- */
async function getStudentReportCard(req, res, user, { studentId, term } = {}) {
  if (!studentId) return fail(res, 'معرّف الطالب مطلوب', 400);

  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('*')
    .eq('id', studentId)
    .maybeSingle();

  if (studentError || !student) return fail(res, 'الطالب غير موجود', 404);

  let gradesQuery = supabase.from('grade_aggregation').select('*').eq('student_id', studentId);
  if (term) gradesQuery = gradesQuery.eq('term', term);
  gradesQuery = applySubjectScope(gradesQuery, user);

  const { data: grades, error: gradesError } = await gradesQuery;
  if (gradesError) return fail(res, 'تعذّر جلب درجات التقرير', 500);

  const { data: behaviorRows } = await supabase
    .from('behavior')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(20);

  return ok(res, {
    student,
    grades: grades.map(withTotal),
    behavior: behaviorRows || []
  });
}

/* ---------------- مقارنة الطالب بمتوسط شعبته ---------------- */
async function getClassComparison(req, res, user, { studentId, term, subject } = {}) {
  if (!studentId || !term) return fail(res, 'الطالب والترم مطلوبان', 400);

  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('branch, stages, grades, sections')
    .eq('id', studentId)
    .maybeSingle();

  if (studentError || !student) return fail(res, 'الطالب غير موجود', 404);

  let query = supabase
    .from('grade_aggregation')
    .select('*')
    .eq('term', term)
    .eq('branch', student.branch)
    .eq('stages', student.stages)
    .eq('grades', student.grades)
    .eq('sections', student.sections);

  if (subject) query = query.eq('subject', subject);
  query = applySubjectScope(query, user);

  const { data: classRows, error } = await query;
  if (error) return fail(res, 'تعذّر جلب بيانات المقارنة', 500);

  const studentRows = classRows.filter(r => r.student_id === studentId).map(withTotal);

  const classAverage = {};
  SCORE_COLS.concat('total').forEach(col => {
    const values = classRows
      .map(withTotal)
      .map(r => r[col])
      .filter(v => v !== null && v !== undefined && !isNaN(v));
    classAverage[col] = values.length
      ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100
      : null;
  });

  return ok(res, {
    student: studentRows,
    classAverage,
    classSize: new Set(classRows.map(r => r.student_id)).size
  });
}
