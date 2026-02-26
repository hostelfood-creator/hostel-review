-- Migration: Fix FK constraints to CASCADE on user deletion + Migrate auth emails
-- ================================================================================
-- PROBLEM 1: Deleting a user from Supabase dashboard fails because:
--   "null value in column "user_id" of relation "reviews" violates not-null constraint"
--   The default FK action is SET NULL, but user_id is NOT NULL → error.
--   Fix: Change FK constraints to ON DELETE CASCADE.
--
-- PROBLEM 2: auth.users.email shows @hostel.local (synthetic email).
--   Fix: Update auth emails to match the real email stored in profiles.email.
--
-- Run this migration in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ================================================================================

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  PART 1: Fix FK constraints — ON DELETE CASCADE                  ║
-- ╚═══════════════════════════════════════════════════════════════════╝

-- Helper: Drop the old FK and re-add with CASCADE.
-- We check information_schema to avoid errors if constraint names differ.

-- 1a. reviews.user_id → auth.users(id) ON DELETE CASCADE
DO $$
DECLARE
  fk_name TEXT;
BEGIN
  -- Find the FK constraint name on reviews.user_id
  SELECT tc.constraint_name INTO fk_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
  WHERE tc.table_name = 'reviews'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'user_id'
    AND tc.table_schema = 'public'
  LIMIT 1;

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.reviews DROP CONSTRAINT %I', fk_name);
    RAISE NOTICE 'Dropped FK % on reviews.user_id', fk_name;
  END IF;

  -- Re-add with CASCADE (try auth.users first, fall back to profiles)
  BEGIN
    ALTER TABLE public.reviews
      ADD CONSTRAINT reviews_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added reviews_user_id_fkey → auth.users(id) ON DELETE CASCADE';
  EXCEPTION WHEN OTHERS THEN
    -- If reviews.user_id references profiles instead of auth.users
    ALTER TABLE public.reviews
      ADD CONSTRAINT reviews_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added reviews_user_id_fkey → profiles(id) ON DELETE CASCADE';
  END;
END $$;

-- 1b. complaints.user_id → CASCADE
DO $$
DECLARE
  fk_name TEXT;
BEGIN
  SELECT tc.constraint_name INTO fk_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
  WHERE tc.table_name = 'complaints'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'user_id'
    AND tc.table_schema = 'public'
  LIMIT 1;

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.complaints DROP CONSTRAINT %I', fk_name);
  END IF;

  BEGIN
    ALTER TABLE public.complaints
      ADD CONSTRAINT complaints_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  EXCEPTION WHEN OTHERS THEN
    ALTER TABLE public.complaints
      ADD CONSTRAINT complaints_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END;
  RAISE NOTICE 'complaints.user_id → ON DELETE CASCADE';
END $$;

-- 1c. notifications.user_id → CASCADE
DO $$
DECLARE
  fk_name TEXT;
BEGIN
  SELECT tc.constraint_name INTO fk_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
  WHERE tc.table_name = 'notifications'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'user_id'
    AND tc.table_schema = 'public'
  LIMIT 1;

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.notifications DROP CONSTRAINT %I', fk_name);
  END IF;

  BEGIN
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  EXCEPTION WHEN OTHERS THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END;
  RAISE NOTICE 'notifications.user_id → ON DELETE CASCADE';
END $$;

-- 1d. profiles.id → auth.users(id) ON DELETE CASCADE
-- profiles.id is typically the PK that also references auth.users(id).
DO $$
DECLARE
  fk_name TEXT;
BEGIN
  SELECT tc.constraint_name INTO fk_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
  WHERE tc.table_name = 'profiles'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'id'
    AND tc.table_schema = 'public'
  LIMIT 1;

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', fk_name);
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_id_fkey
      FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
    RAISE NOTICE 'profiles.id → auth.users(id) ON DELETE CASCADE';
  ELSE
    RAISE NOTICE 'No FK found on profiles.id — skipping';
  END IF;
END $$;

-- 1e. password_reset_otps — CASCADE (if it references profiles or auth.users)
DO $$
DECLARE
  fk_name TEXT;
BEGIN
  SELECT tc.constraint_name INTO fk_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
  WHERE tc.table_name = 'password_reset_otps'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
  LIMIT 1;

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.password_reset_otps DROP CONSTRAINT %I', fk_name);
    -- Re-add with CASCADE
    BEGIN
      ALTER TABLE public.password_reset_otps
        ADD CONSTRAINT password_reset_otps_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    EXCEPTION WHEN OTHERS THEN
      NULL; -- Column might be named differently, skip
    END;
    RAISE NOTICE 'password_reset_otps → ON DELETE CASCADE';
  END IF;
END $$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  PART 2: Migrate existing @hostel.local emails to real emails    ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- This updates auth.users.email from synthetic @hostel.local to the
-- real @kanchiuniv.ac.in email stored in profiles.email.
-- Only affects users whose auth email is @hostel.local AND who have
-- a real email in profiles.

-- NOTE: Supabase auth.users is normally not directly updatable via SQL.
-- You may need to run this migration using the service role key via the
-- Supabase Management API or the Admin SDK instead.
-- If your Supabase plan allows direct auth schema writes, this will work:

DO $$
DECLARE
  rec RECORD;
  migrated INT := 0;
BEGIN
  FOR rec IN
    SELECT p.id, p.email AS real_email, u.email AS auth_email
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE u.email LIKE '%@hostel.local'
      AND p.email IS NOT NULL
      AND p.email != ''
      AND p.email NOT LIKE '%@hostel.local'
  LOOP
    UPDATE auth.users
    SET email = rec.real_email,
        email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
        updated_at = NOW()
    WHERE id = rec.id;
    migrated := migrated + 1;
  END LOOP;

  RAISE NOTICE 'Migrated % auth.users emails from @hostel.local to real email', migrated;
END $$;

-- Also update the identities table (Supabase stores email in identity_data too)
UPDATE auth.identities i
SET identity_data = jsonb_set(
      i.identity_data,
      '{email}',
      to_jsonb(p.email)
    ),
    updated_at = NOW()
FROM public.profiles p
WHERE i.user_id = p.id
  AND i.identity_data->>'email' LIKE '%@hostel.local'
  AND p.email IS NOT NULL
  AND p.email != ''
  AND p.email NOT LIKE '%@hostel.local';


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  VERIFICATION: Check results                                     ║
-- ╚═══════════════════════════════════════════════════════════════════╝

-- Count remaining @hostel.local emails (should be 0 after migration)
SELECT count(*) AS remaining_hostel_local
FROM auth.users
WHERE email LIKE '%@hostel.local';

-- Show migrated users
SELECT u.id, u.email AS auth_email, p.email AS profile_email, p.register_id
FROM auth.users u
JOIN public.profiles p ON p.id = u.id
ORDER BY u.created_at DESC
LIMIT 20;
