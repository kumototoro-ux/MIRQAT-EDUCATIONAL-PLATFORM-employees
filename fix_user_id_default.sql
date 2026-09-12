-- تشغيل مرة واحدة: يضيف توليد UUID تلقائي لعمود user_id إن لم يكن موجودًا
ALTER TABLE staff_accounts ALTER COLUMN user_id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE student_accounts ALTER COLUMN user_id SET DEFAULT gen_random_uuid()::text;
