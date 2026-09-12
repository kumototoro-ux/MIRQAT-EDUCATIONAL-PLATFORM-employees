/**
 * الأدمن يرى كل شيء. المعلم مقيّد تلقائيًا بنطاقه المسجّل في حساب الموظف
 * الخاص به (branch/stages/grades/sections) — نفس قاعدة الصلاحيات في
 * النظام القديم: "أدمن (كل شيء) ومعلم (مقيّد بفرعه/مرحلته/صفه/شعبته)".
 */
export function applyEmployeeScope(query, user, cols = {}) {
  const { branchCol = 'branch', stageCol = 'stages', gradeCol = 'grades', sectionCol = 'sections' } = cols;
  if (user.role === 'admin') return query;

  if (user.branch) query = query.eq(branchCol, user.branch);
  if (user.stages) query = query.eq(stageCol, user.stages);
  if (user.grades) query = query.eq(gradeCol, user.grades);
  if (user.sections) query = query.eq(sectionCol, user.sections);
  return query;
}
