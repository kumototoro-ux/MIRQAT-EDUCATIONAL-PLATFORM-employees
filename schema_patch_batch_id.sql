-- تشغيل مرة واحدة: يضيف عمود batch_id يجمع كل طلاب نفس عملية الرصد/التحضير
-- (كشف واحد) تحت معرّف مشترك، بدل ما تُعرض كصفوف منفصلة بلا رابط بينها.
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS batch_id UUID;
ALTER TABLE daily_follow_up ADD COLUMN IF NOT EXISTS batch_id UUID;

CREATE INDEX IF NOT EXISTS idx_attendance_batch ON attendance (batch_id);
CREATE INDEX IF NOT EXISTS idx_dfu_batch ON daily_follow_up (batch_id);

-- السجلات القديمة (قبل هذا التحديث) ستبقى بلا batch_id — تُعرض كل واحدة
-- كـ"كشف من طالب واحد" تلقائيًا في الواجهة، ولا تسبب أي خطأ.
