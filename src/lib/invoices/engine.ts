// ============================================================
// Invoices — numbering, totals, sending on WhatsApp and automatic
// payment reminders. Server-only (service role); every query is keyed
// on account_id.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { engineSendTemplate, engineSendText } from '@/lib/automations/meta-send'
import { resolveAuditUserId } from '@/lib/api/v1/contacts'
import { findOrCreateConversationRow } from '@/lib/whatsapp/resolve-conversation'
import { toVariableList } from '@/lib/followups/schedule'
import { computeTotals, inr, istDate, reminderDue, slotsPassed, type InvoiceItem } from './calc'

export interface InvoiceRow {
  id: string
  account_id: string
  contact_id: string | null
  kind: 'estimate' | 'invoice'
  number: string
  status: string
  issue_date: string
  due_date: string | null
  customer_name: string
  customer_phone: string | null
  total: number
  amount_paid: number
  public_token: string
  reminder_count: number
  last_reminder_at: string | null
  claimed_at: string | null
  created_by: string | null
}

export interface InvoiceSettingsRow {
  account_id: string
  business_name: string | null
  state_code: string | null
  upi_id: string | null
  reminder_template_name: string | null
  reminder_template_language: string
  reminder_variables: unknown
  reminders_enabled: boolean
}

export function publicInvoiceUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/i/${token}`
}

/** Base URL for links in messages sent by the cron (no request to read it from). */
export function cronBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://wacrm-cyan-two.vercel.app').replace(/\/+$/, '')
}

export async function nextNumber(db: SupabaseClient, accountId: string, kind: 'estimate' | 'invoice'): Promise<string> {
  const { data, error } = await db.rpc('next_invoice_number', { p_account: accountId, p_kind: kind })
  if (error || typeof data !== 'string') throw new Error(error?.message ?? 'Could not number the document')
  return data
}

export async function totalsFor(
  db: SupabaseClient,
  accountId: string,
  items: InvoiceItem[],
  discount: number,
  placeOfSupply: string | null | undefined,
) {
  const { data } = await db.from('invoice_settings').select('state_code').eq('account_id', accountId).maybeSingle()
  const t = computeTotals(items, discount, (data?.state_code as string | null) ?? null, placeOfSupply ?? null)
  return { subtotal: t.subtotal, discount: t.discount, cgst: t.cgst, sgst: t.sgst, igst: t.igst, total: t.total }
}

/** {{first_name}} {{name}} {{number}} {{amount}} {{due_date}} {{upi}} {{link}} */
export function renderInvoiceVariable(
  value: string,
  inv: Pick<InvoiceRow, 'customer_name' | 'number' | 'total' | 'amount_paid' | 'due_date'>,
  upi: string | null,
  link: string,
): string {
  const name = (inv.customer_name || '').trim() || 'there'
  const balance = Math.max(0, Number(inv.total) - Number(inv.amount_paid))
  const due = inv.due_date
    ? new Date(`${inv.due_date}T12:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '-'
  return value
    .replace(/\{\{\s*first_name\s*\}\}/gi, name.split(/\s+/)[0])
    .replace(/\{\{\s*name\s*\}\}/gi, name)
    .replace(/\{\{\s*number\s*\}\}/gi, inv.number)
    .replace(/\{\{\s*amount\s*\}\}/gi, inr(balance))
    .replace(/\{\{\s*due_date\s*\}\}/gi, due)
    .replace(/\{\{\s*upi\s*\}\}/gi, upi || '-')
    .replace(/\{\{\s*link\s*\}\}/gi, link)
}

export type SendResult = { ok: true; via: 'text' | 'template' } | { ok: false; reason: 'no_contact' | 'window_closed' | 'failed'; message?: string }

/**
 * Send the document's link on WhatsApp. Inside the 24-hour window a
 * normal text goes out; outside it, the account's payment-reminder
 * template (if set). Never throws.
 */
export async function sendInvoiceOnWhatsApp(inv: InvoiceRow, baseUrl: string, userId: string | null): Promise<SendResult> {
  const db = supabaseAdmin()
  try {
    if (!inv.contact_id) return { ok: false, reason: 'no_contact' }
    const { data: settings } = await db.from('invoice_settings').select('*').eq('account_id', inv.account_id).maybeSingle()
    const s = settings as InvoiceSettingsRow | null
    const owner = await resolveAuditUserId(db, inv.account_id)
    const conversation = await findOrCreateConversationRow(db, inv.account_id, inv.contact_id, owner)
    const { data: conv } = await db.from('conversations').select('last_inbound_at').eq('id', conversation.id).maybeSingle()
    const lastIn = conv?.last_inbound_at ? Date.parse(conv.last_inbound_at as string) : 0
    const windowOpen = lastIn > 0 && Date.now() - lastIn < 24 * 60 * 60 * 1000 - 2 * 60 * 1000
    const link = publicInvoiceUrl(baseUrl, inv.public_token)
    const sender = userId ?? inv.created_by ?? owner

    if (windowOpen) {
      const label = inv.kind === 'estimate' ? 'estimate' : 'invoice'
      const balance = Math.max(0, Number(inv.total) - Number(inv.amount_paid))
      const lines = [
        `Hi ${inv.customer_name.split(/\s+/)[0]}, here is your ${label} ${inv.number} for ${inr(inv.kind === 'invoice' ? balance : Number(inv.total))}.`,
        link,
      ]
      if (inv.kind === 'invoice' && s?.upi_id) lines.push(`Pay by UPI: ${s.upi_id}`)
      await engineSendText({ accountId: inv.account_id, userId: sender, conversationId: conversation.id, contactId: inv.contact_id, text: lines.join('\n') })
      return { ok: true, via: 'text' }
    }
    if (!s?.reminder_template_name) return { ok: false, reason: 'window_closed' }
    await engineSendTemplate({
      accountId: inv.account_id,
      userId: sender,
      conversationId: conversation.id,
      contactId: inv.contact_id,
      templateName: s.reminder_template_name,
      language: s.reminder_template_language,
      params: toVariableList(s.reminder_variables).map((v) => renderInvoiceVariable(v, inv, s.upi_id, link)),
    })
    return { ok: true, via: 'template' }
  } catch (err) {
    return { ok: false, reason: 'failed', message: err instanceof Error ? err.message : String(err) }
  }
}

const CLAIM_STALE_MS = 10 * 60 * 1000

/** Automatic payment reminders (2 days before due, on the day, +3, +7), 10 AM–7 PM IST. */
export async function processDuePaymentReminders(now: Date = new Date(), limit = 20): Promise<number> {
  const istHour = new Date(now.getTime() + 330 * 60_000).getUTCHours()
  if (istHour < 10 || istHour >= 19) return 0
  const db = supabaseAdmin()
  const today = istDate(now)
  const horizon = new Date(Date.parse(`${today}T00:00:00Z`) + 2 * 86_400_000).toISOString().slice(0, 10)
  const staleBefore = new Date(now.getTime() - CLAIM_STALE_MS).toISOString()
  const { data: rows } = await db
    .from('invoices')
    .select('*')
    .eq('kind', 'invoice')
    .in('status', ['sent', 'partially_paid'])
    .not('contact_id', 'is', null)
    .lte('due_date', horizon)
    .lt('reminder_count', 4)
    .or(`claimed_at.is.null,claimed_at.lt.${staleBefore}`)
    .order('due_date', { ascending: true })
    .limit(200)
  if (!rows?.length) return 0

  const accountIds = [...new Set(rows.map((r) => r.account_id as string))]
  const [{ data: settingsRows }, { data: demoRows }] = await Promise.all([
    db.from('invoice_settings').select('*').in('account_id', accountIds),
    db.from('accounts').select('id').in('id', accountIds).eq('is_demo', true),
  ])
  const settings = new Map((settingsRows ?? []).map((s) => [s.account_id as string, s as InvoiceSettingsRow]))
  const demo = new Set((demoRows ?? []).map((a) => a.id as string))

  let processed = 0
  for (const inv of rows as InvoiceRow[]) {
    if (processed >= limit) break
    const s = settings.get(inv.account_id)
    if (!s?.reminders_enabled || !s.reminder_template_name || demo.has(inv.account_id)) continue
    const lastDay = inv.last_reminder_at ? istDate(new Date(inv.last_reminder_at)) : null
    if (!reminderDue(inv.due_date, inv.reminder_count, today, lastDay)) continue

    const claim = db.from('invoices').update({ claimed_at: now.toISOString() }).eq('id', inv.id)
    const { data: claimed } = await (inv.claimed_at ? claim.eq('claimed_at', inv.claimed_at) : claim.is('claimed_at', null)).select('id')
    if (!claimed?.length) continue

    const result = await sendInvoiceOnWhatsApp(inv, cronBaseUrl(), null)
    await db
      .from('invoices')
      .update({
        claimed_at: null,
        last_reminder_at: now.toISOString(),
        // Skip slots that passed while nothing was sent, so no burst.
        reminder_count: Math.max(inv.reminder_count + 1, slotsPassed(inv.due_date!, today)),
        last_error: result.ok ? null : (result.message ?? result.reason).slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq('id', inv.id)
    processed++
  }
  return processed
}
