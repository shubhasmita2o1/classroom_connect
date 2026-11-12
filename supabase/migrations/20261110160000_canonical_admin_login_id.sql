-- =========================================================
-- CLASSROOM CONNECT
-- Migration 10: Canonical ADMIN001 Authentication Identity Resolution
-- 
-- Fixes authentication identity mismatch where ADMIN001 was resolving
-- to the legacy admin alias instead of the active profile's
-- canonical registered email 'admin001@classroom.local'.
--
-- Preserves all existing security properties:
--  - SECURITY DEFINER with search_path = ''
--  - Strict active-profile filtering (is_active = TRUE)
--  - Safe student/faculty roster lookups strictly joined to active profiles
--  - Zero exposure of unlinked roster contact emails
--  - Preserves function execute permissions for anon, authenticated, and service_role
-- =========================================================

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

    -- 1. Check public.profiles by login_id (strictly active accounts)
    -- Directly resolves active accounts to their canonical registered email in profiles
    -- (e.g. ADMIN001 -> admin001@classroom.local)
    SELECT email INTO target_email
    FROM public.profiles
    WHERE login_id = clean_id
      AND is_active = TRUE
    LIMIT 1;

    IF target_email IS NOT NULL THEN
        RETURN target_email;
    END IF;

    -- 2. Explicit controlled seed account fallbacks
    -- ADMIN001 canonical identity is admin001@classroom.local (retires legacy admin alias)
    IF clean_id = 'ADMIN001' THEN
        RETURN 'admin001@classroom.local';
    ELSIF clean_id = 'FAC001' THEN
        RETURN 'faculty@classroom.local';
    ELSIF clean_id = 'STU001' THEN
        RETURN 'student@classroom.local';
    END IF;

    -- 3. Check student roster strictly through linked active profile
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

    -- 4. Check faculty roster strictly through linked active profile
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
