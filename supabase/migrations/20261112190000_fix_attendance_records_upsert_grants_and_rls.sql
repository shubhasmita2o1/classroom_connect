-- =========================================================
-- CLASSROOM CONNECT
-- Migration 13: Fix Attendance Records UPSERT Privileges & Harden RLS
--
-- Root Cause Fixed:
--   Migration 5 granted column-level UPDATE (status, marked_by, updated_at)
--   on public.attendance_records to authenticated, omitting session_id and
--   student_id. PostgREST translates .upsert(..., { onConflict: 'session_id,student_id' })
--   into INSERT ... ON CONFLICT (session_id, student_id) DO UPDATE SET
--   session_id = EXCLUDED.session_id, student_id = EXCLUDED.student_id, ...,
--   which causes PostgreSQL privilege checks to fail with:
--     "permission denied for table attendance_records" (SQLSTATE 42501).
--
-- Changes:
--   1. Revoke unnecessary DELETE privilege on attendance_records from authenticated.
--   2. Grant column-level UPDATE (session_id, student_id, status, marked_by, updated_at)
--      on attendance_records to authenticated so PostgREST UPSERT succeeds.
--   3. Add BEFORE UPDATE identity guard trigger so session_id, student_id,
--      and marked_at remain immutable on existing attendance records.
--   4. Harden current_faculty_id() and faculty_create_attendance_records /
--      faculty_update_attendance_records RLS policies to strictly enforce:
--      active non-archived faculty, active subject allocation, editable
--      in_progress session lifecycle state, and active non-archived student roster.
-- =========================================================

-- ---------------------------------------------------------
-- 1. TABLE PRIVILEGES ON ATTENDANCE_RECORDS
-- Keep least-privilege column-level UPDATE while enabling PostgREST UPSERT.
-- Remove unnecessary DELETE privilege for authenticated clients.
-- ---------------------------------------------------------

REVOKE DELETE ON public.attendance_records FROM authenticated;
REVOKE UPDATE ON public.attendance_records FROM authenticated;

GRANT SELECT, INSERT ON public.attendance_records TO authenticated;

GRANT UPDATE (session_id, student_id, status, marked_by, updated_at)
ON public.attendance_records
TO authenticated;


-- ---------------------------------------------------------
-- 2. IMMUTABILITY GUARD ON EXISTING ATTENDANCE RECORD IDENTITY
-- Since session_id and student_id have column-level UPDATE privilege solely
-- to allow PostgREST ON CONFLICT (session_id, student_id) DO UPDATE,
-- reject any attempt to reassign an existing record to a different
-- session, student, or marked_at timestamp.
-- ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_attendance_record_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF TG_NAME IS NULL THEN
        RAISE EXCEPTION 'Trigger function cannot be called directly';
    END IF;

    IF NEW.session_id IS DISTINCT FROM OLD.session_id THEN
        RAISE EXCEPTION 'Attendance record session_id cannot be changed';
    END IF;

    IF NEW.student_id IS DISTINCT FROM OLD.student_id THEN
        RAISE EXCEPTION 'Attendance record student_id cannot be changed';
    END IF;

    IF NEW.marked_at IS DISTINCT FROM OLD.marked_at
       AND COALESCE(current_setting('role', true), '') <> 'service_role' THEN
        RAISE EXCEPTION 'Attendance record marked_at timestamp cannot be modified';
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_attendance_record_identity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_attendance_record_identity() TO authenticated, service_role;

DROP TRIGGER IF EXISTS guard_attendance_record_identity_trigger ON public.attendance_records;
CREATE TRIGGER guard_attendance_record_identity_trigger
BEFORE UPDATE ON public.attendance_records
FOR EACH ROW
EXECUTE FUNCTION public.guard_attendance_record_identity();


-- ---------------------------------------------------------
-- 3. HARDEN CURRENT_FACULTY_ID HELPER
-- Ensures archived or non-faculty profiles never resolve as active faculty.
-- ---------------------------------------------------------

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
      AND p.role = 'faculty'
      AND p.is_active = TRUE
      AND f.is_active = TRUE
      AND f.is_archived = FALSE
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_faculty_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_faculty_id() TO authenticated, service_role;


-- ---------------------------------------------------------
-- 4. HARDEN FACULTY INSERT & UPDATE POLICIES ON ATTENDANCE_RECORDS
-- Enforces:
--   1. Active faculty account (is_faculty() + current_faculty_id())
--   2. Faculty member is assigned to the session's active subject
--   3. Session belongs to that faculty & subject
--   4. Session is strictly in the editable 'in_progress' lifecycle state
--   5. Student belongs to the active, non-archived classroom roster
--   6. marked_by matches the authenticated faculty caller
-- ---------------------------------------------------------

DROP POLICY IF EXISTS faculty_create_attendance_records ON public.attendance_records;

CREATE POLICY faculty_create_attendance_records
ON public.attendance_records
FOR INSERT TO authenticated
WITH CHECK (
    public.is_faculty()
    AND marked_by = (SELECT auth.uid())
    AND EXISTS (
        SELECT 1
        FROM public.students AS st
        WHERE st.id = student_id
          AND st.is_active = TRUE
          AND st.is_archived = FALSE
    )
    AND EXISTS (
        SELECT 1
        FROM public.attendance_sessions AS s
        WHERE s.id = session_id
          AND s.faculty_id = (SELECT public.current_faculty_id())
          AND s.status = 'in_progress'
          AND public.faculty_can_access_subject(s.subject_id)
    )
);

DROP POLICY IF EXISTS faculty_update_attendance_records ON public.attendance_records;

CREATE POLICY faculty_update_attendance_records
ON public.attendance_records
FOR UPDATE TO authenticated
USING (
    public.is_faculty()
    AND EXISTS (
        SELECT 1
        FROM public.students AS st
        WHERE st.id = student_id
          AND st.is_active = TRUE
          AND st.is_archived = FALSE
    )
    AND EXISTS (
        SELECT 1
        FROM public.attendance_sessions AS s
        WHERE s.id = session_id
          AND s.faculty_id = (SELECT public.current_faculty_id())
          AND s.status = 'in_progress'
          AND public.faculty_can_access_subject(s.subject_id)
    )
)
WITH CHECK (
    public.is_faculty()
    AND marked_by = (SELECT auth.uid())
    AND EXISTS (
        SELECT 1
        FROM public.students AS st
        WHERE st.id = student_id
          AND st.is_active = TRUE
          AND st.is_archived = FALSE
    )
    AND EXISTS (
        SELECT 1
        FROM public.attendance_sessions AS s
        WHERE s.id = session_id
          AND s.faculty_id = (SELECT public.current_faculty_id())
          AND s.status = 'in_progress'
          AND public.faculty_can_access_subject(s.subject_id)
    )
);
