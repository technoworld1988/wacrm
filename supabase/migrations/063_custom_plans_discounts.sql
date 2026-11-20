-- ============================================================
-- 063 — Operator-defined plans + discounts
--
-- Plans move from code into `platform_plans` so the platform admin can
-- create their own (e.g. "Website bonus — 3 months free") with their
-- own price and limits. The four built-in plans are seeded and stay
-- editable; `key` is a stable slug referenced by accounts.plan.
--
-- `platform_discounts` are reusable offers (percent or fixed ₹ off).
-- A client can carry one discount; the admin panel shows price →
-- discount → amount to collect. Nothing here charges money — billing
-- is done outside the app (UPI / invoice).
--
-- Both tables are operator-only: RLS on, no grants to client roles;
-- the admin API reads them with the service role.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.platform_plans (
  key               TEXT PRIMARY KEY CHECK (key ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  name              TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  description       TEXT NOT NULL DEFAULT '',
  monthly_price     INTEGER CHECK (monthly_price IS NULL OR monthly_price >= 0),
  yearly_price      INTEGER CHECK (yearly_price IS NULL OR yearly_price >= 0),
  limit_users       INTEGER CHECK (limit_users IS NULL OR limit_users >= 1),
  limit_numbers     INTEGER NOT NULL DEFAULT 1 CHECK (limit_numbers >= 1),
  limit_contacts    INTEGER CHECK (limit_contacts IS NULL OR limit_contacts >= 0),
  limit_ai_replies  INTEGER CHECK (limit_ai_replies IS NULL OR limit_ai_replies >= 0),
  ai_test_allowance INTEGER CHECK (ai_test_allowance IS NULL OR ai_test_allowance >= 0),
  -- Free add-on given with another service (website, Meta ads, video…).
  is_bonus          BOOLEAN NOT NULL DEFAULT false,
  -- Suggested duration when assigning: trial14 | 1m | 3m | 12m
  default_duration  TEXT NOT NULL DEFAULT '1m'
                    CHECK (default_duration IN ('trial14', '1m', '3m', '12m')),
  is_active         BOOLEAN NOT NULL DEFAULT true,
  is_builtin        BOOLEAN NOT NULL DEFAULT false,
  sort_order        INTEGER NOT NULL DEFAULT 100,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_plans FROM anon, authenticated;

INSERT INTO public.platform_plans
  (key, name, description, monthly_price, yearly_price, limit_users, limit_numbers,
   limit_contacts, limit_ai_replies, ai_test_allowance, is_builtin, sort_order)
VALUES
  ('starter', 'Starter', 'Small shops getting started', 1199, 9999, 2, 1, 5000, 300, 100, true, 10),
  ('pro', 'Pro', 'Growing businesses with a small team', 2799, 26999, 6, 1, 50000, 1000, 200, true, 20),
  ('ultra', 'Ultra', 'Busy teams and several numbers', 6999, 69999, 15, 3, NULL, 3000, 500, true, 30),
  ('custom', 'Custom (single client)', 'Your own setup for one client', 2999, NULL, NULL, 1, NULL, 1000, 200, true, 40)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.platform_discounts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  kind        TEXT NOT NULL CHECK (kind IN ('percent', 'amount')),
  value       INTEGER NOT NULL CHECK (value > 0),
  note        TEXT NOT NULL DEFAULT '',
  valid_until DATE,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT platform_discounts_percent_range CHECK (kind <> 'percent' OR value <= 100)
);
ALTER TABLE public.platform_discounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_discounts FROM anon, authenticated;

-- accounts.plan now references the plans table instead of a fixed list.
ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_plan_check;
DO $$ BEGIN
  ALTER TABLE public.accounts ADD CONSTRAINT accounts_plan_fkey
    FOREIGN KEY (plan) REFERENCES public.platform_plans(key) ON UPDATE CASCADE ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS discount_id UUID REFERENCES public.platform_discounts(id) ON DELETE SET NULL;

-- Extend the platform-column guard with discount_id.
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
       NEW.discount_id IS DISTINCT FROM OLD.discount_id
     )
  THEN
    RAISE EXCEPTION 'Plan, status and branding are managed by the platform admin'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
