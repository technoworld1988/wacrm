// ============================================================
// Follow-up engine — enrolls contacts, sends due steps from the
// per-minute cron, and stops a run when the contact replies.
//
// Server-only: uses the service-role client. Every query is keyed on
// account_id so one tenant can never touch another's rows.
// ============================================================

import { supabaseAdmin } from '@/lib/automations/admin-client'
import { engineSendTemplate } from '@/lib/automations/meta-send'
import { resolveAuditUserId } from '@/lib/api/v1/contacts'
import { findOrCreateConversationRow } from '@/lib/whatsapp/resolve-conversation'
import { nextRunAt, renderVariable, toVariableList } from './schedule'

export interface FollowUpStepRow {
  id: string
  sequence_id: string
  position: number
  delay_days: number
  template_name: string
  template_language: string
  variables: unknown
}

export type EnrollResult =
  | { ok: true; enrollmentId: string }
  | { ok: false; reason: 'sequence_not_found' | 'sequence_empty' | 'already_running' | 'contact_not_found' | 'db_error'; message?: string }

async function loadSteps(sequenceId: string): Promise<FollowUpStepRow[]> {
  const { data } = await supabaseAdmin()
    .from('followup_steps')
    .select('*')
    .eq('sequence_id', sequenceId)
    .order('position', { ascending: true })
  return (data ?? []) as FollowUpStepRow[]
}

/** Start `sequenceId` for one contact. The first step's delay counts from now. */
export async function enrollContact(args: {
  accountId: string
  sequenceId: string
  contactId: string
  enrolledBy?: string | null
  now?: Date
}): Promise<EnrollResult> {
  const db = supabaseAdmin()
  const now = args.now ?? new Date()

  const { data: seq } = await db
    .from('followup_sequences')
    .select('id, is_active')
    .eq('id', args.sequenceId)
    .eq('account_id', args.accountId)
    .maybeSingle()
  if (!seq || !seq.is_active) return { ok: false, reason: 'sequence_not_found' }

  const { data: contact } = await db
    .from('contacts')
    .select('id')
    .eq('id', args.contactId)
    .eq('account_id', args.accountId)
    .maybeSingle()
  if (!contact) return { ok: false, reason: 'contact_not_found' }

  const steps = await loadSteps(args.sequenceId)
  if (steps.length === 0) return { ok: false, reason: 'sequence_empty' }

  const { data, error } = await db
    .from('followup_enrollments')
    .insert({
      account_id: args.accountId,
      sequence_id: args.sequenceId,
      contact_id: args.contactId,
      status: 'active',
      next_step: 0,
      next_run_at: nextRunAt(now, steps[0].delay_days).toISOString(),
      enrolled_by: args.enrolledBy ?? null,
    })
    .select('id')
    .single()
  if (error || !data) {
    // Unique index: one running sequence per contact.
    if (error?.code === '23505') return { ok: false, reason: 'already_running' }
    return { ok: false, reason: 'db_error', message: error?.message }
  }
  return { ok: true, enrollmentId: data.id as string }
}

/**
 * The contact wrote back — stop every running follow-up for them.
 * Called from the inbound webhook; never throws.
 */
export async function markFollowUpsReplied(accountId: string, contactId: string): Promise<number> {
  try {
    const now = new Date().toISOString()
    const { data } = await supabaseAdmin()
      .from('followup_enrollments')
      .update({ status: 'replied', replied_at: now, next_run_at: null, updated_at: now })
      .eq('account_id', accountId)
      .eq('contact_id', contactId)
      .eq('status', 'active')
      .select('id')
    return data?.length ?? 0
  } catch (err) {
    console.error('[followups] mark replied failed:', err)
    return 0
  }
}

/**
 * A brand-new contact messaged in — enroll them in the account's
 * auto-enroll sequence, if one is switched on. The reply that created
 * the contact is already in, so the first step is scheduled by its own
 * delay (typically a day later). Never throws.
 */
export async function autoEnrollNewContact(accountId: string, contactId: string): Promise<void> {
  try {
    const { data: seq } = await supabaseAdmin()
      .from('followup_sequences')
      .select('id')
      .eq('account_id', accountId)
      .eq('is_active', true)
      .eq('auto_enroll_new_contacts', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (!seq) return
    await enrollContact({ accountId, sequenceId: seq.id as string, contactId })
  } catch (err) {
    console.error('[followups] auto-enroll failed:', err)
  }
}

const CLAIM_STALE_MS = 10 * 60 * 1000

/** Send every due step (oldest first). Returns how many were processed. */
export async function processDueFollowUps(limit = 30, now: Date = new Date()): Promise<number> {
  const db = supabaseAdmin()
  const staleBefore = new Date(now.getTime() - CLAIM_STALE_MS).toISOString()
  const { data: due, error } = await db
    .from('followup_enrollments')
    .select('id, account_id, sequence_id, contact_id, next_step, claimed_at')
    .eq('status', 'active')
    .lte('next_run_at', now.toISOString())
    .or(`claimed_at.is.null,claimed_at.lt.${staleBefore}`)
    .order('next_run_at', { ascending: true })
    .limit(limit)
  if (error || !due) return 0

  // The public demo account's sample follow-ups are for show only.
  const { data: demoAccounts } = await db.from('accounts').select('id').eq('is_demo', true)
  const demoIds = new Set((demoAccounts ?? []).map((a) => a.id as string))

  let processed = 0
  for (const row of due) {
    if (demoIds.has(row.account_id as string)) continue
    // Claim: only one cron invocation may send this step.
    const claimQuery = db
      .from('followup_enrollments')
      .update({ claimed_at: now.toISOString() })
      .eq('id', row.id)
      .eq('status', 'active')
      .eq('next_step', row.next_step)
    const { data: claimed } = await (row.claimed_at
      ? claimQuery.eq('claimed_at', row.claimed_at)
      : claimQuery.is('claimed_at', null)
    ).select('id')
    if (!claimed || claimed.length === 0) continue

    await sendStep({
      id: row.id as string,
      account_id: row.account_id as string,
      sequence_id: row.sequence_id as string,
      contact_id: row.contact_id as string,
      next_step: row.next_step as number,
    }, now)
    processed++
  }
  return processed
}

async function sendStep(
  row: { id: string; account_id: string; sequence_id: string; contact_id: string; next_step: number },
  now: Date,
): Promise<void> {
  const db = supabaseAdmin()
  const finish = (patch: Record<string, unknown>) =>
    db
      .from('followup_enrollments')
      .update({ ...patch, claimed_at: null, updated_at: new Date().toISOString() })
      .eq('id', row.id)

  try {
    const { data: seq } = await db
      .from('followup_sequences')
      .select('id, user_id, is_active')
      .eq('id', row.sequence_id)
      .eq('account_id', row.account_id)
      .maybeSingle()
    if (!seq || !seq.is_active) {
      await finish({ status: 'stopped', next_run_at: null, last_error: 'Sequence was switched off' })
      return
    }

    const steps = await loadSteps(row.sequence_id)
    const step = steps[row.next_step]
    if (!step) {
      await finish({ status: 'completed', next_run_at: null })
      return
    }

    const { data: contact } = await db
      .from('contacts')
      .select('id, name, phone')
      .eq('id', row.contact_id)
      .eq('account_id', row.account_id)
      .maybeSingle()
    if (!contact) {
      await finish({ status: 'stopped', next_run_at: null, last_error: 'Contact was deleted' })
      return
    }

    const ownerUserId = await resolveAuditUserId(db, row.account_id)
    const conversation = await findOrCreateConversationRow(db, row.account_id, row.contact_id, ownerUserId)
    const params = toVariableList(step.variables).map((v) => renderVariable(v, contact))

    await engineSendTemplate({
      accountId: row.account_id,
      userId: (seq.user_id as string | null) ?? ownerUserId,
      conversationId: conversation.id,
      contactId: row.contact_id,
      templateName: step.template_name,
      language: step.template_language,
      params,
    })

    const following = steps[row.next_step + 1]
    await finish(
      following
        ? {
            next_step: row.next_step + 1,
            next_run_at: nextRunAt(now, following.delay_days).toISOString(),
            last_sent_at: now.toISOString(),
            last_error: null,
          }
        : {
            next_step: row.next_step + 1,
            status: 'completed',
            next_run_at: null,
            last_sent_at: now.toISOString(),
            last_error: null,
          },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[followups] send failed:', { enrollment: row.id, message })
    await finish({ status: 'failed', next_run_at: null, last_error: message.slice(0, 500) })
  }
}
