-- Migration: Create audit_logs table for tracking all admin actions
-- Run this in Supabase SQL Editor

-- 1. Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email TEXT,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('admin', 'super_admin')),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs (created_at DESC);

-- 3. RLS policies
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Only super_admin can read audit logs
CREATE POLICY "Super admins can view audit logs"
  ON audit_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- Insert policy: admin and super_admin can insert
CREATE POLICY "Admins can insert audit logs"
  ON audit_logs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
    )
  );

-- 4. Auto-cleanup: delete logs older than 1 year (optional cron via pg_cron)
-- If pg_cron is enabled:
-- SELECT cron.schedule('cleanup-audit-logs', '0 3 * * 0', $$DELETE FROM audit_logs WHERE created_at < now() - interval '1 year'$$);

-- 5. Create notification_reads table for server-side read tracking
CREATE TABLE IF NOT EXISTS notification_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_id TEXT NOT NULL,
  read_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_reads_unique
  ON notification_reads (user_id, notification_id);

CREATE INDEX IF NOT EXISTS idx_notification_reads_user
  ON notification_reads (user_id);

ALTER TABLE notification_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own notification reads"
  ON notification_reads FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 6. Add priority and sla_deadline columns to complaints table
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent'));
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS sla_deadline TIMESTAMPTZ;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS escalated BOOLEAN DEFAULT false;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_complaints_priority ON complaints (priority);
CREATE INDEX IF NOT EXISTS idx_complaints_sla ON complaints (sla_deadline) WHERE sla_deadline IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_complaints_escalated ON complaints (escalated) WHERE escalated = true;

-- 7. Add deactivated column to profiles for soft-delete user management
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deactivated BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_profiles_deactivated ON profiles (deactivated) WHERE deactivated = true;
