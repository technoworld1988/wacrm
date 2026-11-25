import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { parseAppointmentInput } from '@/lib/appointments/input'
import { getT } from '@/lib/i18n/translate'

const t = getT('Api')

// Book an appointment (agent+). Reads go through RLS on the client.
export async function POST(request: Request) {
  let ctx
  try {
    ctx = await requireRole('agent')
  } catch (err) {
    return toErrorResponse(err)
  }
  const parsed = parseAppointmentInput(await request.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: t(`appointments.${parsed.error}`) }, { status: 400 })

  const db = supabaseAdmin()
  const { data: contact } = await db
    .from('contacts')
    .select('id')
    .eq('id', parsed.value.contact_id!)
    .eq('account_id', ctx.accountId)
    .maybeSingle()
  if (!contact) return NextResponse.json({ error: t('appointments.contactRequired') }, { status: 400 })

  const { status: _ignored, ...fields } = parsed.value
  void _ignored
  const { data, error } = await db
    .from('appointments')
    .insert({ ...fields, account_id: ctx.accountId, created_by: ctx.userId, status: 'scheduled' })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ appointment: data }, { status: 201 })
}
