-- ============================================================
-- 064 — Follow-up sequences + manual follow-up reminders
--
-- A follow-up sequence is an ordered list of approved WhatsApp
-- templates, each sent N days after the previous one (follow-up 1 →
-- 2 → 3 → final). A contact is enrolled manually, or automatically
-- when a new lead messages in (auto_enroll_new_contacts). The run
-- stops by itself the moment the contact replies — the inbound
-- webhook flips the enrollment to 'replied'.
--
-- Templates are used for every step because follow-ups go out after
-- the 24h window has usually closed; Meta rejects free-form text
-- there (error 131047).
--
-- contacts.next_follow_up_at / follow_up_note are the manual
-- "call Priya on Friday" reminders that feed the Today list.
--
-- Reads are RLS-scoped to account members; writes go through the
-- API with the service role after an explicit role check (same
-- pattern as quick_replies).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.followup_sequences (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id               UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id                  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name                     TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  auto_enroll_new_contacts BOOLEAN NOT NULL DEFAULT false,
  is_active                BOOLEAN NOT NULL DEFAULT true,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_followup_sequences_account ON public.followup_sequences(account_id);

-- Steps carry no account_id of their own: they belong to a sequence
-- and are always read through it.
CREATE TABLE IF NOT EXISTS public.followup_steps (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id       UUID NOT NULL REFERENCES public.followup_sequences(id) ON DELETE CASCADE,
  position          INTEGER NOT NULL CHECK (position >= 0 AND position < 10),
  -- Days to wait after the previous step (or after enrolling, for the
  -- first step). 0 = send straight away.
  delay_days        INTEGER NOT NULL DEFAULT 1 CHECK (delay_days BETWEEN 0 AND 60),
  template_name     TEXT NOT NULL CHECK (char_length(template_name) BETWEEN 1 AND 512),
  template_language TEXT NOT NULL DEFAULT 'en_US',
  -- Values for {{1}}, {{2}}, … in order. May contain {{name}},
  -- {{first_name}} or {{phone}}, filled per contact at send time.
  variables         JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sequence_id, position)
);

CREATE TABLE IF NOT EXISTS public.followup_enrollments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  sequence_id  UUID NOT NULL REFERENCES public.followup_sequences(id) ON DELETE CASCADE,
  contact_id   UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'active'
               CHECK (status IN ('active', 'replied', 'completed', 'stopped', 'failed')),
  next_step    INTEGER NOT NULL DEFAULT 0,
  next_run_at  TIMESTAMPTZ,
  -- Set while the cron is sending, so overlapping runs don't double-send.
  claimed_at   TIMESTAMPTZ,
  last_sent_at TIMESTAMPTZ,
  replied_at   TIMESTAMPTZ,
  last_error   TEXT,
  enrolled_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- One running sequence per contact at a time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_followup_enrollments_active
  ON public.followup_enrollments(contact_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_followup_enrollments_due
  ON public.followup_enrollments(next_run_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_followup_enrollments_account
  ON public.followup_enrollments(account_id, status, updated_at DESC);

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS next_follow_up_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS follow_up_note TEXT CHECK (follow_up_note IS NULL OR char_length(follow_up_note) <= 500);
CREATE INDEX IF NOT EXISTS idx_contacts_next_follow_up
  ON public.contacts(account_id, next_follow_up_at) WHERE next_follow_up_at IS NOT NULL;

ALTER TABLE public.followup_sequences   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followup_steps       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followup_enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS followup_sequences_select ON public.followup_sequences;
CREATE POLICY followup_sequences_select ON public.followup_sequences
  FOR SELECT USING (is_account_member(account_id));

DROP POLICY IF EXISTS followup_steps_select ON public.followup_steps;
CREATE POLICY followup_steps_select ON public.followup_steps
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.followup_sequences s
    WHERE s.id = followup_steps.sequence_id AND is_account_member(s.account_id)
  ));

DROP POLICY IF EXISTS followup_enrollments_select ON public.followup_enrollments;
CREATE POLICY followup_enrollments_select ON public.followup_enrollments
  FOR SELECT USING (is_account_member(account_id));
