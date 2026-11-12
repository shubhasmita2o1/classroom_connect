-- =========================================================
-- CLASSROOM CONNECT
-- Migration 9: Security Hardening (SEC-01, SEC-02, SEC-03)
-- Hardens Login ID resolution, seed account mappings,
-- and enforces uppercase trimmed login_id constraints in PostgreSQL.
-- =========================================================

-- ---------------------------------------------------------
-- 1. SEC-03: ENFORCE LOGIN ID NORMALIZATION & CHECK CONSTRAINT
-- ---------------------------------------------------------

-- Normalize all existing records in profiles before applying constraint
UPDATE public.profiles
SET login_id = UPPER(TRIM(login_id))
WHERE login_id IS NOT NULL;

-- Enforce uppercase alphanumeric trimmed format on login_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'check_login_id_format'
    ) THEN
        ALTER TABLE public.profiles
        ADD CONSTRAINT check_login_id_format
        CHECK (
            login_id IS NULL
            OR (
                login_id = UPPER(TRIM(login_id))
                AND LENGTH(login_id) >= 3
                AND LENGTH(login_id) <= 30
                AND login_id ~ '^[A-Z0-9_-]+$'
            )
        );
    END IF;
END $$;

-- Guarantee unique index on login_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_profiles_login_id
ON public.profiles(login_id)
WHERE login_id IS NOT NULL;


-- ---------------------------------------------------------
-- 2. SEC-01 & SEC-02: HARDEN RESOLVE_LOGIN_ID_TO_AUTH_EMAIL RPC
--  - Strictly resolves only authorized internal auth identities
--  - Explicitly preserves seed accounts (ADMIN001, FAC001, STU001)
--  - Never returns unlinked roster contact emails (s.email, f.email)
--  - Enforces SECURITY DEFINER and search_path = ''
-- ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_login_id_to_auth_email(
    p_login_id TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    clean_id TEXT;
    target_email TEXT;
BEGIN
    IF p_login_id IS NULL OR TRIM(p_login_id) = '' THEN
        RETURN NULL;
    END IF;

    clean_id := UPPER(TRIM(p_login_id));

    -- Handle accidental email input by stripping domain prefix
    IF clean_id LIKE '%@%' THEN
        clean_id := UPPER(split_part(clean_id, '@', 1));
    END IF;

    -- SEC-02: Explicit controlled mapping for pre-seeded test accounts
    IF clean_id = 'ADMIN001' THEN
        RETURN 'admin@classroom.local';
    ELSIF clean_id = 'FAC001' THEN
        RETURN 'faculty@classroom.local';
    ELSIF clean_id = 'STU001' THEN
        RETURN 'student@classroom.local';
    END IF;

    -- SEC-01: 1. Check public.profiles by login_id (only active accounts)
    SELECT email INTO target_email
    FROM public.profiles
    WHERE login_id = clean_id
      AND is_active = TRUE
    LIMIT 1;

    IF target_email IS NOT NULL THEN
        RETURN target_email;
    END IF;

    -- SEC-01: 2. Check student roster strictly through linked profile
    SELECT p.email INTO target_email
    FROM public.students s
    JOIN public.profiles p ON p.id = s.profile_id
    WHERE s.roll_number = clean_id
      AND p.is_active = TRUE
      AND p.email IS NOT NULL
    LIMIT 1;

    IF target_email IS NOT NULL THEN
        RETURN target_email;
    END IF;

    -- SEC-01: 3. Check faculty roster strictly through linked profile
    SELECT p.email INTO target_email
    FROM public.faculty f
    JOIN public.profiles p ON p.id = f.profile_id
    WHERE f.employee_id = clean_id
      AND p.is_active = TRUE
      AND p.email IS NOT NULL
    LIMIT 1;

    IF target_email IS NOT NULL THEN
        RETURN target_email;
    END IF;

    -- Default fallback: synthetic internal email identity (prevents user enumeration)
    RETURN LOWER(clean_id) || '@classroom.local';
END;
$$;

-- Secure function permissions
REVOKE ALL ON FUNCTION public.resolve_login_id_to_auth_email(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_login_id_to_auth_email(TEXT) TO anon, authenticated, service_role;


-- ---------------------------------------------------------
-- 3. ENSURE TRIGGER CLEANS & VALIDATES LOGIN ID ON USER INSERT
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
        IF EXISTS (SELECT 1 FROM public.faculty WHERE email = NEW.email) THEN
            UPDATE public.faculty
            SET profile_id = NEW.id,
                full_name = user_full_name,
                employee_id = target_emp_id,
                updated_at = NOW()
            WHERE email = NEW.email;
        ELSIF EXISTS (SELECT 1 FROM public.faculty WHERE employee_id = target_emp_id) THEN
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
                target_emp_id,
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
                roll_number = target_roll,
                updated_at = NOW()
            WHERE email = NEW.email;
        ELSIF EXISTS (SELECT 1 FROM public.students WHERE roll_number = target_roll) THEN
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
