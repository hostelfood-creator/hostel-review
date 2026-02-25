-- Migration: Add hostel_blocks table and super_admin support
-- Run this migration via Supabase dashboard or CLI

-- 1. Create hostel_blocks table
CREATE TABLE IF NOT EXISTS hostel_blocks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable RLS
ALTER TABLE hostel_blocks ENABLE ROW LEVEL SECURITY;

-- 3. Allow anyone to read blocks (for registration dropdown)
CREATE POLICY "Anyone can read blocks"
  ON hostel_blocks FOR SELECT
  USING (true);

-- 4. Only super_admin can insert/update/delete blocks
CREATE POLICY "Super admin can manage blocks"
  ON hostel_blocks FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- 5. Seed default hostel blocks
INSERT INTO hostel_blocks (name) VALUES
  ('Annapoorani Hostel'),
  ('Visalakshi Hostel'),
  ('Sri Saraswathi Hostel'),
  ('Sri Kamakshi Hostel'),
  ('Sri Meenakshi Hostel')
ON CONFLICT (name) DO NOTHING;

-- 6. Create super admin user profile
-- Note: You must first create the auth user via supabase.auth.signUp
-- Then insert the profile with role 'super_admin'
-- The seed script below handles this automatically
