-- Migration: Add meal_timings column to site_settings
-- Run this in Supabase SQL Editor before deploying

-- Add a JSONB column to store configurable meal check-in windows
ALTER TABLE site_settings
ADD COLUMN IF NOT EXISTS meal_timings JSONB DEFAULT '{
  "breakfast": { "start": "07:00", "end": "10:00", "label": "Breakfast" },
  "lunch":     { "start": "12:00", "end": "15:00", "label": "Lunch" },
  "snacks":    { "start": "16:00", "end": "18:00", "label": "Snacks" },
  "dinner":    { "start": "19:00", "end": "22:00", "label": "Dinner" }
}'::jsonb;

-- Ensure existing row has default timings if column was just added
UPDATE site_settings
SET meal_timings = '{
  "breakfast": { "start": "07:00", "end": "10:00", "label": "Breakfast" },
  "lunch":     { "start": "12:00", "end": "15:00", "label": "Lunch" },
  "snacks":    { "start": "16:00", "end": "18:00", "label": "Snacks" },
  "dinner":    { "start": "19:00", "end": "22:00", "label": "Dinner" }
}'::jsonb
WHERE id = 1 AND meal_timings IS NULL;
