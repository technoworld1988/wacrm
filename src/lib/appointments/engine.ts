// ============================================================
// Appointment reminders — sent from the per-minute cron, and replies
// ("Confirm" / "Reschedule", 1 / 2) applied from the inbound webhook.
// Server-only (service role); every query is keyed on account_id.
// ============================================================

import { supabaseAdmin } from '@/lib/automations/admin-client'
import { engineSendTemplate } from '@/lib/automations/meta-send'
import { resolveAuditUserId } from '@/lib/api/v1/contacts'
import { findOrCreateConversationRow } from '@/lib/whatsapp/resolve-conversation'
import { toVariableList } from '@/lib/followups/schedule'
import { dueReminder, parseReminderReply, renderAppointmentVariable } from './schedule'

const CLAIM_STALE_MS = 10 * 60 * 1000
const LOOKAHEAD_MS = 40 * 60 * 60 * 1000

interface SettingsRow {
  account_id: string
  template_name: string | null
  template_language: string
  variables: unknown
  remind_day_before: boolean
  remind_hours_before: number | null
}

/** Send every reminder that's due. Returns how many went out (or failed). */
export async function processDueAppointmentReminders(now: Date = new Date(), limit = 30): Promise<number> {
  const db = supabaseAdmin()
  const staleBefore = new Date(now.getTime() - CLAIM_STALE_MS).toISOString()
  const { data: rows, error } = await db
    .from('appointments')
    .select('id, account_id, contact_id, title, location, starts_at, day_before_sent_at, hours_before_sent_at, claimed_at, created_by')
    .in('status', ['scheduled', 'confirmed'])
    .eq('reminders_enabled', true)
    .gt('starts_at', now.toISOString())
    .lte('starts_at', new Date(now.getTime() + LOOKAHEAD_MS).toISOString())
    .or(`claimed_at.is.null,claimed_at.lt.${staleBefore}`)
    .order('starts_at', { ascending: true })
    .limit(200)
  if (error || !rows || rows.length === 0) return 0

  const accountIds = [...new Set(rows.map((r) => r.account_id as string))]
  const [{ data: settingsRows }, { data: demoRows }] = await Promise.all([
    db.from('appointment_settings').select('*').in('account_id', accountIds),
    db.from('accounts').select('id').in('id', accountIds).eq('is_demo', true),
  ])
  const settings = new Map((settingsRows ?? []).map((s) => [s.account_id as string, s as SettingsRow]))
  const demo = new Set((demoRows ?? []).map((a) => a.id as string))

  let processed = 0
  for (const row of rows) {
    if (processed >= limit) break
    const accountId = row.account_id as string
    const s = settings.get(accountId)
    if (!s?.template_name || demo.has(accountId)) continue

    const which = dueReminder(
      {
        startsAt: new Date(row.starts_at as string),
        dayBeforeSent: Boolean(row.day_before_sent_at),
        hoursBeforeSent: Boolean(row.hours_before_sent_at),
      },
      { remindDayBefore: s.remind_day_before, remindHoursBefore: s.remind_hours_before },
      now,
    )
    if (!which) continue

    const claim = db.from('appointments').update({ claimed_at: now.toISOString() }).eq('id', row.id)
    const { data: claimed } = await (row.claimed_at
      ? claim.eq('claimed_at', row.claimed_at as string)
      : claim.is('claimed_at', null)
    ).select('id')
    if (!claimed || claimed.length === 0) continue

    // Mark both slots when the hours-before one goes out, so a late
    // day-before never follows it.
    const sentPatch =
      which === 'hours_before'
        ? { hours_before_sent_at: now.toISOString(), day_before_sent_at: row.day_before_sent_at ?? now.toISOString() }
        : { day_before_sent_at: now.toISOString() }

    try {
      const { data: contact } = await db
        .from('contacts')
        .select('id, name, phone')
        .eq('id', row.contact_id)
        .eq('account_id', accountId)
        .maybeSingle()
      if (!contact) throw new Error('Contact was deleted')

      const ownerUserId = await resolveAuditUserId(db, accountId)
      const conversation = await findOrCreateConversationRow(db, accountId, row.contact_id as string, ownerUserId)
      const vars = {
        name: contact.name as string | null,
        phone: contact.phone as string | null,
        title: row.title as string,
        location: row.location as string | null,
        startsAt: new Date(row.starts_at as string),
      }
      await engineSendTemplate({
        accountId,
        userId: (row.created_by as string | null) ?? ownerUserId,
        conversationId: conversation.id,
        contactId: row.contact_id as string,
        templateName: s.template_name,
        language: s.template_language,
        params: toVariableList(s.variables).map((v) => renderAppointmentVariable(v, vars)),
      })
      await db
        .from('appointments')
        .update({ ...sentPatch, claimed_at: null, last_error: null, updated_at: new Date().toISOString() })
        .eq('id', row.id)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[appointments] reminder failed:', { appointment: row.id, message })
      // Count the slot as used so a broken template doesn't retry every minute.
      await db
        .from('appointments')
        .update({ ...sentPatch, claimed_at: null, last_error: message.slice(0, 500), updated_at: new Date().toISOString() })
        .eq('id', row.id)
    }
    processed++
  }
  return processed
}

/**
 * The contact wrote in. If it reads as an answer to a recent reminder
 * ("Confirm", "1", "Reschedule", "2"…), update the appointment.
 * Never throws.
 */
export async function applyAppointmentReply(accountId: string, contactId: string, text: string | null): Promise<void> {
  try {
    const answer = parseReminderReply(text)
    if (!answer) return
    const db = supabaseAdmin()
    const now = Date.now()
    const { data } = await db
      .from('appointments')
      .select('id, day_before_sent_at, hours_before_sent_at')
      .eq('account_id', accountId)
      .eq('contact_id', contactId)
      .in('status', ['scheduled', 'confirmed', 'reschedule_requested'])
      .gt('starts_at', new Date(now - 60 * 60 * 1000).toISOString())
      .order('starts_at', { ascending: true })
      .limit(3)
    // Only the appointment whose reminder went out in the last 2 days.
    const target = (data ?? []).find((a) => {
      const last = Math.max(
        a.day_before_sent_at ? Date.parse(a.day_before_sent_at as string) : 0,
        a.hours_before_sent_at ? Date.parse(a.hours_before_sent_at as string) : 0,
      )
      return last > 0 && now - last < 48 * 60 * 60 * 1000
    })
    if (!target) return
    await db
      .from('appointments')
      .update({
        status: answer === 'confirm' ? 'confirmed' : 'reschedule_requested',
        responded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', target.id)
      .eq('account_id', accountId)
  } catch (err) {
    console.error('[appointments] reply handling failed:', err)
  }
}
