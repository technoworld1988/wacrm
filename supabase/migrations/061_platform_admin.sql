-- ============================================================
-- 061 — Platform admin panel: client plans, expiry, white-label
--
-- One platform operator (TECHNO WORLD) creates and manages client
-- businesses. Each client is an `accounts` row; this migration adds:
--
--   * platform_admins          — who may open /admin
--   * accounts.status / plan / plan_ends_at — access control
--   * accounts.white_label + brand_* — per-client branding
--   * platform_client_notes    — the operator's private notes
--   * platform_admin_activity  — audit trail shown on the dashboard
--
-- Self sign-ups now land in status 'pending' and cannot use the app
-- until the operator activates them. Existing accounts are 'active'.
-- Plan/status/branding columns can only be changed by the service
-- role or a platform admin (trigger below), so a client owner cannot
-- extend their own plan through the normal accounts UPDATE policy.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_admins FROM anon, authenticated;
GRANT SELECT ON public.platform_admins TO authenticated;
DROP POLICY IF EXISTS platform_admins_select_self ON public.platform_admins;
CREATE POLICY platform_admins_select_self ON public.platform_admins
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, service_role;

-- ---- accounts: plan, status, branding --------------------------------
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS plan TEXT,
  ADD COLUMN IF NOT EXISTS plan_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS business_phone TEXT,
  ADD COLUMN IF NOT EXISTS renewal_reminded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS white_label BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS brand_name TEXT,
  ADD COLUMN IF NOT EXISTS brand_logo_url TEXT,
  ADD COLUMN IF NOT EXISTS brand_primary TEXT,
  ADD COLUMN IF NOT EXISTS brand_accent TEXT,
  ADD COLUMN IF NOT EXISTS brand_domain TEXT;

-- Existing rows were backfilled as 'active' by the ADD COLUMN default;
-- from now on a fresh (self) sign-up waits for activation.
ALTER TABLE public.accounts ALTER COLUMN status SET DEFAULT 'pending';

DO $$ BEGIN
  ALTER TABLE public.accounts ADD CONSTRAINT accounts_status_check
    CHECK (status IN ('active', 'trial', 'paused', 'pending'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.accounts ADD CONSTRAINT accounts_plan_check
    CHECK (plan IS NULL OR plan IN ('starter', 'pro', 'ultra', 'custom'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.accounts ADD CONSTRAINT accounts_brand_colors_check
    CHECK (
      (brand_primary IS NULL OR brand_primary ~ '^#[0-9A-Fa-f]{6}$') AND
      (brand_accent IS NULL OR brand_accent ~ '^#[0-9A-Fa-f]{6}$')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.accounts ADD CONSTRAINT accounts_brand_domain_check
    CHECK (brand_domain IS NULL OR brand_domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS accounts_brand_domain_key
  ON public.accounts (brand_domain) WHERE brand_domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS accounts_plan_ends_at_idx
  ON public.accounts (plan_ends_at) WHERE plan_ends_at IS NOT NULL;

-- Only the service role (admin API routes, cron) or a platform admin
-- may touch the platform-managed columns.
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
       NEW.brand_domain IS DISTINCT FROM OLD.brand_domain
     )
  THEN
    RAISE EXCEPTION 'Plan, status and branding are managed by the platform admin'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_platform_account_columns ON public.accounts;
CREATE TRIGGER protect_platform_account_columns
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.protect_platform_account_columns();

-- ---- operator notes (never visible to the client) ---------------------
CREATE TABLE IF NOT EXISTS public.platform_client_notes (
  account_id UUID PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
  note       TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_client_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_client_notes FROM anon, authenticated;

-- ---- audit trail --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_admin_activity (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  account_id    UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,
  details       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_admin_activity_created_idx
  ON public.platform_admin_activity (created_at DESC);
ALTER TABLE public.platform_admin_activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_admin_activity FROM anon, authenticated;

-- ---- public bucket for client logos (written by the service role) -----
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('brand-assets', 'brand-assets', true, 1048576,
        ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO NOTHING;
