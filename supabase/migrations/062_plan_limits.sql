-- ============================================================
-- 062 — Plan limits (users, contacts, AI replies) + AI test log
--
-- Limits are stored per account (set from the plan's defaults by the
-- platform admin API when a client is created or changes plan, and
-- editable per client). NULL = unlimited, which is what every
-- pre-existing account gets.
--
--   limit_users        members + pending invites (checked at invite)
--   limit_contacts     enforced here for contacts added from the app
--                      (manual add, CSV import). Contacts created by
--                      inbound WhatsApp messages run on the service
--                      role and are never blocked — a customer message
--                      must not be lost because of a plan limit.
--   limit_ai_replies   live AI replies + drafts per calendar month (IST)
--   ai_test_allowance  AI test-chat messages per month, counted apart
--                      so testing never eats the client's replies
--
-- ai_alert_month / ai_alert_level remember which usage alerts (80 /
-- 100 %) were already pushed this month.
-- ============================================================

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS limit_users INTEGER,
  ADD COLUMN IF NOT EXISTS limit_contacts INTEGER,
  ADD COLUMN IF NOT EXISTS limit_ai_replies INTEGER,
  ADD COLUMN IF NOT EXISTS ai_test_allowance INTEGER,
  ADD COLUMN IF NOT EXISTS ai_alert_month TEXT,
  ADD COLUMN IF NOT EXISTS ai_alert_level INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE public.accounts ADD CONSTRAINT accounts_limits_check CHECK (
    (limit_users IS NULL OR limit_users >= 1) AND
    (limit_contacts IS NULL OR limit_contacts >= 0) AND
    (limit_ai_replies IS NULL OR limit_ai_replies >= 0) AND
    (ai_test_allowance IS NULL OR ai_test_allowance >= 0)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Playground tests are now logged (mode 'test').
ALTER TABLE public.ai_usage_log DROP CONSTRAINT IF EXISTS ai_usage_log_mode_check;
ALTER TABLE public.ai_usage_log
  ADD CONSTRAINT ai_usage_log_mode_check CHECK (mode IN ('auto_reply', 'draft', 'test'));

-- Limits are platform-managed: extend the 061 guard.
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
       NEW.ai_alert_level IS DISTINCT FROM OLD.ai_alert_level
     )
  THEN
    RAISE EXCEPTION 'Plan, status and branding are managed by the platform admin'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- Contact limit: one check per INSERT statement (not per row), so a
-- 5,000-row CSV import costs one count, and the whole batch is
-- refused if it would go over.
CREATE OR REPLACE FUNCTION public.enforce_contact_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' THEN
    RETURN NULL;
  END IF;
  FOR r IN
    SELECT a.id, a.limit_contacts
    FROM public.accounts a
    WHERE a.limit_contacts IS NOT NULL
      AND a.id IN (SELECT DISTINCT account_id FROM new_rows)
  LOOP
    IF (SELECT count(*) FROM public.contacts c WHERE c.account_id = r.id) > r.limit_contacts THEN
      RAISE EXCEPTION 'Your plan allows % contacts. Ask TECHNO WORLD to upgrade your plan to add more.', r.limit_contacts
        USING ERRCODE = 'P0001', HINT = 'contact_limit_reached';
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_contact_limit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_contact_limit ON public.contacts;
CREATE TRIGGER enforce_contact_limit
  AFTER INSERT ON public.contacts
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_contact_limit();
