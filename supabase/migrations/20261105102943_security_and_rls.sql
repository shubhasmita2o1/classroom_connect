-- =========================================================
-- CLASSROOM CONNECT
-- Migration 4: Security foundation
-- =========================================================

-- Helper: Get the current user's role.
-- SECURITY DEFINER avoids recursive profile RLS checks.
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT p.role
    FROM public.profiles AS p
    WHERE p.id = (SELECT auth.uid())
      AND p.is_active = TRUE
    LIMIT 1;
$$;

-- Helper: Check whether the current user is an active admin.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles AS p
        WHERE p.id = (SELECT auth.uid())
          AND p.role = 'admin'
          AND p.is_active = TRUE
    );
$$;

-- Helper: Check whether the current user is an active faculty member.
CREATE OR REPLACE FUNCTION public.is_faculty()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles AS p
        WHERE p.id = (SELECT auth.uid())
          AND p.role = 'faculty'
          AND p.is_active = TRUE
    );
$$;

-- Helper: Check whether the current user is an active student.
CREATE OR REPLACE FUNCTION public.is_student()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles AS p
        WHERE p.id = (SELECT auth.uid())
          AND p.role = 'student'
          AND p.is_active = TRUE
    );
$$;

-- Helper: Get the current user's faculty record ID.
CREATE OR REPLACE FUNCTION public.current_faculty_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT f.id
    FROM public.faculty AS f
    JOIN public.profiles AS p
      ON p.id = f.profile_id
    WHERE p.id = (SELECT auth.uid())
      AND p.is_active = TRUE
      AND f.is_active = TRUE
    LIMIT 1;
$$;

-- Helper: Get the current user's student record ID.
CREATE OR REPLACE FUNCTION public.current_student_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT s.id
    FROM public.students AS s
    JOIN public.profiles AS p
      ON p.id = s.profile_id
    WHERE p.id = (SELECT auth.uid())
      AND p.is_active = TRUE
      AND s.is_active = TRUE
    LIMIT 1;
$$;

-- Helper: Check whether current faculty is allocated to the given subject.
CREATE OR REPLACE FUNCTION public.faculty_can_access_subject(
    target_subject_id UUID
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.faculty_subjects AS fs
        WHERE fs.faculty_id = public.current_faculty_id()
          AND fs.subject_id = target_subject_id
          AND fs.is_active = TRUE
      )
      OR public.is_admin();
$$;

-- Restrict helper function execution to authenticated and service_role only.
-- Anonymous access is strictly revoked.
REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_faculty() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_student() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_faculty_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_student_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.faculty_can_access_subject(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_faculty() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_student() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_faculty_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_student_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.faculty_can_access_subject(UUID) TO authenticated, service_role;

-- Enable Row Level Security on every application table.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faculty ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faculty_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_status ENABLE ROW LEVEL SECURITY;
