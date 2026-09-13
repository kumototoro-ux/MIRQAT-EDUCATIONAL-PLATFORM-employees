-- تعبئة يدوية: يضع "الثاني" في عمود week لكل سجلات الرصد التي ما زال
-- عمودها فارغًا (NULL) — استخدمه فقط إذا كنت متأكدًا أن كل هذي السجلات
-- فعليًا تخص الأسبوع الثاني.
UPDATE daily_follow_up
SET week = 'الثاني'
WHERE week IS NULL;

-- تحقق سريع بعد التنفيذ: يفترض يرجّع 0
SELECT count(*) AS still_empty FROM daily_follow_up WHERE week IS NULL;
