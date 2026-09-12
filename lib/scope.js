/**
 * الأدمن يرى كل شيء. المعلم مقيّد تلقائيًا بنطاقه المسجّل في حساب الموظف
 * الخاص به (branch/stages/grades/sections) — نفس قاعدة الصلاحيات في
 * النظام القديم: "أدمن (كل شيء) ومعلم (مقيّد بفرعه/مرحلته/صفه/شعبته)".
 *
 * مهم: حقل نطاق المعلم قد يحوي عدة قيم مفصولة بفاصلة (مثال:
 * "الصف الأول المتوسط, الصف الثاني المتوسط") لأن معلمًا واحدًا قد
 * يُسنَد لعدة صفوف أو مواد. لذلك نستخدم `.in()` بعد تفكيك القائمة
 * بدل `.eq()` بمطابقة تامة، وإلا ما كان راح يطابق أي شيء لمعلم
 * مسند لأكثر من قيمة.
 */
function splitScopeValues(value) {
  if (!value) return null;
  const list = String(value).split(',').map(v => v.trim()).filter(Boolean);
  return list.length ? list : null;
}

export function applyEmployeeScope(query, user, cols = {}) {
  const { branchCol = 'branch', stageCol = 'stages', gradeCol = 'grades', sectionCol = 'sections' } = cols;
  if (user.role === 'admin') return query;

  const branches = splitScopeValues(user.branch);
  const stages = splitScopeValues(user.stages);
  const grades = splitScopeValues(user.grades);
  const sections = splitScopeValues(user.sections);

  if (branches) query = query.in(branchCol, branches);
  if (stages) query = query.in(stageCol, stages);
  if (grades) query = query.in(gradeCol, grades);
  if (sections) query = query.in(sectionCol, sections);
  return query;
}

/** نفس الفكرة لعمود subject تحديدًا (يُستخدم في reports.js بشكل مباشر) */
export function applySubjectScope(query, user, subjectCol = 'subject') {
  if (user.role === 'admin') return query;
  const subjects = splitScopeValues(user.subject);
  if (subjects) query = query.in(subjectCol, subjects);
  return query;
}
