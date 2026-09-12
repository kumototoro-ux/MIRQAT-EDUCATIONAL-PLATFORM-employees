import supabase from './supabase.js';

/**
 * يحدد "الأسبوع الحالي" بذكاء:
 * 1) الأسبوع اللي اليوم يقع بين بدايته ونهايته (الحالة المثالية)
 * 2) إن ما وُجد (تقويم قديم أو مستقبلي بالكامل) → آخر أسبوع انتهى قبل اليوم
 * 3) إن ما وُجد أيضًا (كل التقويم بالمستقبل) → أقرب أسبوع قادم
 * هذا يمنع رجوع "لا يوجد أسبوع" بشكل دائم لمجرد أن بيانات التقويم لا تغطي
 * تاريخ اليوم الفعلي تمامًا.
 */
export async function resolveCurrentWeek(term) {
  const today = new Date().toISOString().slice(0, 10);

  let exactQ = supabase.from('school_calendar').select('term, week, week_start_date, week_end_date')
    .lte('week_start_date', today).gte('week_end_date', today).limit(1);
  if (term) exactQ = exactQ.eq('term', term);
  const { data: exact } = await exactQ.maybeSingle();
  if (exact) return exact;

  let pastQ = supabase.from('school_calendar').select('term, week, week_start_date, week_end_date')
    .lt('week_end_date', today).order('week_end_date', { ascending: false }).limit(1);
  if (term) pastQ = pastQ.eq('term', term);
  const { data: past } = await pastQ.maybeSingle();
  if (past) return past;

  let futureQ = supabase.from('school_calendar').select('term, week, week_start_date, week_end_date')
    .gt('week_start_date', today).order('week_start_date', { ascending: true }).limit(1);
  if (term) futureQ = futureQ.eq('term', term);
  const { data: future } = await futureQ.maybeSingle();
  return future || null;
}

/** كل أسابيع التقويم حتى اليوم (أو كلها إن ما وُجد أسبوع ماضٍ)، بالترتيب الزمني — لرسوم الاتجاه */
export async function getWeeksUpToToday(limit = 12) {
  const today = new Date().toISOString().slice(0, 10);
  let { data } = await supabase
    .from('school_calendar')
    .select('term, week, week_start_date, week_end_date')
    .lte('week_start_date', today)
    .order('week_start_date', { ascending: false })
    .limit(limit);

  if (!data || data.length === 0) {
    const res = await supabase
      .from('school_calendar')
      .select('term, week, week_start_date, week_end_date')
      .order('week_start_date', { ascending: false })
      .limit(limit);
    data = res.data;
  }
  return (data || []).reverse();
}
