-- تشغيل مرة واحدة: يضيف عمود الأسبوع لجدول رصد الدرجات (كان موجودًا بالتحضير فقط)
ALTER TABLE daily_follow_up ADD COLUMN IF NOT EXISTS week TEXT;
CREATE INDEX IF NOT EXISTS idx_dfu_week ON daily_follow_up (term, week);
CREATE INDEX IF NOT EXISTS idx_attendance_term_week ON attendance (term, week);
CREATE INDEX IF NOT EXISTS idx_attendance_branch ON attendance (branch);
CREATE INDEX IF NOT EXISTS idx_dfu_branch ON daily_follow_up (branch);
