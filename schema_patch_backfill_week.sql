-- تشغيل مرة واحدة: يعبّئ عمود week في daily_follow_up للسجلات القديمة
-- (التي أُدخلت قبل إضافة هذا العمود) اعتمادًا على مطابقة recorded_date
-- مع نطاق كل أسبوع في التقويم الدراسي.
UPDATE daily_follow_up df
SET week = sc.week, term = COALESCE(df.term, sc.term)
FROM school_calendar sc
WHERE df.week IS NULL
  AND df.recorded_date IS NOT NULL
  AND df.recorded_date BETWEEN sc.week_start_date AND sc.week_end_date;

-- أي سجلات لم تُطابق أي أسبوع (تاريخها خارج التقويم المستورد) تبقى بلا أسبوع،
-- وهذا متوقّع ولا يضر — فقط لن تظهر ضمن فلترة "سجل الرصد" بالأسبوع تحديدًا.
