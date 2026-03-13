-- Migration: Add checkin_count_overrides table for super admin to override meal check-in counts
-- Run this migration via Supabase dashboard or CLI

-- 1. Create checkin_count_overrides table
CREATE TABLE IF NOT EXISTS checkin_count_overrides (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'snacks', 'dinner')),
  hostel_block TEXT NOT NULL,
  original_count INTEGER NOT NULL DEFAULT 0,
  override_count INTEGER NOT NULL,
  overridden_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, meal_type, hostel_block)
);

-- 2. Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_checkin_overrides_date ON checkin_count_overrides(date);
CREATE INDEX IF NOT EXISTS idx_checkin_overrides_block_date ON checkin_count_overrides(hostel_block, date);

-- 3. Enable RLS
ALTER TABLE checkin_count_overrides ENABLE ROW LEVEL SECURITY;

-- 4. Only super_admin can manage overrides
CREATE POLICY "Super admin can manage checkin overrides"
  ON checkin_count_overrides FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- 5. Admins can read overrides (to see corrected counts)
CREATE POLICY "Admins can read checkin overrides"
  ON checkin_count_overrides FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
    )
  );
