-- Migration: Add hostel_block column to menus table for per-hostel menus
-- Each hostel now has its own separate mess menu.
-- Run this in Supabase SQL Editor.

-- Step 1: Add hostel_block column (nullable initially for backward compat)
ALTER TABLE menus
ADD COLUMN IF NOT EXISTS hostel_block TEXT;

-- Step 2: Drop the old unique constraint (date, meal_type)
-- The constraint name may vary — try common patterns
DO $$
BEGIN
  -- Try dropping by common auto-generated constraint names
  BEGIN
    ALTER TABLE menus DROP CONSTRAINT IF EXISTS menus_date_meal_type_key;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    ALTER TABLE menus DROP CONSTRAINT IF EXISTS menus_date_meal_type_unique;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  -- Also drop any index that enforces uniqueness
  DROP INDEX IF EXISTS menus_date_meal_type_key;
  DROP INDEX IF EXISTS menus_date_meal_type_idx;
END $$;

-- Step 3: Set existing menus to a default block if you want,
-- or leave NULL (they'll be treated as "unassigned / global")
-- UPDATE menus SET hostel_block = 'Annapoorani Hostel' WHERE hostel_block IS NULL;

-- Step 4: Create the new unique constraint (date, meal_type, hostel_block)
-- Using a unique index with COALESCE to handle NULL hostel_block properly
CREATE UNIQUE INDEX IF NOT EXISTS menus_date_meal_type_block_unique
ON menus (date, meal_type, COALESCE(hostel_block, '__global__'));

-- Step 5: Add an index for fast lookups by hostel_block + date
CREATE INDEX IF NOT EXISTS menus_block_date_idx
ON menus (hostel_block, date);

-- Step 6: Enable RLS if not already enabled
ALTER TABLE menus ENABLE ROW LEVEL SECURITY;

-- Step 7: Allow authenticated users to read menus (students need to see their hostel menu)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'menus' AND policyname = 'Anyone can read menus'
  ) THEN
    CREATE POLICY "Anyone can read menus" ON menus FOR SELECT USING (true);
  END IF;
END $$;

-- Step 8: Allow admins/super_admins to insert/update menus
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'menus' AND policyname = 'Admins can manage menus'
  ) THEN
    CREATE POLICY "Admins can manage menus" ON menus
    FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin')
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'super_admin')
      )
    );
  END IF;
END $$;
