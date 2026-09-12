import supabase from './supabase.js';

/** يسجّل حركة في audit_log — لا يوقف الطلب الأساسي إن فشل التسجيل نفسه */
export async function logAudit(user, action, details) {
  try {
    await supabase.from('audit_log').insert({
      emp_id: user?.employeeId || null,
      emp_name: user?.name || null,
      role: user?.role || null,
      action,
      details: details || null
    });
  } catch (e) {
    console.error('audit log insert failed:', e.message);
  }
}
