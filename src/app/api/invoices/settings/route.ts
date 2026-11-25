import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { parseInvoiceSettings } from '@/lib/invoices/input'
import { getT } from '@/lib/i18n/translate'

const t = getT('Api')

// Business / GST details, numbering and payment-reminder template (admin+).
export async function PUT(request: Request) {
  let ctx
  try {
    ctx = await requireRole('admin')
  } catch (err) {
    return toErrorResponse(err)
  }
  const parsed = parseInvoiceSettings(await request.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: t(`invoices.${parsed.error}`) }, { status: 400 })
  const { error } = await supabaseAdmin()
    .from('invoice_settings')
    .upsert({ ...parsed.value, account_id: ctx.accountId, updated_at: new Date().toISOString() })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
