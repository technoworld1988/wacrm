-- ============================================================
-- PUSH SUBSCRIPTIONS (Web Push / installable app notifications)
-- ============================================================
-- One row per browser/device that a signed-in member enabled push on.
-- The server (webhook, service role) reads these to deliver a push
-- notification for a new inbound customer message even when the CRM
-- tab is closed — the service worker in /public/sw.js renders it.
--
-- Rows are written by /api/push/subscription with the service role
-- after the caller's session + account are verified, so clients get
-- only SELECT / DELETE on their own rows here.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- The push service URL is globally unique per subscription; a device
  -- that re-subscribes (or changes account) upserts on it.
  endpoint        TEXT NOT NULL UNIQUE,
  p256dh          TEXT NOT NULL,
  auth            TEXT NOT NULL,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_success_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_account_user
  ON push_subscriptions(account_id, user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subscriptions_select ON push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_delete ON push_subscriptions;
CREATE POLICY push_subscriptions_select ON push_subscriptions FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY push_subscriptions_delete ON push_subscriptions FOR DELETE
  USING (auth.uid() = user_id);

REVOKE INSERT, UPDATE ON push_subscriptions FROM authenticated, anon;
