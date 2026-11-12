-- =========================================================
-- CLASSROOM CONNECT
-- Migration 8: College-managed Login ID authentication
-- Enables authentication with Login IDs (e.g. ADMIN001, FAC001, STU001)
-- without dependency on external or college email addresses.
-- =========================================================

-- ---------------------------------------------------------
-- 1. ADD LOGIN_ID TO PROFILES TABLE
-- ---------------------------------------------------------

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS login_id TEXT;

-- ---------------------------------------------------------
-- 2. BACKFILL LOGIN_ID FOR EXISTING PROFILES
-- ---------------------------------------------------------

-- For students: map from student roll_number
UPDATE public.profiles p
SET login_id = s.roll_number
FROM public.students s
WHERE s.profile_id = p.id
  AND (p.login_id IS NULL OR p.login_id = '');

-- For faculty: map from faculty employee_id
UPDATE public.profiles p
SET login_id = f.employee_id
FROM public.faculty f
WHERE f.profile_id = p.id
  AND (p.login_id IS NULL OR p.login_id = '');

-- For admin: assign ADMIN001 or extract from email
UPDATE public.profiles
SET login_id = 'ADMIN001'
WHERE role = 'admin'
  AND (login_id IS NULL OR login_id = '');

-- Fallback for any unmapped profiles: uppercase prefix of email
UPDATE public.profiles
SET login_id = UPPER(split_part(email, '@', 1))
WHERE login_id IS NULL OR login_id = '';

-- Normalize all existing login_ids to uppercase trimmed text
UPDATE public.profiles
SET login_id = UPPER(TRIM(login_id));

-- Add Unique Constraint on login_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'unique_profile_login_id'
    ) THEN
        ALTER TABLE public.profiles
        ADD CONSTRAINT unique_profile_login_id UNIQUE (login_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_login_id
ON public.profiles(login_id);


-- ---------------------------------------------------------
-- 3. RESOLVE LOGIN ID TO AUTH IDENTITY RPC
-- Allows anonymous and authenticated clients to resolve Login ID
-- (e.g. FAC001, STU001, ADMIN001) to the corresponding Supabase Auth email.
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

    -- Handle accidental email input by stripping domain
    IF clean_id LIKE '%@%' THEN
        clean_id := UPPER(split_part(clean_id, '@', 1));
    END IF;

    -- 1. Check profiles by login_id
    SELECT email INTO target_email
    FROM public.profiles
    WHERE login_id = clean_id
    LIMIT 1;

    IF target_email IS NOT NULL THEN
        RETURN target_email;
    END IF;

    -- 2. Check students by roll_number
    SELECT COALESCE(p.email, s.email) INTO target_email
    FROM public.students s
    LEFT JOIN public.profiles p ON p.id = s.profile_id
    WHERE s.roll_number = clean_id
    LIMIT 1;

    IF target_email IS NOT NULL THEN
        RETURN target_email;
    END IF;

    -- 3. Check faculty by employee_id
    SELECT COALESCE(p.email, f.email) INTO target_email
    FROM public.faculty f
    LEFT JOIN public.profiles p ON p.id = f.profile_id
    WHERE f.employee_id = clean_id
    LIMIT 1;

    IF target_email IS NOT NULL THEN
        RETURN target_email;
    END IF;

    -- Default fallback: synthetic internal email identity
    RETURN LOWER(clean_id) || '@classroom.local';
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_login_id_to_auth_email(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_login_id_to_auth_email(TEXT) TO anon, authenticated, service_role;


-- ---------------------------------------------------------
-- 4. UPDATE AUTH-TO-PROFILE PROVISIONING TRIGGER
-- Removes strict external email domain check and automatically
-- registers the college Login ID on account creation.
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

    -- Check if public signups are enabled or if this is admin-provisioned
    SELECT value INTO signup_allowed
    FROM public.institution_settings
    WHERE key = 'public_signup_enabled';

    is_admin_provisioned := COALESCE((NEW.raw_app_meta_data->>'admin_provisioned')::boolean, FALSE)
                            OR COALESCE((NEW.raw_user_meta_data->>'admin_provisioned')::boolean, FALSE);

    -- If public signup is disabled and account was not provisioned, prevent arbitrary registration
    IF signup_allowed = 'false' AND NOT is_admin_provisioned AND (NEW.raw_app_meta_data->>'provider' = 'email') THEN
        -- Allow if pre-seeded in roster, otherwise reject
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

    -- Extract login_id from metadata or email username part
    target_login_id := UPPER(COALESCE(
        NEW.raw_user_meta_data->>'login_id',
        split_part(NEW.email, '@', 1)
    ));

    user_full_name := COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        target_login_id
    );

    target_roll := COALESCE(NEW.raw_user_meta_data->>'roll_number', target_login_id);
    target_emp_id := COALESCE(NEW.raw_user_meta_data->>'employee_id', target_login_id);

    -- 1. Create or update profile with login_id
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


-- ---------------------------------------------------------
-- 5. CASCADE LOGIN_ID CHANGES FROM PROFILE TO ROSTER
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
            is_active = NEW.is_active,
            roll_number = COALESCE(NEW.login_id, roll_number),
            updated_at = NOW()
        WHERE profile_id = NEW.id;
    ELSIF NEW.role = 'faculty' THEN
        UPDATE public.faculty
        SET full_name = NEW.full_name,
            email = NEW.email,
            is_active = NEW.is_active,
            employee_id = COALESCE(NEW.login_id, employee_id),
            updated_at = NOW()
        WHERE profile_id = NEW.id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_profile_changes ON public.profiles;
CREATE TRIGGER sync_profile_changes
AFTER UPDATE OF full_name, email, is_active, login_id ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_to_roster();
