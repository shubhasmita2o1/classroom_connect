-- =========================================================
-- CLASSROOM CONNECT
-- Migration 14: Safe Draft Attendance Session Deletion
--
-- Requirements Enforced:
--   1. Only 'draft' sessions can be deleted, strictly by their assigned
--      active faculty member or an active administrator.
--   2. 'in_progress' and 'finalized' sessions cannot be deleted (even by admins).
--   3. Students, inactive faculty, and other faculty members cannot delete.
--   4. Associated draft attendance records are cleaned up inside a locked
--      SECURITY DEFINER transaction without granting DELETE on attendance_records
--      to authenticated users.
--   5. Attendance audit history is NEVER deleted: existing audit log entries
--      referencing the deleted draft are safely unlinked (session_id -> NULL
--      with session metadata preserved in details), and the draft deletion
--      itself is recorded as 'draft_session_deleted'.
-- =========================================================

-- ---------------------------------------------------------
-- 1. PRESERVE AUDIT HISTORY ON DRAFT SESSION DELETION
-- Make attendance_audit_logs.session_id nullable with ON DELETE SET NULL
-- and allow action 'draft_session_deleted' in the action check constraint.
-- ---------------------------------------------------------

ALTER TABLE public.attendance_audit_logs
    ALTER COLUMN session_id DROP NOT NULL;

DO $$
DECLARE
    fk_name TEXT;
    chk_name TEXT;
BEGIN
    -- Replace ON DELETE RESTRICT FK on attendance_audit_logs(session_id) with ON DELETE SET NULL
    SELECT c.conname INTO fk_name
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid
     AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = 'public.attendance_audit_logs'::regclass
      AND c.contype = 'f'
      AND a.attname = 'session_id'
    LIMIT 1;

    IF fk_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.attendance_audit_logs DROP CONSTRAINT %I', fk_name);
    END IF;

    -- Replace action CHECK constraint to permit 'draft_session_deleted'
    SELECT c.conname INTO chk_name
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid
     AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = 'public.attendance_audit_logs'::regclass
      AND c.contype = 'c'
      AND a.attname = 'action'
    LIMIT 1;

    IF chk_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.attendance_audit_logs DROP CONSTRAINT %I', chk_name);
    END IF;
END $$;

ALTER TABLE public.attendance_audit_logs
    ADD CONSTRAINT attendance_audit_logs_session_id_fkey
    FOREIGN KEY (session_id)
    REFERENCES public.attendance_sessions(id)
    ON DELETE SET NULL;

ALTER TABLE public.attendance_audit_logs
    ADD CONSTRAINT attendance_audit_logs_action_check
    CHECK (
        action IN (
            'session_created',
            'session_started',
            'attendance_marked',
            'attendance_updated',
            'session_finalized',
            'attendance_corrected',
            'draft_session_deleted'
        )
    );


-- ---------------------------------------------------------
-- 2. FACULTY RLS DELETE POLICY FOR OWNED DRAFT SESSIONS ONLY
-- Allows assigned active faculty to delete ONLY their own 'draft' sessions.
-- Students remain strictly excluded; 'in_progress' and 'finalized' are blocked.
-- ---------------------------------------------------------

DROP POLICY IF EXISTS faculty_delete_draft_sessions ON public.attendance_sessions;

CREATE POLICY faculty_delete_draft_sessions
ON public.attendance_sessions
FOR DELETE TO authenticated
USING (
    public.is_faculty()
    AND status = 'draft'
    AND faculty_id = (SELECT public.current_faculty_id())
    AND public.faculty_can_access_subject(subject_id)
);


-- ---------------------------------------------------------
-- 3. TRIGGER ENFORCING DRAFT-ONLY DELETION ON ATTENDANCE_SESSIONS
-- Protects both 'in_progress' and 'finalized' sessions from any authenticated
-- DELETE (including administrators), preserving protect_finalized_sessions.
-- ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_draft_only_session_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF TG_NAME IS NULL THEN
        RAISE EXCEPTION 'Trigger function cannot be called directly';
    END IF;

    IF OLD.status = 'finalized' THEN
        RAISE EXCEPTION 'Finalized attendance session cannot be modified';
    END IF;

    IF OLD.status <> 'draft'
       AND COALESCE(current_setting('role', true), '') <> 'service_role' THEN
        RAISE EXCEPTION 'Only draft attendance sessions can be deleted (current status: %)', OLD.status;
    END IF;

    RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_draft_only_session_delete() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enforce_draft_only_session_delete() TO authenticated, service_role;

DROP TRIGGER IF EXISTS enforce_draft_only_session_delete_trigger ON public.attendance_sessions;
CREATE TRIGGER enforce_draft_only_session_delete_trigger
BEFORE DELETE ON public.attendance_sessions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_draft_only_session_delete();


-- ---------------------------------------------------------
-- 4. FIX PREVENT_FINALIZED_ATTENDANCE_CHANGES TO PERMIT DELETE
-- When TG_OP = 'DELETE' on public.attendance_sessions, returning
-- NEW returns NULL, which silently cancels row deletion in PostgreSQL.
-- Correct return value to OLD on DELETE while preserving all existing
-- authorization conditions and protections for finalized sessions and records.
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

        -- Return OLD on DELETE to allow deletion of draft sessions; return NEW on UPDATE
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
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

REVOKE ALL ON FUNCTION public.prevent_finalized_attendance_changes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prevent_finalized_attendance_changes() TO authenticated, service_role;


-- ---------------------------------------------------------
-- 5. SAFE TRANSACTIONAL DRAFT SESSION DELETION RPC
-- Atomically verifies caller authorization and draft status under FOR UPDATE,
-- preserves all audit history, cleans up draft attendance records, logs
-- 'draft_session_deleted', and removes the draft session.
-- ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delete_draft_attendance_session(
    target_session_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    target_session public.attendance_sessions%ROWTYPE;
    deleted_records_count INTEGER := 0;
BEGIN
    IF target_session_id IS NULL THEN
        RAISE EXCEPTION 'Target session ID is required';
    END IF;

    SELECT *
    INTO target_session
    FROM public.attendance_sessions
    WHERE id = target_session_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Attendance session not found or has already been deleted';
    END IF;

    -- Only assigned active faculty (for an allocated subject) or active admin may delete
    IF NOT (
        public.is_admin()
        OR (
            public.is_faculty()
            AND target_session.faculty_id = public.current_faculty_id()
            AND public.faculty_can_access_subject(target_session.subject_id)
        )
    ) THEN
        RAISE EXCEPTION 'Not authorized to delete this attendance session';
    END IF;

    -- Strictly allow draft sessions only; block in_progress and finalized
    IF target_session.status = 'finalized' THEN
        RAISE EXCEPTION 'Finalized attendance sessions cannot be deleted';
    END IF;

    IF target_session.status <> 'draft' THEN
        RAISE EXCEPTION 'Only draft attendance sessions can be deleted (current status: %)', target_session.status;
    END IF;

    -- Preserve any existing audit log rows referencing this draft session
    UPDATE public.attendance_audit_logs
    SET session_id = NULL,
        attendance_record_id = NULL,
        details = COALESCE(details, '{}'::JSONB) || jsonb_build_object(
            'preserved_session_id', target_session.id,
            'preserved_subject_id', target_session.subject_id,
            'preserved_session_date', target_session.session_date,
            'preserved_session_number', target_session.session_number,
            'session_deleted', TRUE
        )
    WHERE session_id = target_session_id;

    -- Safely remove draft attendance records (only reachable when status = 'draft')
    DELETE FROM public.attendance_records
    WHERE session_id = target_session_id;

    GET DIAGNOSTICS deleted_records_count = ROW_COUNT;

    -- Record immutable audit entry for the draft deletion
    INSERT INTO public.attendance_audit_logs (
        session_id,
        action,
        performed_by,
        details
    )
    VALUES (
        NULL,
        'draft_session_deleted',
        auth.uid(),
        jsonb_build_object(
            'deleted_session_id', target_session.id,
            'faculty_id', target_session.faculty_id,
            'subject_id', target_session.subject_id,
            'session_date', target_session.session_date,
            'session_number', target_session.session_number,
            'deleted_draft_records_count', deleted_records_count,
            'deleted_at', NOW()
        )
    );

    -- Delete the draft session itself
    DELETE FROM public.attendance_sessions
    WHERE id = target_session_id;

    RETURN jsonb_build_object(
        'deletedSessionId', target_session.id,
        'subjectId', target_session.subject_id,
        'sessionDate', target_session.session_date,
        'sessionNumber', target_session.session_number,
        'deletedDraftRecordsCount', deleted_records_count
    );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_draft_attendance_session(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_draft_attendance_session(UUID) TO authenticated, service_role;
