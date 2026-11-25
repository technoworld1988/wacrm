import { NextResponse } from 'next/server'
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { parseSequenceInput } from '@/lib/followups/input'
import { getT } from '@/lib/i18n/translate'

const t = getT('Api')

// Follow-up sequences. GET lists the account's sequences with their
// steps (RLS-scoped); POST creates one (admin, service role after the
// role check — same split as automations).

export async function GET() {
  try {
    const { supabase } = await getCurrentAccount()
    const { data, error } = await supabase
      .from('followup_sequences')
      .select('*, steps:followup_steps(*)')
      .order('created_at', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const sequences = (data ?? []).map((s) => ({
      ...s,
      steps: [...((s.steps as { position: number }[]) ?? [])].sort((a, b) => a.position - b.position),
    }))
    return NextResponse.json({ sequences })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  let ctx
  try {
    ctx = await requireRole('admin')
  } catch (err) {
    return toErrorResponse(err)
  }
  const parsed = parseSequenceInput(await request.json().catch(() => null))
  if (!parsed.ok) {
    return NextResponse.json({ error: t(`followUps.${parsed.error}`) }, { status: 400 })
  }
  const { steps, ...fields } = parsed.value
  const db = supabaseAdmin()

  // Only one sequence may auto-enroll new leads.
  if (fields.auto_enroll_new_contacts) {
    await db
      .from('followup_sequences')
      .update({ auto_enroll_new_contacts: false })
      .eq('account_id', ctx.accountId)
  }

  const { data: seq, error } = await db
    .from('followup_sequences')
    .insert({ ...fields, account_id: ctx.accountId, user_id: ctx.userId })
    .select()
    .single()
  if (error || !seq) return NextResponse.json({ error: error?.message }, { status: 500 })

  const { error: stepsErr } = await db
    .from('followup_steps')
    .insert(steps.map((s, i) => ({ ...s, sequence_id: seq.id, position: i })))
  if (stepsErr) {
    await db.from('followup_sequences').delete().eq('id', seq.id)
    return NextResponse.json({ error: stepsErr.message }, { status: 500 })
  }
  return NextResponse.json({ sequence: seq }, { status: 201 })
}
