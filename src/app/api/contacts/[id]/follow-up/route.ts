import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { isUuid } from '@/lib/api/v1/pagination'
import { parseReminder } from '@/lib/followups/input'
import { getT } from '@/lib/i18n/translate'

const t = getT('Api')

// Set or clear a manual follow-up reminder on a contact (agent+).
// Body: { at: ISO string | null, note?: string }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let ctx
  try {
    ctx = await requireRole('agent')
  } catch (err) {
    return toErrorResponse(err)
  }
  if (!isUuid(id)) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
  const parsed = parseReminder(await request.json().catch(() => null))
  if (!parsed.ok) {
    return NextResponse.json({ error: t(`followUps.${parsed.error}`) }, { status: 400 })
  }
  const { data, error } = await supabaseAdmin()
    .from('contacts')
    .update({ next_follow_up_at: parsed.value.at, follow_up_note: parsed.value.note })
    .eq('id', id)
    .eq('account_id', ctx.accountId)
    .select('id, next_follow_up_at, follow_up_note')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data || data.length === 0) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
  return NextResponse.json({ contact: data[0] })
}
