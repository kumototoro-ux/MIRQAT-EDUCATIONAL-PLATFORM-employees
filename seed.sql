-- =========================================================
--  Seed: أول حساب أدمن + إعدادات النظام الفعلية (من Settings.html)
--  آمن للتشغيل أكثر من مرة (ON CONFLICT DO NOTHING)
-- =========================================================

-- ---------- حساب الأدمن ----------
-- غيّر name_ar إذا حاب اسم مختلف يظهر في الموقع
INSERT INTO employees (id, name_ar, role, branch, stages, grades, sections)
VALUES ('E001', 'أنس', 'admin', NULL, NULL, NULL, NULL)
ON CONFLICT (id) DO NOTHING;
-- ملاحظة: branch/stages/grades/sections تُركت فارغة عمدًا — دور admin
-- يتجاوز كل تقييد نطاق تلقائيًا في الكود (lib/scope.js)، فلا حاجة لتحديد
-- "كل الفروع وكل الصفوف" يدويًا، هذا هو معناها الفعلي بالفراغ + role=admin.

INSERT INTO staff_accounts (employee_id, username, password_hash)
VALUES ('E001', 'anas1122', crypt('ggff112233g', gen_salt('bf')))
ON CONFLICT (username) DO NOTHING;

-- ---------- معلومات المدرسة ----------
UPDATE school_info SET
  school_name = 'مدرسة دار الهدى',
  logo_url = 'https://imgur.com/a/eQ6fMj0', -- ⚠️ رابط ألبوم وليس صورة مباشرة، غيّره لاحقًا
  updated_at = now()
WHERE id = 1;

-- ---------- الفروع ----------
INSERT INTO settings_lists (list_key, value, sort_order) VALUES
  ('branches', 'نظام انتساب', 1),
  ('branches', 'تعليم عن بعد', 2)
ON CONFLICT (list_key, value) DO NOTHING;

-- ---------- المراحل ----------
INSERT INTO settings_lists (list_key, value, sort_order) VALUES
  ('stages', 'المتوسطة', 1),
  ('stages', 'الثانوية', 2)
ON CONFLICT (list_key, value) DO NOTHING;

-- ---------- الصفوف ----------
INSERT INTO settings_lists (list_key, value, sort_order) VALUES
  ('grades', 'الصف الأول المتوسط', 1),
  ('grades', 'الصف الثاني المتوسط', 2),
  ('grades', 'الصف الثالث المتوسط', 3),
  ('grades', 'الصف الأول الثانوي', 4),
  ('grades', 'الصف الثاني الثانوي', 5),
  ('grades', 'الصف الثالث الثانوي', 6)
ON CONFLICT (list_key, value) DO NOTHING;

-- ---------- الشعب ----------
INSERT INTO settings_lists (list_key, value, sort_order) VALUES
  ('sections', 'الشعبة1', 1)
ON CONFLICT (list_key, value) DO NOTHING;

-- ---------- المواد ----------
INSERT INTO settings_lists (list_key, value, sort_order) VALUES
  ('subject', 'القران الكريم', 1),
  ('subject', 'الدراسات الأسلامية', 2),
  ('subject', 'اللغة العربية', 3),
  ('subject', 'الدراسات الاجتماعية', 4),
  ('subject', 'الرياضيات', 5),
  ('subject', 'العلوم', 6),
  ('subject', 'اللغة الانجليزية', 7),
  ('subject', 'المهارات الرقمية', 8),
  ('subject', 'التربية الفنية', 9),
  ('subject', 'التربية البدنية و الدفاع عن النفس', 10),
  ('subject', 'المهرات الحياتية والتربية الاسرية', 11),
  ('subject', 'التفكير الناقد', 12),
  ('subject', 'احياء  1', 13),
  ('subject', 'كيمياء 1', 14),
  ('subject', 'فيزياء 1', 15),
  ('subject', 'كفايات لغوية 1', 16),
  ('subject', 'رياضيات 1', 17),
  ('subject', 'القران الكريم وتفسيره', 18),
  ('subject', 'كل المواد ادمن فقط', 19),
  ('subject', 'احياء  2', 20),
  ('subject', 'رياضيات 2', 21)
ON CONFLICT (list_key, value) DO NOTHING;

-- ---------- أنواع المستخدمين ----------
INSERT INTO settings_lists (list_key, value, sort_order) VALUES
  ('user_types', 'admin', 1),
  ('user_types', 'teacher', 2),
  ('user_types', 'student', 3)
ON CONFLICT (list_key, value) DO NOTHING;

-- ---------- الأدوار (كما هي في ملفك، بدون تصحيح role_studen) ----------
INSERT INTO settings_lists (list_key, value, sort_order) VALUES
  ('roles', 'role_admin', 1),
  ('roles', 'role_teacher', 2),
  ('roles', 'role_studen', 3)
ON CONFLICT (list_key, value) DO NOTHING;

-- ---------- حالات الحساب ----------
INSERT INTO settings_lists (list_key, value, sort_order) VALUES
  ('account_statuses', 'active', 1),
  ('account_statuses', 'inactive', 2),
  ('account_statuses', 'suspended', 3)
ON CONFLICT (list_key, value) DO NOTHING;

-- ---------- حالات الحضور ----------
INSERT INTO settings_lists (list_key, value, sort_order) VALUES
  ('attendance_statuses', 'حاضر', 1),
  ('attendance_statuses', 'غائب', 2),
  ('attendance_statuses', 'متأخر', 3),
  ('attendance_statuses', 'مستأذن', 4)
ON CONFLICT (list_key, value) DO NOTHING;

-- ---------- الترمات ----------
INSERT INTO settings_lists (list_key, value, sort_order) VALUES
  ('terms', 'الترم الأول', 1),
  ('terms', 'الترم الثاني', 2)
ON CONFLICT (list_key, value) DO NOTHING;

-- ---------- حالة السلوك ----------
INSERT INTO settings_lists (list_key, value, sort_order) VALUES
  ('behavior_statuses', 'ايجابي', 1),
  ('behavior_statuses', 'سلبي', 2)
ON CONFLICT (list_key, value) DO NOTHING;

-- ---------- نوع التقييم المستمر ----------
INSERT INTO settings_lists (list_key, value, sort_order) VALUES
  ('continuous_eval_types', 'واجبات', 1),
  ('continuous_eval_types', 'بحوث و تقارير', 2),
  ('continuous_eval_types', 'اوراق عمل', 3),
  ('continuous_eval_types', 'المشاركة و تفاعل', 4),
  ('continuous_eval_types', 'اختبارات قصيرة', 5),
  ('continuous_eval_types', 'اختبارات شهرية', 6)
ON CONFLICT (list_key, value) DO NOTHING;

-- ---------- الاختبارات ----------
INSERT INTO settings_lists (list_key, value, sort_order) VALUES
  ('exam_types', 'اختبارات قصيرة', 1),
  ('exam_types', 'اختبار شهري', 2),
  ('exam_types', 'اختبار نهائي', 3)
ON CONFLICT (list_key, value) DO NOTHING;

-- ---------- التحكم بعرض النتائج/الدرجات/جدول الاختبارات ----------
INSERT INTO visibility_settings (setting_key, values) VALUES
  ('results_control', '["الصف الثاني الثانوي", "الصف الثالث الثانوي"]'::jsonb),
  ('grades_control', '["الكل"]'::jsonb),
  ('exam_schedule_visible', '["لا"]'::jsonb)
ON CONFLICT (setting_key) DO UPDATE SET values = EXCLUDED.values, updated_at = now();
