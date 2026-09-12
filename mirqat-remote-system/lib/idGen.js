import supabase from './supabase.js';

/** يولّد المعرّف التالي بالاعتماد على أعلى رقم موجود بنفس البادئة (مثل S0001, E001) */
export async function generateNextId(table, prefix, padLength) {
  const { data, error } = await supabase
    .from(table)
    .select('id')
    .ilike('id', `${prefix}%`)
    .order('id', { ascending: false })
    .limit(1);

  if (error) throw new Error('تعذّر توليد المعرّف');

  let nextNum = 1;
  if (data && data.length > 0) {
    const num = parseInt(String(data[0].id).replace(prefix, ''), 10);
    if (!isNaN(num)) nextNum = num + 1;
  }
  return prefix + String(nextNum).padStart(padLength, '0');
}
