-- =========================================================
-- CLASSROOM CONNECT
-- Migration 7: Auth provisioning workflow, hardening, & domain configuration
-- =========================================================

-- ---------------------------------------------------------
-- 1. INSTITUTION SETTINGS TABLE
-- Configurable institutional parameters (e.g. email domain, college name)
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.institution_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.institution_settings ENABLE ROW LEVEL SECURITY;

-- Seed default institution settings
INSERT INTO public.institution_settings (key, value, description)
VALUES
    ('allowed_email_domain', 'classroom.local', 'Permitted institutional email domain for accounts (e.g. college.edu or classroom.local)'),
    ('institution_name', 'Classroom Connect Institute of Technology', 'Official institutional name displayed across portal'),
    ('department_name', 'Department of Computer Science & Engineering', 'Academic department name'),
    ('public_signup_enabled', 'false', 'Flag indicating whether public self-registration is permitted (strictly false)')
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    description = EXCLUDED.description,
    updated_at = NOW();

-- Policies for institution_settings:
-- Authenticated users can view settings
CREATE POLICY authenticated_read_institution_settings
ON public.institution_settings
FOR SELECT TO authenticated
USING (TRUE);

-- Admin can manage institution settings
CREATE POLICY admin_manage_institution_settings
ON public.institution_settings
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Privilege grants
GRANT SELECT ON public.institution_settings TO authenticated;
GRANT ALL ON public.institution_settings TO service_role;

-- Helper to retrieve setting securely
CREATE OR REPLACE FUNCTION public.get_institution_setting(setting_key TEXT)
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT value
    FROM public.institution_settings
    WHERE key = setting_key
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_institution_setting(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_institution_setting(TEXT) TO authenticated, service_role;


-- ---------------------------------------------------------
-- 2. HARDEN FACULTY ATTENDANCE UPDATE POLICY
-- Enforces:
--  - Faculty must be active
--  - Session must be non-finalized (draft or in_progress)
--  - Faculty must be allocated to the subject
--  - Student must be active
--  - marked_by must match authenticated user
-- ---------------------------------------------------------

DROP POLICY IF EXISTS faculty_update_attendance_records ON public.attendance_records;

CREATE POLICY faculty_update_attendance_records
ON public.attendance_records
FOR UPDATE TO authenticated
USING (
    public.is_faculty()
    AND EXISTS (
        SELECT 1
        FROM public.attendance_sessions AS s
        WHERE s.id = session_id
          AND s.faculty_id = (SELECT public.current_faculty_id())
          AND s.status IN ('draft', 'in_progress')
          AND public.faculty_can_access_subject(s.subject_id)
    )
    AND EXISTS (
        SELECT 1
        FROM public.students AS st
        WHERE st.id = student_id
          AND st.is_active = TRUE
    )
)
WITH CHECK (
    public.is_faculty()
    AND marked_by = (SELECT auth.uid())
    AND EXISTS (
        SELECT 1
        FROM public.attendance_sessions AS s
        WHERE s.id = session_id
          AND s.faculty_id = (SELECT public.current_faculty_id())
          AND s.status IN ('draft', 'in_progress')
          AND public.faculty_can_access_subject(s.subject_id)
    )
    AND EXISTS (
        SELECT 1
        FROM public.students AS st
        WHERE st.id = student_id
          AND st.is_active = TRUE
    )
);


-- ---------------------------------------------------------
-- 3. HARDEN ATTENDANCE FINALIZATION VALIDATION
-- Validates:
--  - Session exists and is 'in_progress'
--  - Faculty is authorized (or admin)
--  - Every single active student in the classroom roster has a record
--  - No inactive students have attendance records in this session
--  - Total records match total active student roster count exactly
-- ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.finalize_attendance_session(
    target_session_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    target_session public.attendance_sessions%ROWTYPE;
    total_active_students INTEGER;
    marked_records INTEGER;
    missing_students_count INTEGER;
    missing_student_rolls TEXT;
    inactive_records_count INTEGER;
    inactive_student_rolls TEXT;
BEGIN
    SELECT *
    INTO target_session
    FROM public.attendance_sessions
    WHERE id = target_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Attendance session not found';
    END IF;

    IF NOT (
        public.is_admin()
        OR (
            target_session.faculty_id = public.current_faculty_id()
            AND public.faculty_can_access_subject(target_session.subject_id)
        )
    ) THEN
        RAISE EXCEPTION 'Not authorized to finalize this session';
    END IF;

    IF target_session.status <> 'in_progress' THEN
        RAISE EXCEPTION 'Only in-progress sessions can be finalized (current status: %)', target_session.status;
    END IF;

    -- 1. Check for any active students missing from attendance records
    SELECT
        COUNT(*),
        COALESCE(string_agg(st.roll_number, ', ' ORDER BY st.roll_number), '')
    INTO
        missing_students_count,
        missing_student_rolls
    FROM public.students st
    WHERE st.is_active = TRUE
      AND NOT EXISTS (
          SELECT 1
          FROM public.attendance_records ar
          WHERE ar.session_id = target_session_id
            AND ar.student_id = st.id
      );

    IF missing_students_count > 0 THEN
        RAISE EXCEPTION 'Attendance incomplete. Missing % active student(s): %',
            missing_students_count, missing_student_rolls;
    END IF;

    -- 2. Check for any records marked for inactive students
    SELECT
        COUNT(*),
        COALESCE(string_agg(st.roll_number, ', ' ORDER BY st.roll_number), '')
    INTO
        inactive_records_count,
        inactive_student_rolls
    FROM public.attendance_records ar
    JOIN public.students st ON st.id = ar.student_id
    WHERE ar.session_id = target_session_id
      AND st.is_active = FALSE;

    IF inactive_records_count > 0 THEN
        RAISE EXCEPTION 'Session contains attendance for % inactive student(s): %',
            inactive_records_count, inactive_student_rolls;
    END IF;

    -- 3. Verify total counts match active roster exactly
    SELECT COUNT(*) INTO total_active_students
    FROM public.students
    WHERE is_active = TRUE;

    SELECT COUNT(*) INTO marked_records
    FROM public.attendance_records
    WHERE session_id = target_session_id;

    IF marked_records <> total_active_students THEN
        RAISE EXCEPTION 'Roster mismatch: % marked records vs % active students',
            marked_records, total_active_students;
    END IF;

    -- Finalize session
    UPDATE public.attendance_sessions
    SET status = 'finalized',
        finalized_at = NOW(),
        updated_at = NOW()
    WHERE id = target_session_id;

    -- Audit log
    INSERT INTO public.attendance_audit_logs (
        session_id,
        action,
        performed_by,
        details
    )
    VALUES (
        target_session_id,
        'session_finalized',
        auth.uid(),
        jsonb_build_object(
            'total_students_marked', marked_records,
            'finalized_at', NOW()
        )
    );
END;
$$;


-- ---------------------------------------------------------
-- 4. AUTH-TO-PROFILE PROVISIONING & DOMAIN RESTRICTION TRIGGER
-- Automatically creates/links profile and roster records on user creation.
-- Validates that user email strictly adheres to the configured institutional domain.
-- ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    allowed_domain TEXT;
    email_domain TEXT;
    user_role TEXT;
    user_full_name TEXT;
    target_roll TEXT;
    target_emp_id TEXT;
    signup_allowed TEXT;
    is_admin_provisioned BOOLEAN;
BEGIN
    IF TG_NAME IS NULL THEN
        RAISE EXCEPTION 'Trigger function cannot be called directly';
    END IF;

    -- Read institutional email domain setting
    SELECT value INTO allowed_domain
    FROM public.institution_settings
    WHERE key = 'allowed_email_domain';

    IF allowed_domain IS NULL OR allowed_domain = '' THEN
        allowed_domain := 'classroom.local';
    END IF;

    -- Check if domain matches
    email_domain := LOWER(split_part(NEW.email, '@', 2));
    IF email_domain <> LOWER(allowed_domain) THEN
        RAISE EXCEPTION 'Registration denied: Email "%" does not belong to institutional domain "@%"',
            NEW.email, allowed_domain;
    END IF;

    -- Check if public signups are enabled or if this is admin-provisioned
    SELECT value INTO signup_allowed
    FROM public.institution_settings
    WHERE key = 'public_signup_enabled';

    is_admin_provisioned := COALESCE((NEW.raw_app_meta_data->>'admin_provisioned')::boolean, FALSE)
                            OR COALESCE((NEW.raw_user_meta_data->>'admin_provisioned')::boolean, FALSE);

    -- If public signup is disabled and account was not provisioned, prevent arbitrary registration
    IF signup_allowed = 'false' AND NOT is_admin_provisioned AND (NEW.raw_app_meta_data->>'provider' = 'email') THEN
        -- Allow if pre-seeded in roster, otherwise reject
        IF NOT EXISTS (SELECT 1 FROM public.faculty WHERE email = NEW.email)
           AND NOT EXISTS (SELECT 1 FROM public.students WHERE email = NEW.email)
           AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE email = NEW.email) THEN
            RAISE EXCEPTION 'Public registration is disabled. Contact your college administrator for an account.';
        END IF;
    END IF;

    -- Determine role from metadata (defaulting safely to 'student' if omitted)
    user_role := LOWER(COALESCE(NEW.raw_user_meta_data->>'role', 'student'));
    IF user_role NOT IN ('admin', 'faculty', 'student') THEN
        user_role := 'student';
    END IF;

    user_full_name := COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        INITCAP(REPLACE(split_part(NEW.email, '@', 1), '.', ' '))
    );
    target_roll := NEW.raw_user_meta_data->>'roll_number';
    target_emp_id := NEW.raw_user_meta_data->>'employee_id';

    -- 1. Create or update profile
    INSERT INTO public.profiles (
        id,
        full_name,
        email,
        role,
        is_active
    )
    VALUES (
        NEW.id,
        user_full_name,
        NEW.email,
        user_role,
        TRUE
    )
    ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        role = EXCLUDED.role,
        updated_at = NOW();

    -- 2. Link or create roster entry for faculty or student
    IF user_role = 'faculty' THEN
        IF EXISTS (SELECT 1 FROM public.faculty WHERE email = NEW.email) THEN
            UPDATE public.faculty
            SET profile_id = NEW.id,
                full_name = user_full_name,
                updated_at = NOW()
            WHERE email = NEW.email;
        ELSIF target_emp_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.faculty WHERE employee_id = target_emp_id) THEN
            UPDATE public.faculty
            SET profile_id = NEW.id,
                email = NEW.email,
                full_name = user_full_name,
                updated_at = NOW()
            WHERE employee_id = target_emp_id;
        ELSE
            INSERT INTO public.faculty (
                profile_id,
                employee_id,
                full_name,
                email,
                is_active
            )
            VALUES (
                NEW.id,
                COALESCE(target_emp_id, 'FAC' || LPAD(FLOOR(RANDOM() * 900 + 100)::TEXT, 3, '0')),
                user_full_name,
                NEW.email,
                TRUE
            );
        END IF;
    ELSIF user_role = 'student' THEN
        IF EXISTS (SELECT 1 FROM public.students WHERE email = NEW.email) THEN
            UPDATE public.students
            SET profile_id = NEW.id,
                full_name = user_full_name,
                updated_at = NOW()
            WHERE email = NEW.email;
        ELSIF target_roll IS NOT NULL AND EXISTS (SELECT 1 FROM public.students WHERE roll_number = target_roll) THEN
            UPDATE public.students
            SET profile_id = NEW.id,
                email = NEW.email,
                full_name = user_full_name,
                updated_at = NOW()
            WHERE roll_number = target_roll;
        ELSE
            INSERT INTO public.students (
                profile_id,
                roll_number,
                full_name,
                email,
                is_active
            )
            VALUES (
                NEW.id,
                COALESCE(target_roll, 'STU' || LPAD(FLOOR(RANDOM() * 900 + 100)::TEXT, 3, '0')),
                user_full_name,
                NEW.email,
                TRUE
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_auth_user();


-- ---------------------------------------------------------
-- 5. CASCADE INACTIVITY & PROFILE UPDATES TO ROSTER
-- Ensures when a profile is deactivated or modified, the student/faculty roster reflects it.
-- ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_profile_to_roster()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_NAME IS NULL THEN
        RAISE EXCEPTION 'Trigger function cannot be called directly';
    END IF;

    IF NEW.role = 'student' THEN
        UPDATE public.students
        SET full_name = NEW.full_name,
            email = NEW.email,
            is_active = NEW.is_active,
            updated_at = NOW()
        WHERE profile_id = NEW.id;
    ELSIF NEW.role = 'faculty' THEN
        UPDATE public.faculty
        SET full_name = NEW.full_name,
            email = NEW.email,
            is_active = NEW.is_active,
            updated_at = NOW()
        WHERE profile_id = NEW.id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_profile_changes ON public.profiles;
CREATE TRIGGER sync_profile_changes
AFTER UPDATE OF full_name, email, is_active ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_to_roster();


-- ---------------------------------------------------------
-- 6. ADMIN RPC: DEACTIVATE / REACTIVATE USER
-- Allows administrators to safely deactivate accounts with immediate effect.
-- ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_set_user_active(
    target_profile_id UUID,
    new_is_active BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only administrators can activate or deactivate accounts';
    END IF;

    IF target_profile_id = auth.uid() THEN
        RAISE EXCEPTION 'Administrators cannot deactivate their own account';
    END IF;

    UPDATE public.profiles
    SET is_active = new_is_active,
        updated_at = NOW()
    WHERE id = target_profile_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_active(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_active(UUID, BOOLEAN) TO authenticated, service_role;
