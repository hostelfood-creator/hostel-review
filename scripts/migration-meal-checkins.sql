-- Migration: Add meal_checkins table for QR-based meal attendance tracking
-- Run this migration via Supabase dashboard or CLI

-- 1. Create meal_checkins table
CREATE TABLE IF NOT EXISTS meal_checkins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'snacks', 'dinner')),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  hostel_block TEXT,
  checked_in_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, meal_type, date)
);

-- 2. Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_meal_checkins_date ON meal_checkins(date);
CREATE INDEX IF NOT EXISTS idx_meal_checkins_user_date ON meal_checkins(user_id, date);
CREATE INDEX IF NOT EXISTS idx_meal_checkins_meal_date ON meal_checkins(meal_type, date);
CREATE INDEX IF NOT EXISTS idx_meal_checkins_block_date ON meal_checkins(hostel_block, date);

-- 3. Enable RLS
ALTER TABLE meal_checkins ENABLE ROW LEVEL SECURITY;

-- 4. Students can insert their own check-ins
CREATE POLICY "Students can insert own check-ins"
  ON meal_checkins FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 5. Students can read their own check-ins
CREATE POLICY "Students can read own check-ins"
  ON meal_checkins FOR SELECT
  USING (auth.uid() = user_id);

-- 6. Admins and super_admins can read all check-ins
CREATE POLICY "Admins can read all check-ins"
  ON meal_checkins FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
    )
  );

-- 7. Super admins can delete check-ins (for data management)
CREATE POLICY "Super admin can manage check-ins"
  ON meal_checkins FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );
