-- تشغيل مرة واحدة: يضيف عمود الأسبوع لجدول رصد الدرجات (كان موجودًا بالتحضير فقط)
ALTER TABLE daily_follow_up ADD COLUMN IF NOT EXISTS week TEXT;
CREATE INDEX IF NOT EXISTS idx_dfu_week ON daily_follow_up (term, week);
