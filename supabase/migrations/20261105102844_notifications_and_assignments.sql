-- =========================================================
-- CLASSROOM CONNECT
-- Migration 3: Notifications and assignments
-- =========================================================

-- 1. NOTIFICATIONS
-- Follows SRS v1.2 Module 6: Title, Description, Category, Priority, Publication Date, Expiry Date.
CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    title TEXT NOT NULL,
    description TEXT NOT NULL,

    category TEXT NOT NULL
        CHECK (
            category IN (
                'General Announcement',
                'Academic Notice',
                'Examination Notice',
                'Holiday Notice',
                'Important Announcement',
                'Urgent Notice'
            )
        ),

    priority TEXT NOT NULL DEFAULT 'Normal'
        CHECK (
            priority IN (
                'Low',
                'Normal',
                'High',
                'Urgent'
            )
        ),

    publication_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expiry_date TIMESTAMPTZ,

    published_by UUID NOT NULL
        REFERENCES public.profiles(id) ON DELETE RESTRICT,

    subject_id UUID
        REFERENCES public.subjects(id) ON DELETE SET NULL,

    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    published_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_notification_publication
        CHECK (
            (is_published = FALSE AND published_at IS NULL)
            OR
            (is_published = TRUE AND published_at IS NOT NULL)
        ),

    CONSTRAINT valid_notification_expiry
        CHECK (
            expiry_date IS NULL
            OR published_at IS NULL
            OR expiry_date >= published_at
        )
);

-- 2. NOTIFICATION READ TRACKING
CREATE TABLE public.notification_reads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    notification_id UUID NOT NULL
        REFERENCES public.notifications(id) ON DELETE CASCADE,

    student_id UUID NOT NULL
        REFERENCES public.students(id) ON DELETE CASCADE,

    read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_notification_student
        UNIQUE (notification_id, student_id)
);

-- 3. ASSIGNMENTS
-- Follows SRS v1.2 Module 7: Title, Description, Subject, Instructions, Due Date.
CREATE TABLE public.assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    title TEXT NOT NULL,
    description TEXT,
    instructions TEXT,

    subject_id UUID NOT NULL
        REFERENCES public.subjects(id) ON DELETE RESTRICT,

    created_by UUID NOT NULL
        REFERENCES public.faculty(id) ON DELETE RESTRICT,

    assigned_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date TIMESTAMPTZ NOT NULL,

    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    published_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_assignment_publication
        CHECK (
            (is_published = FALSE AND published_at IS NULL)
            OR
            (is_published = TRUE AND published_at IS NOT NULL)
        ),

    CONSTRAINT valid_assignment_due_date
        CHECK (due_date >= assigned_date::TIMESTAMPTZ)
);

-- 4. STUDENT ASSIGNMENT STATUS
CREATE TABLE public.assignment_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    assignment_id UUID NOT NULL
        REFERENCES public.assignments(id) ON DELETE CASCADE,

    student_id UUID NOT NULL
        REFERENCES public.students(id) ON DELETE CASCADE,

    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (
            status IN (
                'pending',
                'submitted',
                'completed',
                'late'
            )
        ),

    submitted_at TIMESTAMPTZ,
    remarks TEXT,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_assignment_student
        UNIQUE (assignment_id, student_id)
);

-- 5. INDEXES
CREATE INDEX idx_notifications_published
    ON public.notifications(is_published, published_at DESC);

CREATE INDEX idx_notifications_category
    ON public.notifications(category);

CREATE INDEX idx_notifications_priority
    ON public.notifications(priority);

CREATE INDEX idx_notifications_subject
    ON public.notifications(subject_id);

CREATE INDEX idx_notifications_expiry
    ON public.notifications(expiry_date);

CREATE INDEX idx_notification_reads_student
    ON public.notification_reads(student_id);

CREATE INDEX idx_assignments_subject
    ON public.assignments(subject_id);

CREATE INDEX idx_assignments_due_date
    ON public.assignments(due_date);

CREATE INDEX idx_assignments_created_by
    ON public.assignments(created_by);

CREATE INDEX idx_assignment_status_student
    ON public.assignment_status(student_id);

CREATE INDEX idx_assignment_status_assignment
    ON public.assignment_status(assignment_id);
