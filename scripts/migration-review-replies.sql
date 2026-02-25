-- Add admin reply columns to reviews table
-- This allows admins to respond to student food reviews

ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS admin_reply TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS admin_reply_by UUID REFERENCES profiles(id) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS admin_replied_at TIMESTAMPTZ DEFAULT NULL;

-- Index for finding reviews with/without replies efficiently
CREATE INDEX IF NOT EXISTS idx_reviews_admin_reply ON reviews (admin_replied_at) WHERE admin_replied_at IS NOT NULL;
