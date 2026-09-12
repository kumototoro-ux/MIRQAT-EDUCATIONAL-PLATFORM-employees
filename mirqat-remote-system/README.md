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
- ✅ `api/auth.js` — المصادقة وإدارة الحسابات
- ✅ `api/students.js` — إدارة الطلاب (مقيّد بنطاق المعلم)
- ✅ `api/employees.js` — إدارة الموظفين (أدمن فقط)
- ✅ `api/schedule.js` — التقويم الدراسي وجدول الحصص/الاختبارات
- ✅ `api/attendance.js` — التحضير والغياب
- ✅ `api/tasks.js` — المهام/التكاليف + الإثراءات والفيديوهات (منفصلان)
- ✅ `api/grading.js` — رصد الدرجات اليومي (يغذّي تجميع الدرجات التلقائي)
- ✅ `api/behavior.js` — السلوك
- ✅ `api/reports.js` — التقارير وبطاقة الطالب ومقارنة الشعبة
- ✅ `api/audit.js` — سجل التتبع وملخص النشاط ولوحة التحكم
- ✅ `api/settings.js` — القوائم، معلومات المدرسة، توزيع المواد والدرجات

**11 من 12 ملف API مُستخدمة — ملف واحد احتياطي متبقٍ لأي ميزة مستقبلية غير متوقعة.**

## المتبقي (واجهة المستخدم)
كل الـ Backend جاهز بالكامل. المتبقي هو بناء صفحات الواجهة (HTML/CSS/JS) لكل
ميزة تتصل بهذه الـ APIs — حاليًا فقط صفحة الدخول ولوحة تحكم مؤقتة جاهزتان.

## قاعدة صارمة عند إضافة أي ميزة جديدة
لا تُنشئ ملف API جديد أبدًا — أضف action جديد داخل أحد الملفات الموجودة
(نفس نمط `api/auth.js`: `switch(action)`).
