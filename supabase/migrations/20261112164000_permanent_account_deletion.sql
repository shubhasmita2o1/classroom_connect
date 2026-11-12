-- =========================================================
-- CLASSROOM CONNECT
-- Migration 11: Safe Permanent Account Deletion & Data Integrity
--
-- Preserves all historical attendance records, sessions,
-- notifications, assignments, and audit logs when permanently
-- deleting a deactivated user's Supabase Auth identity and profile.
-- =========================================================

-- ---------------------------------------------------------
-- 1. ALLOW NULLABLE NOTIFICATIONS.PUBLISHED_BY WITH ON DELETE SET NULL
-- Preserves published announcements/notices when the author's
-- profile is permanently deleted.
-- ---------------------------------------------------------

ALTER TABLE public.notifications
    ALTER COLUMN published_by DROP NOT NULL;

DO $$
DECLARE
    fk_name TEXT;
BEGIN
    SELECT c.conname INTO fk_name
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid
     AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = 'public.notifications'::regclass
      AND c.contype = 'f'
      AND a.attname = 'published_by'
    LIMIT 1;

    IF fk_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.notifications DROP CONSTRAINT %I', fk_name);
    END IF;
END $$;

ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_published_by_fkey
    FOREIGN KEY (published_by)
    REFERENCES public.profiles(id)
    ON DELETE SET NULL;


-- ---------------------------------------------------------
-- 2. ARCHIVAL METADATA ON ROSTER TABLES (STUDENTS & FACULTY)
-- Marks retained historical roster records whose auth account
-- has been permanently deleted so academic history stays intact
-- and archived IDs cannot be accidentally overwritten.
-- ---------------------------------------------------------

ALTER TABLE public.students
    ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE public.faculty
    ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_students_archived
    ON public.students(is_archived);

CREATE INDEX IF NOT EXISTS idx_faculty_archived
    ON public.faculty(is_archived);


-- ---------------------------------------------------------
-- 3. PROTECT ARCHIVED ROSTER IDENTIFIERS IN AUTH PROVISIONING TRIGGER
-- Prevents a newly provisioned account from overwriting or
-- claiming an archived student/faculty historical identity.
-- ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    user_role TEXT;
    user_full_name TEXT;
    target_login_id TEXT;
    target_roll TEXT;
    target_emp_id TEXT;
    signup_allowed TEXT;
    is_admin_provisioned BOOLEAN;
BEGIN
    IF TG_NAME IS NULL THEN
        RAISE EXCEPTION 'Trigger function cannot be called directly';
    END IF;

    -- Check if public signups are enabled or if account is admin-provisioned
    SELECT value INTO signup_allowed
    FROM public.institution_settings
    WHERE key = 'public_signup_enabled';

    is_admin_provisioned := COALESCE((NEW.raw_app_meta_data->>'admin_provisioned')::boolean, FALSE)
                            OR COALESCE((NEW.raw_user_meta_data->>'admin_provisioned')::boolean, FALSE);

    -- Reject non-admin self-registration when public signups are disabled
    IF signup_allowed = 'false' AND NOT is_admin_provisioned AND (NEW.raw_app_meta_data->>'provider' = 'email') THEN
        IF NOT EXISTS (SELECT 1 FROM public.faculty WHERE email = NEW.email AND is_archived = FALSE)
           AND NOT EXISTS (SELECT 1 FROM public.students WHERE email = NEW.email AND is_archived = FALSE)
           AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE email = NEW.email) THEN
            RAISE EXCEPTION 'Public registration is disabled. Contact your college administrator for an account.';
        END IF;
    END IF;

    -- Determine role from metadata (defaulting safely to 'student' if omitted)
    user_role := LOWER(COALESCE(NEW.raw_user_meta_data->>'role', 'student'));
    IF user_role NOT IN ('admin', 'faculty', 'student') THEN
        user_role := 'student';
    END IF;

    -- Extract and normalize login_id (uppercase trimmed)
    target_login_id := UPPER(TRIM(COALESCE(
        NEW.raw_user_meta_data->>'login_id',
        split_part(NEW.email, '@', 1)
    )));

    -- Validate format
    IF target_login_id !~ '^[A-Z0-9_-]+$' THEN
        RAISE EXCEPTION 'Invalid Login ID format: %', target_login_id;
    END IF;

    user_full_name := COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        target_login_id
    );

    target_roll := COALESCE(NEW.raw_user_meta_data->>'roll_number', target_login_id);
    target_emp_id := COALESCE(NEW.raw_user_meta_data->>'employee_id', target_login_id);

    -- 1. Create or update profile
    INSERT INTO public.profiles (
        id,
        full_name,
        email,
        role,
        is_active,
        login_id
    )
    VALUES (
        NEW.id,
        user_full_name,
        NEW.email,
        user_role,
        TRUE,
        target_login_id
    )
    ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        role = EXCLUDED.role,
        login_id = COALESCE(EXCLUDED.login_id, public.profiles.login_id),
        updated_at = NOW();

    -- 2. Link or create roster entry for faculty or student
    IF user_role = 'faculty' THEN
        IF EXISTS (SELECT 1 FROM public.faculty WHERE employee_id = target_emp_id AND is_archived = TRUE) THEN
            RAISE EXCEPTION 'Employee ID % belongs to an archived historical faculty record and cannot be reused', target_emp_id;
        END IF;

        IF EXISTS (SELECT 1 FROM public.faculty WHERE email = NEW.email AND is_archived = FALSE) THEN
            UPDATE public.faculty
            SET profile_id = NEW.id,
                full_name = user_full_name,
                employee_id = target_emp_id,
                updated_at = NOW()
            WHERE email = NEW.email
              AND is_archived = FALSE;
        ELSIF EXISTS (SELECT 1 FROM public.faculty WHERE employee_id = target_emp_id AND is_archived = FALSE) THEN
            UPDATE public.faculty
            SET profile_id = NEW.id,
                email = NEW.email,
                full_name = user_full_name,
                updated_at = NOW()
            WHERE employee_id = target_emp_id
              AND is_archived = FALSE;
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
                target_emp_id,
                user_full_name,
                NEW.email,
                TRUE
            );
        END IF;
    ELSIF user_role = 'student' THEN
        IF EXISTS (SELECT 1 FROM public.students WHERE roll_number = target_roll AND is_archived = TRUE) THEN
            RAISE EXCEPTION 'Roll Number % belongs to an archived historical student record and cannot be reused', target_roll;
        END IF;

        IF EXISTS (SELECT 1 FROM public.students WHERE email = NEW.email AND is_archived = FALSE) THEN
            UPDATE public.students
            SET profile_id = NEW.id,
                full_name = user_full_name,
                roll_number = target_roll,
                updated_at = NOW()
            WHERE email = NEW.email
              AND is_archived = FALSE;
        ELSIF EXISTS (SELECT 1 FROM public.students WHERE roll_number = target_roll AND is_archived = FALSE) THEN
            UPDATE public.students
            SET profile_id = NEW.id,
                email = NEW.email,
                full_name = user_full_name,
                updated_at = NOW()
            WHERE roll_number = target_roll
              AND is_archived = FALSE;
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
                target_roll,
                user_full_name,
                NEW.email,
                TRUE
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$;


-- ---------------------------------------------------------
-- 4. SAFE UNLINKING OF MARKED_BY ON FINALIZED ATTENDANCE RECORDS
-- Allows admin_prepare_user_deletion() to clear marked_by = NULL
-- when deleting a faculty/admin profile without altering status,
-- student, session, or marked_at timestamp on finalized records.
-- ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prevent_finalized_attendance_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    target_session_id UUID;
    session_status TEXT;
BEGIN
    IF TG_NAME IS NULL THEN
        RAISE EXCEPTION 'Trigger function cannot be called directly';
    END IF;

    -- Attendance sessions once finalized can NEVER be modified or deleted by anyone
    IF TG_TABLE_NAME = 'attendance_sessions' THEN
        IF OLD.status = 'finalized' THEN
            RAISE EXCEPTION 'Finalized attendance session cannot be modified';
        END IF;

        RETURN NEW;
    END IF;

    -- For attendance records:
    IF TG_OP = 'DELETE' THEN
        target_session_id := OLD.session_id;
    ELSE
        target_session_id := NEW.session_id;
    END IF;

    SELECT status
    INTO session_status
    FROM public.attendance_sessions
    WHERE id = target_session_id;

    IF session_status = 'finalized' THEN
        -- Authorized administrator correction via correct_finalized_attendance()
        IF TG_OP = 'UPDATE'
           AND NULLIF(current_setting('app.attendance_correction', true), '') = 'true'
           AND public.is_admin() THEN
            RETURN NEW;
        END IF;

        -- Authorized profile unlinking during permanent account deletion:
        -- strictly permits setting marked_by = NULL with zero change to attendance data
        IF TG_OP = 'UPDATE'
           AND NULLIF(current_setting('app.user_deletion', true), '') = 'true'
           AND NEW.session_id = OLD.session_id
           AND NEW.student_id = OLD.student_id
           AND NEW.status = OLD.status
           AND NEW.marked_at = OLD.marked_at
           AND NEW.marked_by IS NULL THEN
            RETURN NEW;
        END IF;

        RAISE EXCEPTION 'Attendance records in finalized sessions cannot be modified';
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;


-- ---------------------------------------------------------
-- 5. ACCOUNT DELETION AUDIT LOGS TABLE
-- Immutable institutional audit log for permanent deletions.
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.account_deletion_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deleted_user_id UUID NOT NULL,
    login_id TEXT,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'faculty', 'student')),
    roster_disposition TEXT NOT NULL CHECK (roster_disposition IN ('none', 'deleted', 'archived')),
    historical_records_preserved BOOLEAN NOT NULL DEFAULT FALSE,
    performed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    performed_by_login_id TEXT,
    details JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_deletion_logs_created
    ON public.account_deletion_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_account_deletion_logs_deleted_user
    ON public.account_deletion_logs(deleted_user_id);

ALTER TABLE public.account_deletion_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.account_deletion_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.account_deletion_logs TO authenticated;
GRANT ALL ON public.account_deletion_logs TO service_role;

DROP POLICY IF EXISTS admin_read_account_deletion_logs ON public.account_deletion_logs;
CREATE POLICY admin_read_account_deletion_logs
ON public.account_deletion_logs
FOR SELECT TO authenticated
USING (public.is_admin());


-- ---------------------------------------------------------
-- 6. TRANSACTIONAL ACCOUNT DELETION PREPARATION RPC
-- Called exclusively by the delete-user Edge Function via service_role.
-- Atomically validates security invariants, preserves historical
-- academic & audit data, archives or removes roster rows, and
-- logs the deletion event.
-- ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_prepare_user_deletion(
    p_target_user_id UUID,
    p_caller_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_prof public.profiles%ROWTYPE;
    target_prof public.profiles%ROWTYPE;
    target_student public.students%ROWTYPE;
    target_faculty public.faculty%ROWTYPE;
    remaining_active_admins INTEGER := 0;
    v_roster_disposition TEXT := 'none';
    v_has_history BOOLEAN := FALSE;
    v_marked_records_count INTEGER := 0;
    v_performed_audit_count INTEGER := 0;
    v_notifications_count INTEGER := 0;
    v_student_attendance_count INTEGER := 0;
    v_student_audit_count INTEGER := 0;
    v_student_assignment_count INTEGER := 0;
    v_faculty_sessions_count INTEGER := 0;
    v_faculty_assignments_count INTEGER := 0;
BEGIN
    IF p_target_user_id IS NULL OR p_caller_user_id IS NULL THEN
        RAISE EXCEPTION 'Target user ID and caller user ID are required';
    END IF;

    -- 1. Verify caller is an active administrator
    SELECT *
    INTO caller_prof
    FROM public.profiles
    WHERE id = p_caller_user_id
    FOR SHARE;

    IF NOT FOUND OR caller_prof.role <> 'admin' OR caller_prof.is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'Forbidden: Only active administrators can permanently delete accounts';
    END IF;

    -- 2. Prevent self-deletion
    IF p_target_user_id = p_caller_user_id THEN
        RAISE EXCEPTION 'Self-deletion is not permitted. Administrators cannot delete their own account.';
    END IF;

    -- 3. Lock and validate target profile
    SELECT *
    INTO target_prof
    FROM public.profiles
    WHERE id = p_target_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Account not found or has already been deleted';
    END IF;

    -- 4. Only deactivated accounts may be permanently deleted
    IF target_prof.is_active IS TRUE THEN
        RAISE EXCEPTION 'Only deactivated accounts can be permanently deleted. Deactivate the account first.';
    END IF;

    -- 5. Prevent deletion of the last active administrator (concurrency-safe)
    PERFORM 1
    FROM public.profiles
    WHERE role = 'admin'
      AND is_active = TRUE
      AND id <> p_target_user_id
    FOR UPDATE;

    GET DIAGNOSTICS remaining_active_admins = ROW_COUNT;

    IF remaining_active_admins < 1 THEN
        RAISE EXCEPTION 'Cannot delete the last active administrator';
    END IF;

    -- 6. Safely unlink profile references on historical records
    PERFORM set_config('app.user_deletion', 'true', TRUE);

    SELECT COUNT(*) INTO v_marked_records_count
    FROM public.attendance_records
    WHERE marked_by = p_target_user_id;

    IF v_marked_records_count > 0 THEN
        UPDATE public.attendance_records
        SET marked_by = NULL
        WHERE marked_by = p_target_user_id;
        v_has_history := TRUE;
    END IF;

    SELECT COUNT(*) INTO v_performed_audit_count
    FROM public.attendance_audit_logs
    WHERE performed_by = p_target_user_id;

    IF v_performed_audit_count > 0 THEN
        UPDATE public.attendance_audit_logs
        SET performed_by = NULL
        WHERE performed_by = p_target_user_id;
        v_has_history := TRUE;
    END IF;

    SELECT COUNT(*) INTO v_notifications_count
    FROM public.notifications
    WHERE published_by = p_target_user_id;

    IF v_notifications_count > 0 THEN
        UPDATE public.notifications
        SET published_by = NULL
        WHERE published_by = p_target_user_id;
        v_has_history := TRUE;
    END IF;

    PERFORM set_config('app.user_deletion', 'false', TRUE);

    -- 7. Handle linked student roster record
    SELECT *
    INTO target_student
    FROM public.students
    WHERE profile_id = p_target_user_id
    FOR UPDATE;

    IF FOUND THEN
        SELECT COUNT(*) INTO v_student_attendance_count
        FROM public.attendance_records
        WHERE student_id = target_student.id;

        SELECT COUNT(*) INTO v_student_audit_count
        FROM public.attendance_audit_logs
        WHERE student_id = target_student.id;

        SELECT COUNT(*) INTO v_student_assignment_count
        FROM public.assignment_status
        WHERE student_id = target_student.id;

        IF v_student_attendance_count > 0
           OR v_student_audit_count > 0
           OR v_student_assignment_count > 0 THEN
            -- Retain & archive student identity so historical attendance & academic records remain intact
            UPDATE public.students
            SET profile_id = NULL,
                email = NULL,
                is_active = FALSE,
                is_archived = TRUE,
                archived_at = NOW(),
                updated_at = NOW()
            WHERE id = target_student.id;

            v_roster_disposition := 'archived';
            v_has_history := TRUE;
        ELSE
            DELETE FROM public.notification_reads
            WHERE student_id = target_student.id;

            DELETE FROM public.students
            WHERE id = target_student.id;

            v_roster_disposition := 'deleted';
        END IF;
    END IF;

    -- 8. Handle linked faculty roster record
    SELECT *
    INTO target_faculty
    FROM public.faculty
    WHERE profile_id = p_target_user_id
    FOR UPDATE;

    IF FOUND THEN
        SELECT COUNT(*) INTO v_faculty_sessions_count
        FROM public.attendance_sessions
        WHERE faculty_id = target_faculty.id;

        SELECT COUNT(*) INTO v_faculty_assignments_count
        FROM public.assignments
        WHERE created_by = target_faculty.id;

        IF v_faculty_sessions_count > 0
           OR v_faculty_assignments_count > 0 THEN
            -- Retain & archive faculty identity so historical sessions & assignments remain intact
            UPDATE public.faculty
            SET profile_id = NULL,
                email = NULL,
                is_active = FALSE,
                is_archived = TRUE,
                archived_at = NOW(),
                updated_at = NOW()
            WHERE id = target_faculty.id;

            UPDATE public.faculty_subjects
            SET is_active = FALSE
            WHERE faculty_id = target_faculty.id;

            v_roster_disposition := 'archived';
            v_has_history := TRUE;
        ELSE
            DELETE FROM public.faculty_subjects
            WHERE faculty_id = target_faculty.id;

            DELETE FROM public.faculty
            WHERE id = target_faculty.id;

            IF v_roster_disposition = 'none' THEN
                v_roster_disposition := 'deleted';
            END IF;
        END IF;
    END IF;

    -- 9. Return preparation summary for Edge Function audit logging & auth deletion
    RETURN jsonb_build_object(
        'targetUserId', target_prof.id,
        'loginId', target_prof.login_id,
        'fullName', target_prof.full_name,
        'role', target_prof.role,
        'rosterDisposition', v_roster_disposition,
        'historicalRecordsPreserved', v_has_history,
        'counts', jsonb_build_object(
            'studentAttendance', v_student_attendance_count,
            'studentAudit', v_student_audit_count,
            'studentAssignments', v_student_assignment_count,
            'facultySessions', v_faculty_sessions_count,
            'facultyAssignments', v_faculty_assignments_count,
            'markedRecords', v_marked_records_count,
            'performedAudit', v_performed_audit_count,
            'notifications', v_notifications_count
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_prepare_user_deletion(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_prepare_user_deletion(UUID, UUID) TO service_role;
