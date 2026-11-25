-- ============================================================
-- 065 — Public live demo account
--
-- One account (is_demo = true) holds sample data for the public
-- /demo page. Visitors are signed in as a read-only viewer member of
-- it, so they can click around but never send, change settings or
-- see a real client's data. /demo re-seeds the sample data when it
-- is older than 12 hours, so timestamps stay fresh ("2 hours ago").
--
-- Only the platform (service role / platform admin) may set these
-- flags — added to the protected-columns trigger.
-- ============================================================

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS demo_seeded_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.protect_platform_account_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') IN ('authenticated', 'anon')
     AND NOT public.is_platform_admin()
     AND (
       NEW.status IS DISTINCT FROM OLD.status OR
       NEW.plan IS DISTINCT FROM OLD.plan OR
       NEW.plan_ends_at IS DISTINCT FROM OLD.plan_ends_at OR
       NEW.renewal_reminded_at IS DISTINCT FROM OLD.renewal_reminded_at OR
       NEW.white_label IS DISTINCT FROM OLD.white_label OR
       NEW.brand_name IS DISTINCT FROM OLD.brand_name OR
       NEW.brand_logo_url IS DISTINCT FROM OLD.brand_logo_url OR
       NEW.brand_primary IS DISTINCT FROM OLD.brand_primary OR
       NEW.brand_accent IS DISTINCT FROM OLD.brand_accent OR
       NEW.brand_domain IS DISTINCT FROM OLD.brand_domain OR
       NEW.limit_users IS DISTINCT FROM OLD.limit_users OR
       NEW.limit_contacts IS DISTINCT FROM OLD.limit_contacts OR
       NEW.limit_ai_replies IS DISTINCT FROM OLD.limit_ai_replies OR
       NEW.ai_test_allowance IS DISTINCT FROM OLD.ai_test_allowance OR
       NEW.ai_alert_month IS DISTINCT FROM OLD.ai_alert_month OR
       NEW.ai_alert_level IS DISTINCT FROM OLD.ai_alert_level OR
       NEW.discount_id IS DISTINCT FROM OLD.discount_id OR
       NEW.is_demo IS DISTINCT FROM OLD.is_demo OR
       NEW.demo_seeded_at IS DISTINCT FROM OLD.demo_seeded_at
     )
  THEN
    RAISE EXCEPTION 'Plan, status and branding are managed by the platform admin'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
