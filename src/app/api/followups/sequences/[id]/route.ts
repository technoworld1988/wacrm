import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { isUuid } from '@/lib/api/v1/pagination'
import { parseSequenceInput } from '@/lib/followups/input'
import { getT } from '@/lib/i18n/translate'

const t = getT('Api')

function notFound() {
  return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
}

// Replace a sequence (name, flags, all steps). Running enrollments keep
// their step number; if the sequence got shorter they simply complete
// on their next tick.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let ctx
  try {
    ctx = await requireRole('admin')
  } catch (err) {
    return toErrorResponse(err)
  }
  if (!isUuid(id)) return notFound()
  const parsed = parseSequenceInput(await request.json().catch(() => null))
  if (!parsed.ok) {
    return NextResponse.json({ error: t(`followUps.${parsed.error}`) }, { status: 400 })
  }
  const db = supabaseAdmin()
  const { data: existing } = await db
    .from('followup_sequences')
    .select('id')
    .eq('id', id)
    .eq('account_id', ctx.accountId)
    .maybeSingle()
  if (!existing) return notFound()

  const { steps, ...fields } = parsed.value
  if (fields.auto_enroll_new_contacts) {
    await db
      .from('followup_sequences')
      .update({ auto_enroll_new_contacts: false })
      .eq('account_id', ctx.accountId)
      .neq('id', id)
  }
  const { error } = await db
    .from('followup_sequences')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('account_id', ctx.accountId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await db.from('followup_steps').delete().eq('sequence_id', id)
  const { error: stepsErr } = await db
    .from('followup_steps')
    .insert(steps.map((s, i) => ({ ...s, sequence_id: id, position: i })))
  if (stepsErr) return NextResponse.json({ error: stepsErr.message }, { status: 500 })

  if (!fields.is_active) {
    // Switching a sequence off stops everyone still in it.
    await db
      .from('followup_enrollments')
      .update({ status: 'stopped', next_run_at: null, updated_at: new Date().toISOString() })
      .eq('sequence_id', id)
      .eq('account_id', ctx.accountId)
      .eq('status', 'active')
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let ctx
  try {
    ctx = await requireRole('admin')
  } catch (err) {
    return toErrorResponse(err)
  }
  if (!isUuid(id)) return notFound()
  const { data, error } = await supabaseAdmin()
    .from('followup_sequences')
    .delete()
    .eq('id', id)
    .eq('account_id', ctx.accountId)
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data || data.length === 0) return notFound()
  return NextResponse.json({ ok: true })
}
