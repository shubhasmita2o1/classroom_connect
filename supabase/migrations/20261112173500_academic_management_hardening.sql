-- =========================================================
-- CLASSROOM CONNECT
-- Migration 12: Academic Management — Subject & Allocation Hardening
--
-- Hardens subject code uniqueness/normalization, faculty-subject
-- allocation lifecycle & history tracking, and active-subject
-- enforcement in faculty authorization helpers.
-- =========================================================

-- ---------------------------------------------------------
-- 1. NORMALIZE & CONSTRAIN SUBJECTS TABLE
-- Enforces trimmed, uppercase subject codes and non-blank names.
-- Prevents case/whitespace duplicate subject codes (e.g. cs101 vs CS101).
-- ---------------------------------------------------------

UPDATE public.subjects
SET subject_code = UPPER(TRIM(subject_code)),
    subject_name = TRIM(subject_name)
WHERE subject_code IS DISTINCT FROM UPPER(TRIM(subject_code))
   OR subject_name IS DISTINCT FROM TRIM(subject_name);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'check_subject_code_format'
    ) THEN
        ALTER TABLE public.subjects
        ADD CONSTRAINT check_subject_code_format
        CHECK (
            subject_code = UPPER(TRIM(subject_code))
            AND LENGTH(subject_code) >= 2
            AND LENGTH(subject_code) <= 20
            AND subject_code ~ '^[A-Z0-9._-]+$'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'check_subject_name_not_blank'
    ) THEN
        ALTER TABLE public.subjects
        ADD CONSTRAINT check_subject_name_not_blank
        CHECK (LENGTH(TRIM(subject_name)) >= 2);
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_subjects_code_normalized
    ON public.subjects (UPPER(TRIM(subject_code)));


-- ---------------------------------------------------------
-- 2. ALLOCATION HISTORY METADATA ON FACULTY_SUBJECTS
-- Tracks unassigned_at and updated_at on the existing
-- faculty_subjects table without duplicating allocation tables.
-- ---------------------------------------------------------

ALTER TABLE public.faculty_subjects
    ADD COLUMN IF NOT EXISTS unassigned_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_faculty_subjects_active
    ON public.faculty_subjects(is_active);

DROP TRIGGER IF EXISTS faculty_subjects_updated_at ON public.faculty_subjects;
CREATE TRIGGER faculty_subjects_updated_at
BEFORE UPDATE ON public.faculty_subjects
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ---------------------------------------------------------
-- 3. VALIDATE ACTIVE FACULTY & ACTIVE SUBJECT ON ALLOCATIONS
-- Enforces at the database layer that active allocations only
-- pair active, non-archived faculty with active subjects.
-- ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_faculty_subject_allocation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_NAME IS NULL THEN
        RAISE EXCEPTION 'Trigger function cannot be called directly';
    END IF;

    IF NEW.is_active = TRUE THEN
        IF NOT EXISTS (
            SELECT 1
            FROM public.faculty f
            WHERE f.id = NEW.faculty_id
              AND f.is_active = TRUE
              AND f.is_archived = FALSE
        ) THEN
            RAISE EXCEPTION 'Only active faculty members can be allocated to subjects';
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM public.subjects s
            WHERE s.id = NEW.subject_id
              AND s.is_active = TRUE
        ) THEN
            RAISE EXCEPTION 'Only active subjects can be allocated to faculty members';
        END IF;

        NEW.unassigned_at := NULL;
        IF TG_OP = 'UPDATE' AND OLD.is_active = FALSE THEN
            NEW.assigned_at := NOW();
        END IF;
    ELSE
        IF TG_OP = 'UPDATE' AND OLD.is_active = TRUE AND NEW.unassigned_at IS NULL THEN
            NEW.unassigned_at := NOW();
        ELSIF TG_OP = 'INSERT' AND NEW.unassigned_at IS NULL THEN
            NEW.unassigned_at := NOW();
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_faculty_subject_allocation() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_faculty_subject_allocation() TO authenticated, service_role;

DROP TRIGGER IF EXISTS validate_faculty_subject_allocation_trigger ON public.faculty_subjects;
CREATE TRIGGER validate_faculty_subject_allocation_trigger
BEFORE INSERT OR UPDATE ON public.faculty_subjects
FOR EACH ROW EXECUTE FUNCTION public.validate_faculty_subject_allocation();


-- ---------------------------------------------------------
-- 4. ENSURE FACULTY_CAN_ACCESS_SUBJECT REQUIRES ACTIVE SUBJECT
-- Prevents faculty from creating new sessions on deactivated subjects
-- while preserving all existing historical sessions and records.
-- ---------------------------------------------------------

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
        JOIN public.subjects AS sub
          ON sub.id = fs.subject_id
        WHERE fs.faculty_id = public.current_faculty_id()
          AND fs.subject_id = target_subject_id
          AND fs.is_active = TRUE
          AND sub.is_active = TRUE
      )
      OR public.is_admin();
$$;

REVOKE ALL ON FUNCTION public.faculty_can_access_subject(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.faculty_can_access_subject(UUID) TO authenticated, service_role;
