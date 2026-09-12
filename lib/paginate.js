/**
 * يطبّق ترقيم صفحات فعلي من قاعدة البيانات (range) بدل جلب كل الصفوف.
 * الاستخدام: مرّر query مبني بـ supabase.from(table).select('*', { count: 'exact' })
 * ثم طبّق عليه applyPagination قبل التنفيذ.
 */
export function applyPagination(query, { page, pageSize } = {}) {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const size = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 25));
  const from = (p - 1) * size;
  const to = from + size - 1;
  return { query: query.range(from, to), page: p, pageSize: size };
}

/** يبني شكل استجابة موحّد لكل القوائم المُرقَّمة */
export function paginatedResult(rows, count, page, pageSize) {
  return {
    rows,
    total: count || 0,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil((count || 0) / pageSize))
  };
}
