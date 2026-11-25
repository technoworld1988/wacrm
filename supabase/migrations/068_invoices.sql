-- ============================================================
-- 068 — Estimates, GST invoices, payments and payment reminders
--
-- invoice_settings: one row per account — the seller's GST details,
-- UPI ID, numbering, and the payment-reminder template.
-- invoices: estimates and invoices (kind). Line items live in a JSONB
-- array; totals are computed by the app (src/lib/invoices/calc.ts) and
-- stored so lists and reminders never recompute them.
-- public_token gives each document a hard-to-guess public link (the
-- printable page with a UPI QR) that can be sent on WhatsApp.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.invoice_settings (
  account_id            UUID PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
  business_name         TEXT CHECK (business_name IS NULL OR char_length(business_name) <= 200),
  gstin                 TEXT CHECK (gstin IS NULL OR gstin ~ '^[0-9]{2}[A-Z0-9]{13}$'),
  address               TEXT CHECK (address IS NULL OR char_length(address) <= 500),
  state_code            TEXT CHECK (state_code IS NULL OR state_code ~ '^[0-9]{2}$'),
  phone                 TEXT CHECK (phone IS NULL OR char_length(phone) <= 40),
  email                 TEXT CHECK (email IS NULL OR char_length(email) <= 200),
  upi_id                TEXT CHECK (upi_id IS NULL OR upi_id ~ '^[A-Za-z0-9._-]{2,256}@[A-Za-z0-9.-]{2,64}$'),
  bank_details          TEXT CHECK (bank_details IS NULL OR char_length(bank_details) <= 500),
  invoice_prefix        TEXT NOT NULL DEFAULT 'INV-' CHECK (char_length(invoice_prefix) <= 12),
  estimate_prefix       TEXT NOT NULL DEFAULT 'EST-' CHECK (char_length(estimate_prefix) <= 12),
  next_invoice_number   INTEGER NOT NULL DEFAULT 1 CHECK (next_invoice_number > 0),
  next_estimate_number  INTEGER NOT NULL DEFAULT 1 CHECK (next_estimate_number > 0),
  default_terms         TEXT CHECK (default_terms IS NULL OR char_length(default_terms) <= 1000),
  reminder_template_name     TEXT,
  reminder_template_language TEXT NOT NULL DEFAULT 'en_US',
  -- Values for {{1}}… — may use {{first_name}}, {{number}}, {{amount}},
  -- {{due_date}}, {{upi}}, {{link}}.
  reminder_variables    JSONB NOT NULL DEFAULT '[]'::jsonb,
  reminders_enabled     BOOLEAN NOT NULL DEFAULT true,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.invoices (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id         UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  contact_id         UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  kind               TEXT NOT NULL CHECK (kind IN ('estimate', 'invoice')),
  number             TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'sent', 'accepted', 'declined', 'partially_paid', 'paid', 'cancelled')),
  issue_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date           DATE,
  customer_name      TEXT NOT NULL CHECK (char_length(customer_name) BETWEEN 1 AND 200),
  customer_phone     TEXT,
  customer_gstin     TEXT CHECK (customer_gstin IS NULL OR customer_gstin ~ '^[0-9]{2}[A-Z0-9]{13}$'),
  customer_address   TEXT CHECK (customer_address IS NULL OR char_length(customer_address) <= 500),
  place_of_supply    TEXT CHECK (place_of_supply IS NULL OR place_of_supply ~ '^[0-9]{2}$'),
  items              JSONB NOT NULL DEFAULT '[]'::jsonb,
  discount           NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  subtotal           NUMERIC(14,2) NOT NULL DEFAULT 0,
  cgst               NUMERIC(14,2) NOT NULL DEFAULT 0,
  sgst               NUMERIC(14,2) NOT NULL DEFAULT 0,
  igst               NUMERIC(14,2) NOT NULL DEFAULT 0,
  total              NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_paid        NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  notes              TEXT CHECK (notes IS NULL OR char_length(notes) <= 1000),
  terms              TEXT CHECK (terms IS NULL OR char_length(terms) <= 1000),
  converted_from_id  UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  public_token       TEXT NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  reminder_count     INTEGER NOT NULL DEFAULT 0,
  last_reminder_at   TIMESTAMPTZ,
  claimed_at         TIMESTAMPTZ,
  last_error         TEXT,
  paid_at            TIMESTAMPTZ,
  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, kind, number)
);
CREATE INDEX IF NOT EXISTS idx_invoices_account ON public.invoices(account_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_contact ON public.invoices(contact_id);
CREATE INDEX IF NOT EXISTS idx_invoices_unpaid
  ON public.invoices(due_date)
  WHERE kind = 'invoice' AND status IN ('sent', 'partially_paid');

ALTER TABLE public.invoice_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoice_settings_select ON public.invoice_settings;
CREATE POLICY invoice_settings_select ON public.invoice_settings
  FOR SELECT USING (is_account_member(account_id));

DROP POLICY IF EXISTS invoices_select ON public.invoices;
CREATE POLICY invoices_select ON public.invoices
  FOR SELECT USING (is_account_member(account_id));

-- Hand out the next document number atomically (no duplicates when two
-- people create invoices at the same moment). Service role only.
CREATE OR REPLACE FUNCTION public.next_invoice_number(p_account UUID, p_kind TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix TEXT;
  v_n INTEGER;
BEGIN
  INSERT INTO invoice_settings (account_id) VALUES (p_account) ON CONFLICT (account_id) DO NOTHING;
  IF p_kind = 'estimate' THEN
    UPDATE invoice_settings SET next_estimate_number = next_estimate_number + 1
      WHERE account_id = p_account
      RETURNING estimate_prefix, next_estimate_number - 1 INTO v_prefix, v_n;
  ELSE
    UPDATE invoice_settings SET next_invoice_number = next_invoice_number + 1
      WHERE account_id = p_account
      RETURNING invoice_prefix, next_invoice_number - 1 INTO v_prefix, v_n;
  END IF;
  RETURN v_prefix || lpad(v_n::text, 4, '0');
END;
$$;
REVOKE ALL ON FUNCTION public.next_invoice_number(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_invoice_number(UUID, TEXT) TO service_role;
