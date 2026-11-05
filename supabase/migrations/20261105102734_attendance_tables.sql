-- =========================================================
-- CLASSROOM CONNECT
-- Migration 2: Attendance tables
-- =========================================================

-- 1. ATTENDANCE SESSIONS
-- Supports multiple lectures of the same subject on the same day via session_number.
CREATE TABLE public.attendance_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    faculty_id UUID NOT NULL
        REFERENCES public.faculty(id) ON DELETE RESTRICT,

    subject_id UUID NOT NULL
        REFERENCES public.subjects(id) ON DELETE RESTRICT,

    session_date DATE NOT NULL DEFAULT CURRENT_DATE,

    session_number INTEGER NOT NULL DEFAULT 1
        CHECK (session_number > 0),

    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'in_progress', 'finalized')),

    started_at TIMESTAMPTZ,
    finalized_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_subject_session_number
        UNIQUE (subject_id, session_date, session_number),

    CONSTRAINT valid_finalization_time
        CHECK (
            (status <> 'finalized')
            OR finalized_at IS NOT NULL
        )
);

-- 2. ATTENDANCE RECORDS
-- Enforces one attendance record per student per session.
CREATE TABLE public.attendance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    session_id UUID NOT NULL
        REFERENCES public.attendance_sessions(id) ON DELETE RESTRICT,

    student_id UUID NOT NULL
        REFERENCES public.students(id) ON DELETE RESTRICT,

    status TEXT NOT NULL
        CHECK (status IN ('present', 'absent')),

    marked_by UUID
        REFERENCES public.profiles(id) ON DELETE SET NULL,

    marked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_student_per_session
        UNIQUE (session_id, student_id)
);

-- 3. ATTENDANCE AUDIT LOGS
-- Immutable audit log for session lifecycle and attendance corrections.
CREATE TABLE public.attendance_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    session_id UUID NOT NULL
        REFERENCES public.attendance_sessions(id) ON DELETE RESTRICT,

    attendance_record_id UUID
        REFERENCES public.attendance_records(id) ON DELETE SET NULL,

    student_id UUID
        REFERENCES public.students(id) ON DELETE SET NULL,

    action TEXT NOT NULL
        CHECK (
            action IN (
                'session_created',
                'session_started',
                'attendance_marked',
                'attendance_updated',
                'session_finalized',
                'attendance_corrected'
            )
        ),

    old_status TEXT,
    new_status TEXT,

    performed_by UUID
        REFERENCES public.profiles(id) ON DELETE SET NULL,

    details JSONB NOT NULL DEFAULT '{}'::JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. INDEXES
CREATE INDEX idx_attendance_sessions_faculty
    ON public.attendance_sessions(faculty_id);

CREATE INDEX idx_attendance_sessions_subject_date
    ON public.attendance_sessions(subject_id, session_date DESC);

CREATE INDEX idx_attendance_sessions_date
    ON public.attendance_sessions(session_date DESC);

CREATE INDEX idx_attendance_sessions_status
    ON public.attendance_sessions(status);

CREATE INDEX idx_attendance_records_session
    ON public.attendance_records(session_id);

CREATE INDEX idx_attendance_records_student
    ON public.attendance_records(student_id);

CREATE INDEX idx_attendance_records_status
    ON public.attendance_records(status);

CREATE INDEX idx_attendance_audit_session
    ON public.attendance_audit_logs(session_id);

CREATE INDEX idx_attendance_audit_record
    ON public.attendance_audit_logs(attendance_record_id);

CREATE INDEX idx_attendance_audit_created
    ON public.attendance_audit_logs(created_at DESC);
