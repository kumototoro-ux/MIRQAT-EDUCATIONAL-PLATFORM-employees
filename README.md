# مِرقاة — نظام عن بعد و انتساب (بوابة الموظفين)

تحويل النظام من Google Apps Script إلى Next.js/Node على Vercel + Supabase.

## 1) قاعدة البيانات
1. أنشئ مشروع جديد على supabase.com (الخطة المجانية)
2. افتح SQL Editor وشغّل `schema.sql` كاملًا (آمن للتشغيل أكثر من مرة)
3. من Project Settings > API انسخ: `Project URL` و `service_role key`

## 2) إنشاء أول حساب أدمن
شغّل في SQL Editor (غيّر القيم بين علامتي `<< >>`):

```sql
INSERT INTO employees (id, name_ar, role, branch)
VALUES ('E001', '<<اسمك بالعربي>>', 'admin', '<<اسم الفرع>>');

INSERT INTO staff_accounts (employee_id, username, password_hash)
VALUES ('E001', '<<اسم المستخدم>>', crypt('<<كلمة المرور>>', gen_salt('bf')));
```

## 3) رفع المشروع على GitHub
```bash
git init
git add .
git commit -m "init: مرقاة - بوابة الموظفين"
git branch -M main
git remote add origin https://github.com/<<اسم_المستخدم>>/<<اسم_المستودع>>.git
git push -u origin main
```

## 4) النشر على Vercel
1. استورد المستودع من github.com في vercel.com (خطة Hobby المجانية)
2. أضف متغيرات البيئة التالية في Project Settings > Environment Variables (انظر `.env.example`):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `JWT_SECRET` (نص عشوائي طويل — يمكن توليده بـ `openssl rand -hex 32`)
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
3. Deploy

## 5) Upstash Redis (تحديد معدل الطلبات)
أنشئ قاعدة بيانات مجانية على upstash.com، وانسخ `REST URL` و `REST TOKEN` من لوحة التحكم.

## حالة المشروع الحالية
- ✅ قاعدة البيانات كاملة + تجميع الدرجات التلقائي (trigger)
- ✅ المصادقة وإدارة الحسابات (`api/auth.js`) + صفحة تسجيل الدخول
- ⏳ باقي الميزات (الطلاب، الموظفين، الجدول، التحضير، التكاليف، الإثراءات،
  الدرجات، السلوك، التقارير، سجل التتبع) — ميزة واحدة في كل مرة، حسب الحد
  الأقصى 12 ملف API في Vercel Hobby.

## قاعدة صارمة عند إضافة أي ميزة جديدة
لا تُنشئ ملف API جديد أبدًا — أضف action جديد داخل أحد الملفات الموجودة
(نفس نمط `api/auth.js`: `switch(action)`).
