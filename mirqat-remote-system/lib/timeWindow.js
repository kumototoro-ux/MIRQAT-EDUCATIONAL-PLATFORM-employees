/**
 * يُستخدم لفرض قيود وقت التعديل/الحذف على سجلات الحركات (رصد، تحضير...).
 * الأدمن دائمًا معفى من هذه القيود (يُتحقق من ذلك في الملف المستدعي).
 */

/** ISO timestamp قبل N ساعة من الآن — يُستخدم كحد أدنى (created_at >= هذا) في استعلامات SQL */
export function windowCutoffIso(hours) {
  return new Date(Date.now() - hours * 3600 * 1000).toISOString();
}

export const EDIT_WINDOW_HOURS = {
  grading: 6 * 24,      // 6 أيام
  attendance: 3 * 24,   // 3 أيام
  task: 6 * 24          // 6 أيام (نفس رصد الدرجات)
};

export const DELETE_WINDOW_HOURS = {
  grading: 6,
  attendance: 6,
  task: 6
};
