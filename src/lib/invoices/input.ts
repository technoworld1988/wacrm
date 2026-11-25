// Validate invoice / estimate / settings input from the API. Pure.

import { GST_RATES, type InvoiceItem } from './calc'

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const GSTIN = /^[0-9]{2}[A-Z0-9]{13}$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const STATE = /^[0-9]{2}$/

export interface InvoiceInput {
  kind?: 'estimate' | 'invoice'
  contact_id?: string | null
  customer_name?: string
  customer_phone?: string | null
  customer_gstin?: string | null
  customer_address?: string | null
  place_of_supply?: string | null
  issue_date?: string
  due_date?: string | null
  items?: InvoiceItem[]
  discount?: number
  notes?: string | null
  terms?: string | null
}

function text(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
}

function validDate(s: string): boolean {
  if (!DATE.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/** `partial` = PATCH. Error codes map to Api.invoices.* */
export function parseInvoiceInput(body: unknown, partial = false): ParseResult<InvoiceInput> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'invalid' }
  const b = body as Record<string, unknown>
  const out: InvoiceInput = {}

  if (!partial) {
    if (b.kind !== 'estimate' && b.kind !== 'invoice') return { ok: false, error: 'invalid' }
    out.kind = b.kind
  }
  if (b.contact_id !== undefined) {
    if (b.contact_id !== null && (typeof b.contact_id !== 'string' || !UUID.test(b.contact_id))) {
      return { ok: false, error: 'invalid' }
    }
    out.contact_id = (b.contact_id as string | null) ?? null
  }
  if (b.customer_name !== undefined || !partial) {
    const name = text(b.customer_name, 200)
    if (!name) return { ok: false, error: 'customerRequired' }
    out.customer_name = name
  }
  if (b.customer_phone !== undefined) out.customer_phone = text(b.customer_phone, 40)
  if (b.customer_address !== undefined) out.customer_address = text(b.customer_address, 500)
  if (b.customer_gstin !== undefined) {
    const g = text(b.customer_gstin, 15)?.toUpperCase() ?? null
    if (g && !GSTIN.test(g)) return { ok: false, error: 'gstinInvalid' }
    out.customer_gstin = g
  }
  if (b.place_of_supply !== undefined) {
    const s = text(b.place_of_supply, 2)
    if (s && !STATE.test(s)) return { ok: false, error: 'invalid' }
    out.place_of_supply = s
  }
  if (b.issue_date !== undefined || !partial) {
    const d = typeof b.issue_date === 'string' ? b.issue_date : ''
    if (!validDate(d)) return { ok: false, error: 'dateInvalid' }
    out.issue_date = d
  }
  if (b.due_date !== undefined) {
    if (b.due_date === null || b.due_date === '') out.due_date = null
    else if (typeof b.due_date !== 'string' || !validDate(b.due_date)) return { ok: false, error: 'dateInvalid' }
    else out.due_date = b.due_date
  }
  if (out.issue_date && out.due_date && out.due_date < out.issue_date) return { ok: false, error: 'dueBeforeIssue' }

  if (b.items !== undefined || !partial) {
    if (!Array.isArray(b.items) || b.items.length === 0) return { ok: false, error: 'itemsRequired' }
    if (b.items.length > 100) return { ok: false, error: 'tooManyItems' }
    const items: InvoiceItem[] = []
    for (const raw of b.items) {
      if (!raw || typeof raw !== 'object') return { ok: false, error: 'itemInvalid' }
      const r = raw as Record<string, unknown>
      const description = text(r.description, 300)
      const qty = Number(r.qty)
      const rate = Number(r.rate)
      const gst = Number(r.gst_rate)
      if (!description) return { ok: false, error: 'itemInvalid' }
      if (!Number.isFinite(qty) || qty <= 0 || qty > 1_000_000) return { ok: false, error: 'itemInvalid' }
      if (!Number.isFinite(rate) || rate < 0 || rate > 100_000_000) return { ok: false, error: 'itemInvalid' }
      if (!(GST_RATES as readonly number[]).includes(gst)) return { ok: false, error: 'gstRateInvalid' }
      const hsn = text(r.hsn, 12)
      items.push({ description, ...(hsn ? { hsn } : {}), qty: Math.round(qty * 1000) / 1000, rate: Math.round(rate * 100) / 100, gst_rate: gst })
    }
    out.items = items
  }
  if (b.discount !== undefined) {
    const d = Number(b.discount)
    if (!Number.isFinite(d) || d < 0) return { ok: false, error: 'itemInvalid' }
    out.discount = Math.round(d * 100) / 100
  }
  if (b.notes !== undefined) out.notes = text(b.notes, 1000)
  if (b.terms !== undefined) out.terms = text(b.terms, 1000)
  return { ok: true, value: out }
}

export interface InvoiceSettingsInput {
  business_name: string | null
  gstin: string | null
  address: string | null
  state_code: string | null
  phone: string | null
  email: string | null
  upi_id: string | null
  bank_details: string | null
  invoice_prefix: string
  estimate_prefix: string
  default_terms: string | null
  reminder_template_name: string | null
  reminder_template_language: string
  reminder_variables: string[]
  reminders_enabled: boolean
}

export function parseInvoiceSettings(body: unknown): ParseResult<InvoiceSettingsInput> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'invalid' }
  const b = body as Record<string, unknown>
  const gstin = text(b.gstin, 15)?.toUpperCase() ?? null
  if (gstin && !GSTIN.test(gstin)) return { ok: false, error: 'gstinInvalid' }
  const state = text(b.state_code, 2)
  if (state && !STATE.test(state)) return { ok: false, error: 'invalid' }
  const upi = text(b.upi_id, 320)
  if (upi && !/^[A-Za-z0-9._-]{2,256}@[A-Za-z0-9.-]{2,64}$/.test(upi)) return { ok: false, error: 'upiInvalid' }
  const prefix = (v: unknown, d: string) => {
    const p = typeof v === 'string' ? v.trim().slice(0, 12) : d
    return /^[A-Za-z0-9/_-]*$/.test(p) ? p : d
  }
  const tpl = text(b.reminder_template_name, 512)
  const vars = Array.isArray(b.reminder_variables)
    ? b.reminder_variables.slice(0, 10).map((v) => (typeof v === 'string' ? v.slice(0, 200) : ''))
    : []
  if (tpl && vars.some((v) => !v.trim())) return { ok: false, error: 'variableRequired' }
  return {
    ok: true,
    value: {
      business_name: text(b.business_name, 200),
      gstin,
      address: text(b.address, 500),
      state_code: state ?? (gstin ? gstin.slice(0, 2) : null),
      phone: text(b.phone, 40),
      email: text(b.email, 200),
      upi_id: upi,
      bank_details: text(b.bank_details, 500),
      invoice_prefix: prefix(b.invoice_prefix, 'INV-'),
      estimate_prefix: prefix(b.estimate_prefix, 'EST-'),
      default_terms: text(b.default_terms, 1000),
      reminder_template_name: tpl,
      reminder_template_language:
        typeof b.reminder_template_language === 'string' && /^[a-zA-Z]{2,3}(_[a-zA-Z]{2,4})?$/.test(b.reminder_template_language)
          ? b.reminder_template_language
          : 'en_US',
      reminder_variables: vars,
      reminders_enabled: b.reminders_enabled !== false,
    },
  }
}

/** Record a payment: positive rupees, at most the balance (+1 paisa slack). */
export function parsePayment(v: unknown, balance: number): ParseResult<number> {
  const n = Math.round(Number(v) * 100) / 100
  if (!Number.isFinite(n) || n <= 0) return { ok: false, error: 'paymentInvalid' }
  if (n > balance + 0.01) return { ok: false, error: 'paymentTooMuch' }
  return { ok: true, value: n }
}
