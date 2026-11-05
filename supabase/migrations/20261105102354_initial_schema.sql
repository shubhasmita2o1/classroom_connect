-- =========================================================
-- CLASSROOM CONNECT
-- Migration 1: Core database tables
-- =========================================================

-- 1. USER PROFILES
-- Linked to Supabase Auth users.
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK (role IN ('admin', 'faculty', 'student')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. STUDENTS
-- Represents the classroom student roster (25 students in MVP).
CREATE TABLE public.students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL,
    roll_number TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE,
    contact_number TEXT,
    admission_date DATE DEFAULT CURRENT_DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. FACULTY
-- Represents faculty members (6 faculty in MVP).
CREATE TABLE public.faculty (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL,
    employee_id TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE,
    contact_number TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. SUBJECTS
CREATE TABLE public.subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_code TEXT NOT NULL UNIQUE,
    subject_name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. FACULTY-SUBJECT ALLOCATION
-- A faculty member can teach multiple subjects.
-- A subject can have multiple assigned faculty members.
CREATE TABLE public.faculty_subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    faculty_id UUID NOT NULL REFERENCES public.faculty(id) ON DELETE RESTRICT,
    subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE RESTRICT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_faculty_subject
        UNIQUE (faculty_id, subject_id)
);

-- Useful indexes
CREATE INDEX idx_profiles_role
    ON public.profiles(role);

CREATE INDEX idx_students_active
    ON public.students(is_active);

CREATE INDEX idx_students_roll_number
    ON public.students(roll_number);

CREATE INDEX idx_students_profile_id
    ON public.students(profile_id);

CREATE INDEX idx_faculty_active
    ON public.faculty(is_active);

CREATE INDEX idx_faculty_employee_id
    ON public.faculty(employee_id);

CREATE INDEX idx_faculty_profile_id
    ON public.faculty(profile_id);

CREATE INDEX idx_subjects_active
    ON public.subjects(is_active);

CREATE INDEX idx_faculty_subjects_faculty
    ON public.faculty_subjects(faculty_id);

CREATE INDEX idx_faculty_subjects_subject
    ON public.faculty_subjects(subject_id);
