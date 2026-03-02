-- Migration: Add announcements, complaint_messages, surveys, and survey_responses tables
-- Run this against your Supabase project to enable:
-- 1. Admin broadcast announcements
-- 2. Threaded complaint conversations
-- 3. Student satisfaction surveys

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. ANNOUNCEMENTS — Admin broadcasts to students
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (length(title) <= 200),
  body TEXT CHECK (body IS NULL OR length(body) <= 1000),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  target_block TEXT DEFAULT 'all', -- 'all' or specific hostel block name
  expires_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for efficient student queries (active, non-expired)
CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements (created_at DESC, expires_at);

CREATE INDEX IF NOT EXISTS idx_announcements_target ON announcements (target_block);

-- RLS
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- Students can read announcements targeted at their block or all
CREATE POLICY "Students can read relevant announcements" ON announcements
  FOR SELECT
  USING (
    target_block = 'all'
    OR target_block IS NULL
    OR target_block = (SELECT hostel_block FROM profiles WHERE id = auth.uid())
  );

-- Admins/super_admins can insert
CREATE POLICY "Admins can create announcements" ON announcements
  FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

-- Super admins can delete any; admins can delete their own
CREATE POLICY "Admins can delete announcements" ON announcements
  FOR DELETE
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );


-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. COMPLAINT MESSAGES — Threaded conversations on complaints
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS complaint_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL CHECK (length(message) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_complaint_messages_complaint ON complaint_messages (complaint_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_complaint_messages_sender ON complaint_messages (sender_id);

-- RLS
ALTER TABLE complaint_messages ENABLE ROW LEVEL SECURITY;

-- Users can read messages on complaints they participate in
CREATE POLICY "Users can read their complaint messages" ON complaint_messages
  FOR SELECT
  USING (
    -- Complaint owner
    EXISTS (SELECT 1 FROM complaints WHERE id = complaint_id AND user_id = auth.uid())
    -- Or admin/super_admin
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

-- Users can insert messages on complaints they participate in
CREATE POLICY "Users can send complaint messages" ON complaint_messages
  FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      EXISTS (SELECT 1 FROM complaints WHERE id = complaint_id AND user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
    )
  );


-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. SURVEYS — Student satisfaction surveys
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (length(title) <= 200),
  description TEXT CHECK (description IS NULL OR length(description) <= 500),
  questions JSONB NOT NULL, -- Array of { question: string, type: 'rating'|'text'|'choice', options?: string[] }
  active BOOLEAN NOT NULL DEFAULT true,
  target_block TEXT DEFAULT 'all',
  expires_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_surveys_active ON surveys (active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_surveys_target ON surveys (target_block);

-- RLS
ALTER TABLE surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read active surveys" ON surveys
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can create surveys" ON surveys
  FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

CREATE POLICY "Admins can update surveys" ON surveys
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );


-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. SURVEY RESPONSES — Student answers to surveys
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hostel_block TEXT,
  answers JSONB NOT NULL, -- Array of { questionIndex: number, value: string | number }
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (survey_id, user_id) -- One response per student per survey
);

CREATE INDEX IF NOT EXISTS idx_survey_responses_survey ON survey_responses (survey_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_user ON survey_responses (user_id);

-- RLS
ALTER TABLE survey_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can insert their own responses" ON survey_responses
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'student')
  );

CREATE POLICY "Students can read their own responses" ON survey_responses
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admins can read all responses" ON survey_responses
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );
