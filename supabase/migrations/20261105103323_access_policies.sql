-- =========================================================
-- CLASSROOM CONNECT
-- Migration 5: Access policies and database privileges
-- =========================================================

-- ---------------------------------------------------------
-- 1. REMOVE PUBLIC ACCESS & CONFIGURE ROLE PRIVILEGES
-- ---------------------------------------------------------

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;

-- Authenticated users can read application tables (filtered by RLS).
GRANT SELECT ON
    public.profiles,
    public.students,
    public.faculty,
    public.subjects,
    public.faculty_subjects,
    public.attendance_sessions,
    public.attendance_records,
    public.attendance_audit_logs,
    public.notifications,
    public.notification_reads,
    public.assignments,
    public.assignment_status
TO authenticated;

-- Admin-managed core directory tables.
GRANT INSERT, UPDATE, DELETE ON
    public.profiles,
    public.students,
    public.faculty,
    public.subjects,
    public.faculty_subjects
TO authenticated;

-- Attendance session management.
GRANT INSERT, UPDATE, DELETE ON
    public.attendance_sessions
TO authenticated;

-- Attendance record marking.
GRANT INSERT, DELETE ON
    public.attendance_records
TO authenticated;

GRANT UPDATE (status, marked_by, updated_at)
ON public.attendance_records
TO authenticated;

-- Notification operations.
GRANT INSERT, UPDATE, DELETE ON
    public.notifications
TO authenticated;

GRANT INSERT ON
    public.notification_reads
TO authenticated;

-- Assignment operations.
GRANT INSERT, UPDATE, DELETE ON
    public.assignments
TO authenticated;

GRANT INSERT, DELETE ON
    public.assignment_status
TO authenticated;

GRANT UPDATE (status, submitted_at, remarks, updated_at)
ON public.assignment_status
TO authenticated;


-- ---------------------------------------------------------
-- 2. ADMIN POLICIES
-- Admin has full access to all application tables.
-- ---------------------------------------------------------

CREATE POLICY admin_profiles
ON public.profiles
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY admin_students
ON public.students
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY admin_faculty
ON public.faculty
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY admin_subjects
ON public.subjects
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY admin_faculty_subjects
ON public.faculty_subjects
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY admin_attendance_sessions
ON public.attendance_sessions
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY admin_attendance_records
ON public.attendance_records
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY admin_attendance_audit_logs
ON public.attendance_audit_logs
FOR SELECT TO authenticated
USING (public.is_admin());

CREATE POLICY admin_notifications
ON public.notifications
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY admin_notification_reads
ON public.notification_reads
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY admin_assignments
ON public.assignments
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY admin_assignment_status
ON public.assignment_status
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());


-- ---------------------------------------------------------
-- 3. PROFILE POLICIES
-- Users can read only their own profile.
-- Role updates remain strictly reserved for admin.
-- ---------------------------------------------------------

CREATE POLICY users_read_own_profile
ON public.profiles
FOR SELECT TO authenticated
USING (id = (SELECT auth.uid()));


-- ---------------------------------------------------------
-- 4. STUDENT AND FACULTY DIRECTORY POLICIES
-- ---------------------------------------------------------

-- Students can view their own student record.
CREATE POLICY students_read_own_record
ON public.students
FOR SELECT TO authenticated
USING (profile_id = (SELECT auth.uid()));

-- Faculty and Admin can view all active students to take attendance.
CREATE POLICY faculty_read_active_students
ON public.students
FOR SELECT TO authenticated
USING (
    public.current_user_role() = 'admin'
    OR (
        public.current_user_role() = 'faculty'
        AND is_active = TRUE
    )
);

-- Faculty can view their own faculty record.
CREATE POLICY faculty_read_own_record
ON public.faculty
FOR SELECT TO authenticated
USING (profile_id = (SELECT auth.uid()));

-- All authenticated users can view active faculty names and designations.
CREATE POLICY authenticated_read_active_faculty
ON public.faculty
FOR SELECT TO authenticated
USING (
    is_active = TRUE
);


-- ---------------------------------------------------------
-- 5. SUBJECT POLICIES
-- Active subjects are visible to authenticated users.
-- ---------------------------------------------------------

CREATE POLICY authenticated_read_active_subjects
ON public.subjects
FOR SELECT TO authenticated
USING (is_active = TRUE);


-- ---------------------------------------------------------
-- 6. FACULTY SUBJECT ALLOCATION POLICIES
-- ---------------------------------------------------------

CREATE POLICY faculty_read_own_allocations
ON public.faculty_subjects
FOR SELECT TO authenticated
USING (
    faculty_id = (SELECT public.current_faculty_id())
    OR public.is_admin()
);

CREATE POLICY students_read_active_allocations
ON public.faculty_subjects
FOR SELECT TO authenticated
USING (
    is_active = TRUE
    AND public.is_student()
);


-- ---------------------------------------------------------
-- 7. ATTENDANCE SESSION POLICIES
-- Faculty can manage sessions for allocated subjects.
-- Students can read finalized sessions for their own attendance.
-- ---------------------------------------------------------

CREATE POLICY faculty_read_own_sessions
ON public.attendance_sessions
FOR SELECT TO authenticated
USING (
    faculty_id = (SELECT public.current_faculty_id())
    AND public.faculty_can_access_subject(subject_id)
);

CREATE POLICY faculty_create_sessions
ON public.attendance_sessions
FOR INSERT TO authenticated
WITH CHECK (
    faculty_id = (SELECT public.current_faculty_id())
    AND public.faculty_can_access_subject(subject_id)
    AND status IN ('draft', 'in_progress')
);

CREATE POLICY faculty_update_sessions
ON public.attendance_sessions
FOR UPDATE TO authenticated
USING (
    faculty_id = (SELECT public.current_faculty_id())
    AND public.faculty_can_access_subject(subject_id)
    AND status <> 'finalized'
)
WITH CHECK (
    faculty_id = (SELECT public.current_faculty_id())
    AND public.faculty_can_access_subject(subject_id)
    AND status IN ('draft', 'in_progress')
);

CREATE POLICY students_read_finalized_sessions
ON public.attendance_sessions
FOR SELECT TO authenticated
USING (
    status = 'finalized'
    AND public.is_student()
);


-- ---------------------------------------------------------
-- 8. ATTENDANCE RECORD POLICIES
-- Faculty can mark attendance before finalization.
-- Inactive students cannot be included in attendance sessions.
-- Students can view their own finalized attendance.
-- ---------------------------------------------------------

CREATE POLICY faculty_read_session_records
ON public.attendance_records
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.attendance_sessions AS s
        WHERE s.id = session_id
          AND s.faculty_id = (SELECT public.current_faculty_id())
          AND public.faculty_can_access_subject(s.subject_id)
    )
);

CREATE POLICY faculty_create_attendance_records
ON public.attendance_records
FOR INSERT TO authenticated
WITH CHECK (
    marked_by = (SELECT auth.uid())
    AND EXISTS (
        SELECT 1
        FROM public.students AS st
        WHERE st.id = student_id
          AND st.is_active = TRUE
    )
    AND EXISTS (
        SELECT 1
        FROM public.attendance_sessions AS s
        WHERE s.id = session_id
          AND s.faculty_id = (SELECT public.current_faculty_id())
          AND s.status IN ('draft', 'in_progress')
          AND public.faculty_can_access_subject(s.subject_id)
    )
);

CREATE POLICY faculty_update_attendance_records
ON public.attendance_records
FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.attendance_sessions AS s
        WHERE s.id = session_id
          AND s.faculty_id = (SELECT public.current_faculty_id())
          AND s.status IN ('draft', 'in_progress')
          AND public.faculty_can_access_subject(s.subject_id)
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.attendance_sessions AS s
        WHERE s.id = session_id
          AND s.faculty_id = (SELECT public.current_faculty_id())
          AND s.status IN ('draft', 'in_progress')
          AND public.faculty_can_access_subject(s.subject_id)
    )
);

CREATE POLICY students_read_own_finalized_attendance
ON public.attendance_records
FOR SELECT TO authenticated
USING (
    student_id = (SELECT public.current_student_id())
    AND EXISTS (
        SELECT 1
        FROM public.attendance_sessions AS s
        WHERE s.id = session_id
          AND s.status = 'finalized'
    )
);


-- ---------------------------------------------------------
-- 9. NOTIFICATION POLICIES
-- Faculty can publish notifications for allocated subjects.
-- Faculty can view their own notifications and published announcements.
-- Students can read published and non-expired notifications.
-- ---------------------------------------------------------

CREATE POLICY faculty_read_notifications
ON public.notifications
FOR SELECT TO authenticated
USING (
    published_by = (SELECT auth.uid())
    OR (
        is_published = TRUE
        AND public.is_faculty()
    )
);

CREATE POLICY faculty_create_notifications
ON public.notifications
FOR INSERT TO authenticated
WITH CHECK (
    published_by = (SELECT auth.uid())
    AND public.is_faculty()
    AND (
        subject_id IS NULL
        OR public.faculty_can_access_subject(subject_id)
    )
);

CREATE POLICY faculty_update_notifications
ON public.notifications
FOR UPDATE TO authenticated
USING (
    published_by = (SELECT auth.uid())
    AND public.is_faculty()
)
WITH CHECK (
    published_by = (SELECT auth.uid())
    AND public.is_faculty()
    AND (
        subject_id IS NULL
        OR public.faculty_can_access_subject(subject_id)
    )
);

CREATE POLICY students_read_published_notifications
ON public.notifications
FOR SELECT TO authenticated
USING (
    is_published = TRUE
    AND public.is_student()
    AND (expiry_date IS NULL OR expiry_date >= NOW())
);


-- ---------------------------------------------------------
-- 10. NOTIFICATION READ POLICIES
-- Students can record their own notification reads.
-- ---------------------------------------------------------

CREATE POLICY students_read_own_notification_reads
ON public.notification_reads
FOR SELECT TO authenticated
USING (
    student_id = (SELECT public.current_student_id())
);

CREATE POLICY students_create_own_notification_reads
ON public.notification_reads
FOR INSERT TO authenticated
WITH CHECK (
    student_id = (SELECT public.current_student_id())
    AND EXISTS (
        SELECT 1
        FROM public.notifications AS n
        WHERE n.id = notification_id
          AND n.is_published = TRUE
    )
);


-- ---------------------------------------------------------
-- 11. ASSIGNMENT POLICIES
-- Faculty can manage their own assignments.
-- Students can view published assignments.
-- ---------------------------------------------------------

CREATE POLICY faculty_read_own_assignments
ON public.assignments
FOR SELECT TO authenticated
USING (
    created_by = (SELECT public.current_faculty_id())
);

CREATE POLICY faculty_create_assignments
ON public.assignments
FOR INSERT TO authenticated
WITH CHECK (
    created_by = (SELECT public.current_faculty_id())
    AND public.faculty_can_access_subject(subject_id)
);

CREATE POLICY faculty_update_own_assignments
ON public.assignments
FOR UPDATE TO authenticated
USING (
    created_by = (SELECT public.current_faculty_id())
)
WITH CHECK (
    created_by = (SELECT public.current_faculty_id())
    AND public.faculty_can_access_subject(subject_id)
);

CREATE POLICY students_read_published_assignments
ON public.assignments
FOR SELECT TO authenticated
USING (
    is_published = TRUE
    AND public.is_student()
);


-- ---------------------------------------------------------
-- 12. ASSIGNMENT STATUS POLICIES
-- Students can manage only their own submission information.
-- Faculty can view status for their own assignments.
-- ---------------------------------------------------------

CREATE POLICY students_read_own_assignment_status
ON public.assignment_status
FOR SELECT TO authenticated
USING (
    student_id = (SELECT public.current_student_id())
);

CREATE POLICY students_create_own_assignment_status
ON public.assignment_status
FOR INSERT TO authenticated
WITH CHECK (
    student_id = (SELECT public.current_student_id())
    AND status IN ('pending', 'submitted')
    AND EXISTS (
        SELECT 1
        FROM public.assignments AS a
        WHERE a.id = assignment_id
          AND a.is_published = TRUE
    )
);

CREATE POLICY students_update_own_assignment_status
ON public.assignment_status
FOR UPDATE TO authenticated
USING (
    student_id = (SELECT public.current_student_id())
    AND EXISTS (
        SELECT 1
        FROM public.assignments AS a
        WHERE a.id = assignment_id
          AND a.is_published = TRUE
    )
)
WITH CHECK (
    student_id = (SELECT public.current_student_id())
    AND status IN ('pending', 'submitted')
);

CREATE POLICY faculty_read_assignment_status
ON public.assignment_status
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.assignments AS a
        WHERE a.id = assignment_id
          AND a.created_by = (SELECT public.current_faculty_id())
    )
);
