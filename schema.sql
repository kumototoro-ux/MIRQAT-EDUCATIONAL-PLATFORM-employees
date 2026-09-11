-- =========================================================
--  Mirqat "نظام عن بعد و انتساب" — Employee Portal
--  Supabase PostgreSQL schema — migrated from Google Apps Script
--  Idempotent: safe to run multiple times
-- =========================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- إعدادات النظام (قوائم قابلة للتوسعة) ----------
-- كل عمود في شيت Settings كان قائمة مستقلة — هنا كل قائمة صف في نفس الجدول
CREATE TABLE IF NOT EXISTS settings_lists (
  id SERIAL PRIMARY KEY,
  list_key TEXT NOT NULL,      -- 'branches' | 'stages' | 'grades' | 'sections' | 'subject' |
                                -- 'user_types' | 'roles' | 'account_statuses' |
                                -- 'attendance_statuses' | 'terms' | 'behavior_statuses' |
                                -- 'continuous_eval_types' | 'exam_types'
  value TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (list_key, value)
);
CREATE INDEX IF NOT EXISTS idx_settings_lists_key ON settings_lists (list_key);

-- معلومات المدرسة (صف واحد فقط)
CREATE TABLE IF NOT EXISTS school_info (
  id INT PRIMARY KEY DEFAULT 1,
  school_name TEXT NOT NULL DEFAULT 'مِرقاة',
  logo_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);
INSERT INTO school_info (id, school_name) VALUES (1, 'مِرقاة')
  ON CONFLICT (id) DO NOTHING;

-- التحكم بعرض النتائج/الدرجات للطلاب (مفتاح -> قائمة قيم مسموحة)
CREATE TABLE IF NOT EXISTS visibility_settings (
  setting_key TEXT PRIMARY KEY,   -- 'results_control' | 'grades_control'
  values JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- الموظفون ----------
CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,               -- 'E001'
  national_id TEXT,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  user_type TEXT,                    -- user_types
  role TEXT NOT NULL,                -- 'admin' | 'teacher' | ...
  gender TEXT,
  branch TEXT,
  stages TEXT,
  grades TEXT,
  sections TEXT,
  subject TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  deleted_at TIMESTAMPTZ,            -- soft delete
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS staff_accounts (
  user_id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  employee_id TEXT REFERENCES employees(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- الطلاب ----------
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,               -- 'S0001'
  national_id TEXT,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  nationality TEXT,
  dob DATE,
  gender TEXT,
  branch TEXT,
  stages TEXT,
  grades TEXT,
  sections TEXT,
  fees_status TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS student_accounts (
  user_id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  student_id TEXT REFERENCES students(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- التقويم الدراسي ----------
CREATE TABLE IF NOT EXISTS school_calendar (
  id SERIAL PRIMARY KEY,
  term TEXT,
  period TEXT,
  week TEXT,
  week_start_date DATE,
  week_end_date DATE,
  event TEXT,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- جدول الحصص والاختبارات ----------
CREATE TABLE IF NOT EXISTS class_timetable (
  id SERIAL PRIMARY KEY,
  branch TEXT, stage TEXT, grade TEXT, section TEXT,
  entry_type TEXT,              -- 'حصة' | 'اختبار'
  day TEXT,
  period_number INT,
  exam_date DATE,
  exam_time TEXT,
  exam_period TEXT,
  subject TEXT,
  employee_id TEXT REFERENCES employees(id),
  employee_name TEXT,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_timetable_scope ON class_timetable (branch, stage, grade, section);

-- ---------- التحضير والغياب ----------
CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
  student_id TEXT REFERENCES students(id),
  student_name TEXT,
  branch TEXT, term TEXT, week TEXT, day TEXT,
  period TEXT,
  status TEXT,                  -- attendance_statuses
  note TEXT,
  subject TEXT,
  employee_id TEXT REFERENCES employees(id),
  employee_name TEXT,
  person_type TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_edited BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance (student_id, term, week);
CREATE INDEX IF NOT EXISTS idx_attendance_employee ON attendance (employee_id);

-- ---------- المهام والتكاليف والاختبارات (منفصلة تمامًا عن الإثراءات) ----------
CREATE TABLE IF NOT EXISTS task_assignments (
  id SERIAL PRIMARY KEY,
  employee_id TEXT REFERENCES employees(id),
  employee_name TEXT,
  branch TEXT, stages TEXT, grades TEXT, sections TEXT, subject TEXT,
  eval_type TEXT,                  -- نوع التقييم: واجب/اختبار قصير/اختبار شهري...
  task_name TEXT NOT NULL,
  task_details TEXT,
  link TEXT,
  max_score NUMERIC,
  issue_date DATE,
  due_date DATE,
  due_time TEXT,
  is_graded BOOLEAN NOT NULL DEFAULT false,
  graded_at TIMESTAMPTZ,
  is_edited BOOLEAN NOT NULL DEFAULT false,
  term TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_assign_employee ON task_assignments (employee_id);
CREATE INDEX IF NOT EXISTS idx_task_assign_scope ON task_assignments (branch, stages, grades, sections, subject);

-- ---------- الإثراءات والفيديوهات (جدول مستقل — بدون درجات أو استحقاق) ----------
CREATE TABLE IF NOT EXISTS enrichment_content (
  id SERIAL PRIMARY KEY,
  employee_id TEXT REFERENCES employees(id),
  employee_name TEXT,
  branch TEXT, stages TEXT, grades TEXT, sections TEXT, subject TEXT,
  content_type TEXT NOT NULL,      -- 'فيديو' | 'إثراء' | ...أي نوع عرض تضيفه لاحقًا
  title TEXT NOT NULL,
  details TEXT,
  link TEXT,
  term TEXT,
  publish_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_enrichment_employee ON enrichment_content (employee_id);
CREATE INDEX IF NOT EXISTS idx_enrichment_scope ON enrichment_content (branch, stages, grades, sections, subject);

-- تتبع مشاهدة كل طالب لكل عنصر إثراء (يقابل عمود "هل تم رؤيته" في Student_Views)
CREATE TABLE IF NOT EXISTS enrichment_views (
  id SERIAL PRIMARY KEY,
  enrichment_id INT NOT NULL REFERENCES enrichment_content(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  is_seen BOOLEAN NOT NULL DEFAULT false,
  seen_at TIMESTAMPTZ,
  UNIQUE (enrichment_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_enrichment_views_student ON enrichment_views (student_id);

-- ---------- رصد الدرجات اليومي (Daily Follow up) ----------
CREATE TABLE IF NOT EXISTS daily_follow_up (
  id SERIAL PRIMARY KEY,
  student_id TEXT REFERENCES students(id),
  student_name TEXT,
  branch TEXT, stages TEXT, grades TEXT, sections TEXT, subject TEXT, term TEXT,
  eval_type TEXT,
  task_name TEXT,
  earned_score NUMERIC,
  max_score NUMERIC,
  recorded_date DATE,
  employee_id TEXT REFERENCES employees(id),
  employee_name TEXT,
  is_edited BOOLEAN NOT NULL DEFAULT false,
  edited_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dfu_student_term ON daily_follow_up (student_id, term, subject);
CREATE INDEX IF NOT EXISTS idx_dfu_employee ON daily_follow_up (employee_id);

-- ---------- السلوك ----------
CREATE TABLE IF NOT EXISTS behavior (
  id SERIAL PRIMARY KEY,
  student_id TEXT REFERENCES students(id),
  student_name TEXT,
  branch TEXT, term TEXT, week TEXT, day TEXT,
  status TEXT,                  -- ايجابي/سلبي...
  score NUMERIC,
  note TEXT,
  employee_id TEXT REFERENCES employees(id),
  employee_name TEXT,
  person_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_behavior_student ON behavior (student_id, term);

-- ---------- تجميع الدرجات (Grade Aggregation) ----------
CREATE TABLE IF NOT EXISTS grade_aggregation (
  id SERIAL PRIMARY KEY,
  student_id TEXT REFERENCES students(id),
  student_name TEXT,
  term TEXT, branch TEXT, stages TEXT, grades TEXT, sections TEXT, subject TEXT,
  homework NUMERIC,
  research_reports NUMERIC,
  worksheets NUMERIC,
  participation NUMERIC,
  quizzes NUMERIC,
  monthly_exams NUMERIC,
  final_exam NUMERIC,
  oral_exam NUMERIC,
  written_exam NUMERIC,
  is_visible BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, term, subject)
);
CREATE INDEX IF NOT EXISTS idx_grade_agg_student ON grade_aggregation (student_id, term);

-- ---------- توزيع الدرجات (نسبة كل نوع تقييم لكل مادة) ----------
CREATE TABLE IF NOT EXISTS grade_distribution (
  id SERIAL PRIMARY KEY,
  eval_type TEXT NOT NULL,
  percentage NUMERIC NOT NULL,
  subject TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- مصفوفة توزيع المواد (فرع/مرحلة/صف/شعبة -> مواد) ----------
CREATE TABLE IF NOT EXISTS subject_distribution_matrix (
  id SERIAL PRIMARY KEY,
  branch TEXT, stages TEXT, grades TEXT, sections TEXT,
  subject TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subject_matrix_scope ON subject_distribution_matrix (branch, stages, grades, sections);

-- ---------- سجل تتبع النشاطات (Audit Log) ----------
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  emp_id TEXT,
  emp_name TEXT,
  role TEXT,
  action TEXT,
  details TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_log_ts ON audit_log (ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_emp ON audit_log (emp_id);

-- ---------- تريغر تحديث updated_at تلقائيًا ----------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['employees','students','staff_accounts','student_accounts',
    'school_calendar','class_timetable','attendance','task_assignments','enrichment_content',
    'grade_aggregation','school_info']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_updated_at ON %I', t);
    EXECUTE format('CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON %I
                     FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
  END LOOP;
END $$;

-- =========================================================
--  تجميع الدرجات التلقائي (يعوّض updateGradeAggregation في أب سكربت)
--  الفرق الجوهري: هنا يُعاد حساب صف واحد فقط (الطالب/الترم/المادة
--  المتأثرين) بدل إعادة حساب كل الطلاب من الصفر عند كل تغيير —
--  وهذا هو مصدر البطء الأساسي في النسخة القديمة.
--  الأوزان تُقرأ من جدول grade_distribution (مصدر حقيقة واحد)
--  بدل كتابتها ثابتة داخل الكود.
-- =========================================================

-- حساب درجة نوع تقييم واحد لطالب/ترم/مادة معيّنة، مرجّحة بنسبتها من grade_distribution
CREATE OR REPLACE FUNCTION eval_score_(p_student_id TEXT, p_term TEXT, p_subject TEXT, p_eval_type TEXT)
RETURNS NUMERIC AS $$
DECLARE
  v_earned NUMERIC; v_max NUMERIC; v_weight NUMERIC;
BEGIN
  SELECT COALESCE(SUM(earned_score), 0), COALESCE(SUM(max_score), 0)
  INTO v_earned, v_max
  FROM daily_follow_up
  WHERE student_id = p_student_id AND term = p_term AND subject = p_subject AND eval_type = p_eval_type;

  IF v_max = 0 THEN RETURN NULL; END IF;

  SELECT percentage INTO v_weight
  FROM grade_distribution
  WHERE subject = p_subject AND eval_type = p_eval_type
  LIMIT 1;

  IF v_weight IS NULL THEN RETURN NULL; END IF;

  RETURN ROUND((v_earned / v_max) * v_weight, 2);
END;
$$ LANGUAGE plpgsql;

-- إعادة حساب/إدراج صف grade_aggregation واحد فقط لطالب/ترم/مادة معيّنة
CREATE OR REPLACE FUNCTION recalc_grade_aggregation_(p_student_id TEXT, p_term TEXT, p_subject TEXT)
RETURNS VOID AS $$
DECLARE
  v_student RECORD;
BEGIN
  SELECT name_ar, branch, stages, grades, sections INTO v_student
  FROM students WHERE id = p_student_id;
  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO grade_aggregation (
    student_id, student_name, term, branch, stages, grades, sections, subject,
    homework, research_reports, worksheets, participation, quizzes, monthly_exams,
    final_exam, oral_exam, written_exam, updated_at
  )
  VALUES (
    p_student_id, v_student.name_ar, p_term, v_student.branch, v_student.stages, v_student.grades, v_student.sections, p_subject,
    eval_score_(p_student_id, p_term, p_subject, 'واجبات'),
    eval_score_(p_student_id, p_term, p_subject, 'بحوث و تقارير'),
    eval_score_(p_student_id, p_term, p_subject, 'اوراق عمل'),
    eval_score_(p_student_id, p_term, p_subject, 'المشاركة و تفاعل'),
    eval_score_(p_student_id, p_term, p_subject, 'اختبارات قصيرة'),
    eval_score_(p_student_id, p_term, p_subject, 'اختبارات شهرية'),
    eval_score_(p_student_id, p_term, p_subject, 'اختبار نهائي'),
    eval_score_(p_student_id, p_term, p_subject, 'اختبار شفهي'),
    eval_score_(p_student_id, p_term, p_subject, 'اختبار تحريري'),
    now()
  )
  ON CONFLICT (student_id, term, subject) DO UPDATE SET
    student_name = EXCLUDED.student_name,
    branch = EXCLUDED.branch, stages = EXCLUDED.stages, grades = EXCLUDED.grades, sections = EXCLUDED.sections,
    homework = EXCLUDED.homework, research_reports = EXCLUDED.research_reports, worksheets = EXCLUDED.worksheets,
    participation = EXCLUDED.participation, quizzes = EXCLUDED.quizzes, monthly_exams = EXCLUDED.monthly_exams,
    final_exam = EXCLUDED.final_exam, oral_exam = EXCLUDED.oral_exam, written_exam = EXCLUDED.written_exam,
    updated_at = now();
    -- ملاحظة: is_visible لا يُلمس هنا إطلاقًا — يبقى تحت تحكم المعلم/الأدمن يدويًا (apiToggleGradeVisibility)
END;
$$ LANGUAGE plpgsql;

-- التريغر الذي يستدعي إعادة الحساب تلقائيًا عند أي تغيير في daily_follow_up
CREATE OR REPLACE FUNCTION trg_recalc_grade_agg_()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalc_grade_aggregation_(OLD.student_id, OLD.term, OLD.subject);
  ELSE
    PERFORM recalc_grade_aggregation_(NEW.student_id, NEW.term, NEW.subject);
    IF TG_OP = 'UPDATE' AND (
      OLD.student_id IS DISTINCT FROM NEW.student_id OR
      OLD.term IS DISTINCT FROM NEW.term OR
      OLD.subject IS DISTINCT FROM NEW.subject
    ) THEN
      PERFORM recalc_grade_aggregation_(OLD.student_id, OLD.term, OLD.subject);
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_daily_follow_up_recalc ON daily_follow_up;
CREATE TRIGGER trg_daily_follow_up_recalc
AFTER INSERT OR UPDATE OR DELETE ON daily_follow_up
FOR EACH ROW EXECUTE FUNCTION trg_recalc_grade_agg_();
