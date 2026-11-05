-- =========================================================
-- CLASSROOM CONNECT
-- Migration 6: Attendance workflow and audit logging
-- =========================================================

-- ---------------------------------------------------------
-- 1. AUTOMATIC UPDATED_AT TRIGGER
-- ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF TG_NAME IS NULL THEN
        RAISE EXCEPTION 'Trigger function cannot be called directly';
    END IF;

    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER students_updated_at
BEFORE UPDATE ON public.students
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER faculty_updated_at
BEFORE UPDATE ON public.faculty
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER subjects_updated_at
BEFORE UPDATE ON public.subjects
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER attendance_sessions_updated_at
BEFORE UPDATE ON public.attendance_sessions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER attendance_records_updated_at
BEFORE UPDATE ON public.attendance_records
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER notifications_updated_at
BEFORE UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER assignments_updated_at
BEFORE UPDATE ON public.assignments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER assignment_status_updated_at
BEFORE UPDATE ON public.assignment_status
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ---------------------------------------------------------
-- 2. PROFILE-ROSTER SYNCHRONIZATION TRIGGER
-- Ensures profiles, students, and faculty remain consistent.
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
            updated_at = NOW()
        WHERE profile_id = NEW.id;
    ELSIF NEW.role = 'faculty' THEN
        UPDATE public.faculty
        SET full_name = NEW.full_name,
            email = NEW.email,
            updated_at = NOW()
        WHERE profile_id = NEW.id;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER sync_profile_changes
AFTER UPDATE OF full_name, email ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_to_roster();


-- ---------------------------------------------------------
-- 3. ATTENDANCE AUDIT TRIGGER
-- Records attendance inserts and updates automatically.
-- Supports authenticated operations and seed/service scripts.
-- ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.audit_attendance_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    actor_id UUID;
    event_action TEXT;
BEGIN
    IF TG_NAME IS NULL THEN
        RAISE EXCEPTION 'Trigger function cannot be called directly';
    END IF;

    actor_id := auth.uid();

    -- Fallback to marked_by if running outside an HTTP auth session (e.g. database seed)
    IF actor_id IS NULL THEN
        actor_id := NEW.marked_by;
    END IF;

    IF TG_OP = 'INSERT' THEN
        event_action := 'attendance_marked';

        INSERT INTO public.attendance_audit_logs (
            session_id,
            attendance_record_id,
            student_id,
            action,
            old_status,
            new_status,
            performed_by
        )
        VALUES (
            NEW.session_id,
            NEW.id,
            NEW.student_id,
            event_action,
            NULL,
            NEW.status,
            actor_id
        );

        RETURN NEW;

    ELSIF TG_OP = 'UPDATE' THEN

        IF OLD.status IS DISTINCT FROM NEW.status THEN
            event_action := 'attendance_updated';

            INSERT INTO public.attendance_audit_logs (
                session_id,
                attendance_record_id,
                student_id,
                action,
                old_status,
                new_status,
                performed_by
            )
            VALUES (
                NEW.session_id,
                NEW.id,
                NEW.student_id,
                event_action,
                OLD.status,
                NEW.status,
                actor_id
            );
        END IF;

        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$$;

CREATE TRIGGER attendance_record_audit
AFTER INSERT OR UPDATE ON public.attendance_records
FOR EACH ROW
EXECUTE FUNCTION public.audit_attendance_change();


-- ---------------------------------------------------------
-- 4. PROTECT FINALIZED ATTENDANCE SESSIONS & RECORDS
-- Ordinary users cannot edit finalized sessions or records.
-- Authorized corrections set 'app.attendance_correction' to bypass.
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
        -- Only authorized administrators executing via correct_finalized_attendance()
        -- with the transaction-scoped config flag can update a finalized record.
        -- Deletions of finalized records are strictly prohibited.
        IF TG_OP = 'UPDATE'
           AND NULLIF(current_setting('app.attendance_correction', true), '') = 'true'
           AND public.is_admin() THEN
            RETURN NEW;
        END IF;

        RAISE EXCEPTION 'Attendance records in finalized sessions cannot be modified';
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER protect_finalized_sessions
BEFORE UPDATE OR DELETE ON public.attendance_sessions
FOR EACH ROW
EXECUTE FUNCTION public.prevent_finalized_attendance_changes();

CREATE TRIGGER protect_finalized_records
BEFORE UPDATE OR DELETE ON public.attendance_records
FOR EACH ROW
EXECUTE FUNCTION public.prevent_finalized_attendance_changes();


-- ---------------------------------------------------------
-- 5. START ATTENDANCE SESSION
-- Faculty can start a session for an allocated subject.
-- Defined as SECURITY DEFINER to write audit logs securely.
-- ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.start_attendance_session(
    target_session_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    target_session public.attendance_sessions%ROWTYPE;
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
        RAISE EXCEPTION 'Not authorized to start this session';
    END IF;

    IF target_session.status <> 'draft' THEN
        RAISE EXCEPTION 'Only draft sessions can be started';
    END IF;

    UPDATE public.attendance_sessions
    SET status = 'in_progress',
        started_at = NOW()
    WHERE id = target_session_id;

    INSERT INTO public.attendance_audit_logs (
        session_id,
        action,
        performed_by
    )
    VALUES (
        target_session_id,
        'session_started',
        auth.uid()
    );
END;
$$;


-- ---------------------------------------------------------
-- 6. FINALIZE ATTENDANCE SESSION
-- Validates that attendance was marked for all active students.
-- Architecture Note (SRS v1.2 Scope):
-- Classroom Connect models a single classroom where all 25 students
-- attend every subject taught by the 6 faculty members.
-- Therefore, the active student roster (public.students WHERE is_active = TRUE)
-- intentionally serves as the universal eligible roster for all subject sessions.
-- Subject-specific enrollment is outside the single-classroom MVP scope.
-- Every active student in the classroom must have an attendance record
-- in this session before finalization can succeed.
-- Defined as SECURITY DEFINER to safely read student roster
-- and write immutable audit logs.
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
    total_students INTEGER;
    marked_students INTEGER;
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
        RAISE EXCEPTION 'Only in-progress sessions can be finalized';
    END IF;

    -- Count active students from the classroom roster
    SELECT COUNT(*)
    INTO total_students
    FROM public.students
    WHERE is_active = TRUE;

    -- Count marked attendance records in this session
    SELECT COUNT(*)
    INTO marked_students
    FROM public.attendance_records
    WHERE session_id = target_session_id;

    IF marked_students <> total_students THEN
        RAISE EXCEPTION 'Attendance must be marked for every active student (marked %, total %)',
            marked_students, total_students;
    END IF;

    UPDATE public.attendance_sessions
    SET status = 'finalized',
        finalized_at = NOW()
    WHERE id = target_session_id;

    INSERT INTO public.attendance_audit_logs (
        session_id,
        action,
        performed_by
    )
    VALUES (
        target_session_id,
        'session_finalized',
        auth.uid()
    );
END;
$$;


-- ---------------------------------------------------------
-- 7. ADMIN-ONLY CORRECTION FUNCTION
-- Allows audited correction of finalized attendance.
-- Uses SECURITY DEFINER and sets 'app.attendance_correction'
-- to permit bypass of finalization protection triggers.
-- ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.correct_finalized_attendance(
    target_record_id UUID,
    corrected_status TEXT,
    correction_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    target_record public.attendance_records%ROWTYPE;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only administrators can correct finalized attendance';
    END IF;

    IF corrected_status NOT IN ('present', 'absent') THEN
        RAISE EXCEPTION 'Invalid attendance status';
    END IF;

    IF correction_reason IS NULL
       OR LENGTH(TRIM(correction_reason)) < 5 THEN
        RAISE EXCEPTION 'A correction reason of at least 5 characters is required';
    END IF;

    SELECT *
    INTO target_record
    FROM public.attendance_records
    WHERE id = target_record_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Attendance record not found';
    END IF;

    IF (
        SELECT status
        FROM public.attendance_sessions
        WHERE id = target_record.session_id
    ) <> 'finalized' THEN
        RAISE EXCEPTION 'This function is only for finalized sessions';
    END IF;

    IF target_record.status = corrected_status THEN
        RAISE EXCEPTION 'Attendance already has this status';
    END IF;

    -- Set transaction configuration to authorize trigger bypass
    PERFORM set_config(
        'app.attendance_correction',
        'true',
        TRUE
    );

    UPDATE public.attendance_records
    SET status = corrected_status,
        updated_at = NOW()
    WHERE id = target_record_id;

    INSERT INTO public.attendance_audit_logs (
        session_id,
        attendance_record_id,
        student_id,
        action,
        old_status,
        new_status,
        performed_by,
        details
    )
    VALUES (
        target_record.session_id,
        target_record.id,
        target_record.student_id,
        'attendance_corrected',
        target_record.status,
        corrected_status,
        auth.uid(),
        jsonb_build_object('reason', correction_reason)
    );

    -- Clear authorization setting
    PERFORM set_config(
        'app.attendance_correction',
        'false',
        TRUE
    );
END;
$$;


-- ---------------------------------------------------------
-- 8. FUNCTION PERMISSIONS
-- ---------------------------------------------------------

-- Revoke all permissions from PUBLIC and anon on trigger and workflow functions.
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sync_profile_to_roster() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.audit_attendance_change() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.prevent_finalized_attendance_changes() FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.start_attendance_session(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finalize_attendance_session(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.correct_finalized_attendance(UUID, TEXT, TEXT) FROM PUBLIC, anon;

-- Grant execution on trigger functions to authenticated and service_role.
-- (PostgreSQL requires execute privilege for callers whose DML activates the trigger).
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_profile_to_roster() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.audit_attendance_change() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prevent_finalized_attendance_changes() TO authenticated, service_role;

-- Grant execution on workflow RPCs to authenticated and service_role.
-- Anonymous access is strictly denied.
GRANT EXECUTE ON FUNCTION public.start_attendance_session(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_attendance_session(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.correct_finalized_attendance(UUID, TEXT, TEXT) TO authenticated, service_role;
