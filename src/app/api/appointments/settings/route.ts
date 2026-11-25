import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { parseSettingsInput } from '@/lib/appointments/input'
import { getT } from '@/lib/i18n/translate'

const t = getT('Api')

// Reminder template + timing for the account (admin+).
export async function PUT(request: Request) {
  let ctx
  try {
    ctx = await requireRole('admin')
  } catch (err) {
    return toErrorResponse(err)
  }
  const parsed = parseSettingsInput(await request.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: t(`appointments.${parsed.error}`) }, { status: 400 })
  const { error } = await supabaseAdmin()
    .from('appointment_settings')
    .upsert({ ...parsed.value, account_id: ctx.accountId, updated_at: new Date().toISOString() })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
