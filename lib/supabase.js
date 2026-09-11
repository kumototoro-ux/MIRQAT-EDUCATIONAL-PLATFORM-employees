import { createClient } from '@supabase/supabase-js';

// service role key يتجاوز RLS — التحكم بالصلاحيات يتم بالكامل في كود الـ API
// (نفس قرار مشروع SEAP: لا اعتماد على Supabase RLS)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

export default supabase;
