-- ============================================================
-- 067 — Appointments + automatic WhatsApp reminders
--
-- Clinics, salons, coaching classes, site visits: a booked slot gets
-- a reminder the day before (10:00 or later, India time) and another
-- N hours before. When the customer taps "Confirm" / "Reschedule" (or
-- replies 1 / 2) on the reminder, the appointment status updates.
--
-- Reminders are approved WhatsApp templates (they usually go out
-- after the 24h window has closed). appointment_settings holds the
-- account's template and timing; one row per account.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.appointments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  contact_id        UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  title             TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  starts_at         TIMESTAMPTZ NOT NULL,
  duration_minutes  INTEGER NOT NULL DEFAULT 30 CHECK (duration_minutes BETWEEN 5 AND 1440),
  location          TEXT CHECK (location IS NULL OR char_length(location) <= 200),
  notes             TEXT CHECK (notes IS NULL OR char_length(notes) <= 1000),
  status            TEXT NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled', 'confirmed', 'reschedule_requested', 'cancelled', 'completed', 'no_show')),
  reminders_enabled BOOLEAN NOT NULL DEFAULT true,
  day_before_sent_at   TIMESTAMPTZ,
  hours_before_sent_at TIMESTAMPTZ,
  -- Claim marker so overlapping cron runs never double-send.
  claimed_at        TIMESTAMPTZ,
  last_error        TEXT,
  responded_at      TIMESTAMPTZ,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_appointments_account_start ON public.appointments(account_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_appointments_contact ON public.appointments(contact_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_appointments_upcoming
  ON public.appointments(starts_at)
  WHERE status IN ('scheduled', 'confirmed') AND reminders_enabled;

CREATE TABLE IF NOT EXISTS public.appointment_settings (
  account_id          UUID PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
  template_name       TEXT,
  template_language   TEXT NOT NULL DEFAULT 'en_US',
  -- Values for {{1}}, {{2}}, … — may use {{first_name}}, {{name}},
  -- {{date}}, {{time}}, {{title}}, {{location}}.
  variables           JSONB NOT NULL DEFAULT '[]'::jsonb,
  remind_day_before   BOOLEAN NOT NULL DEFAULT true,
  remind_hours_before INTEGER CHECK (remind_hours_before IS NULL OR remind_hours_before BETWEEN 1 AND 12),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.appointments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS appointments_select ON public.appointments;
CREATE POLICY appointments_select ON public.appointments
  FOR SELECT USING (is_account_member(account_id));

DROP POLICY IF EXISTS appointment_settings_select ON public.appointment_settings;
CREATE POLICY appointment_settings_select ON public.appointment_settings
  FOR SELECT USING (is_account_member(account_id));
