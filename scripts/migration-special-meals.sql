-- Migration: Add special_label column to menus table
-- This enables Festival / Special Day tagging for meals

ALTER TABLE menus ADD COLUMN IF NOT EXISTS special_label TEXT DEFAULT NULL;

-- Optional index for analytics queries that filter by special days
CREATE INDEX IF NOT EXISTS idx_menus_special_label ON menus (special_label) WHERE special_label IS NOT NULL;

-- Example values: 'Festival Special', 'Guest Day', 'Pongal Special', 'Diwali Feast', etc.
