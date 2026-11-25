import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { isUuid } from '@/lib/api/v1/pagination'
import { getT } from '@/lib/i18n/translate'

const t = getT('Api')

// Stop a running follow-up (agent+). The row is kept for history.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let ctx
  try {
    ctx = await requireRole('agent')
  } catch (err) {
    return toErrorResponse(err)
  }
  if (!isUuid(id)) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
  const { data, error } = await supabaseAdmin()
    .from('followup_enrollments')
    .update({ status: 'stopped', next_run_at: null, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('account_id', ctx.accountId)
    .eq('status', 'active')
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data || data.length === 0) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
  return NextResponse.json({ ok: true })
}
