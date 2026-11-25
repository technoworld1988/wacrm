import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { isUuid } from '@/lib/api/v1/pagination'
import { parseAppointmentInput } from '@/lib/appointments/input'
import { getT } from '@/lib/i18n/translate'

const t = getT('Api')

function notFound() {
  return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
}

// Edit, reschedule or change the status of an appointment (agent+).
// Moving the time resets the reminders so they go out for the new slot.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let ctx
  try {
    ctx = await requireRole('agent')
  } catch (err) {
    return toErrorResponse(err)
  }
  if (!isUuid(id)) return notFound()
  const parsed = parseAppointmentInput(await request.json().catch(() => null), true)
  if (!parsed.ok) return NextResponse.json({ error: t(`appointments.${parsed.error}`) }, { status: 400 })

  const db = supabaseAdmin()
  const { data: existing } = await db
    .from('appointments')
    .select('id, starts_at')
    .eq('id', id)
    .eq('account_id', ctx.accountId)
    .maybeSingle()
  if (!existing) return notFound()

  const patch: Record<string, unknown> = { ...parsed.value, updated_at: new Date().toISOString() }
  if (parsed.value.contact_id) {
    const { data: contact } = await db
      .from('contacts')
      .select('id')
      .eq('id', parsed.value.contact_id)
      .eq('account_id', ctx.accountId)
      .maybeSingle()
    if (!contact) return NextResponse.json({ error: t('appointments.contactRequired') }, { status: 400 })
  }
  if (parsed.value.starts_at && Date.parse(parsed.value.starts_at) !== Date.parse(existing.starts_at as string)) {
    Object.assign(patch, {
      day_before_sent_at: null,
      hours_before_sent_at: null,
      last_error: null,
      responded_at: null,
      status: parsed.value.status ?? 'scheduled',
    })
  }
  const { data, error } = await db
    .from('appointments')
    .update(patch)
    .eq('id', id)
    .eq('account_id', ctx.accountId)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ appointment: data })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let ctx
  try {
    ctx = await requireRole('agent')
  } catch (err) {
    return toErrorResponse(err)
  }
  if (!isUuid(id)) return notFound()
  const { data, error } = await supabaseAdmin()
    .from('appointments')
    .delete()
    .eq('id', id)
    .eq('account_id', ctx.accountId)
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return notFound()
  return NextResponse.json({ ok: true })
}
