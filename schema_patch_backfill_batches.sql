-- ============================================================
-- يجمّع كل السجلات القديمة التي بلا batch_id في "كشوفات" صحيحة —
-- كل الطلاب الذين رُصدوا بنفس التكليف/نوع التقييم/المادة/التاريخ/
-- المعلم يُعطَون نفس المعرّف المشترك، فتظهر كبطاقة واحدة تحوي
-- كل الطلاب بدل بطاقة منفصلة لكل طالب.
-- آمن للتشغيل أكثر من مرة (يعمل فقط على batch_id IS NULL).
-- ============================================================

-- ---------- رصد الدرجات ----------
WITH groups AS (
  SELECT DISTINCT
    task_name, eval_type, subject, term, week, recorded_date, employee_id,
    gen_random_uuid() AS new_batch_id
  FROM daily_follow_up
  WHERE batch_id IS NULL
)
UPDATE daily_follow_up d
SET batch_id = g.new_batch_id
FROM groups g
WHERE d.batch_id IS NULL
  AND d.task_name    IS NOT DISTINCT FROM g.task_name
  AND d.eval_type     IS NOT DISTINCT FROM g.eval_type
  AND d.subject       IS NOT DISTINCT FROM g.subject
  AND d.term          IS NOT DISTINCT FROM g.term
  AND d.week          IS NOT DISTINCT FROM g.week
  AND d.recorded_date IS NOT DISTINCT FROM g.recorded_date
  AND d.employee_id   IS NOT DISTINCT FROM g.employee_id;

-- ---------- التحضير ----------
WITH groups AS (
  SELECT DISTINCT
    term, week, day, period, subject, branch, employee_id,
    gen_random_uuid() AS new_batch_id
  FROM attendance
  WHERE batch_id IS NULL
)
UPDATE attendance a
SET batch_id = g.new_batch_id
FROM groups g
WHERE a.batch_id IS NULL
  AND a.term        IS NOT DISTINCT FROM g.term
  AND a.week        IS NOT DISTINCT FROM g.week
  AND a.day         IS NOT DISTINCT FROM g.day
  AND a.period      IS NOT DISTINCT FROM g.period
  AND a.subject     IS NOT DISTINCT FROM g.subject
  AND a.branch      IS NOT DISTINCT FROM g.branch
  AND a.employee_id IS NOT DISTINCT FROM g.employee_id;

-- ---------- تحقق سريع بعد التنفيذ ----------
SELECT 'رصد بلا كشف بعد' AS what, count(*) FROM daily_follow_up WHERE batch_id IS NULL
UNION ALL
SELECT 'تحضير بلا كشف بعد', count(*) FROM attendance WHERE batch_id IS NULL;
