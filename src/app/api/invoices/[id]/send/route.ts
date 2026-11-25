import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { isUuid } from '@/lib/api/v1/pagination'
import { appBaseUrl } from '@/lib/platform/admin'
import { sendInvoiceOnWhatsApp, type InvoiceRow } from '@/lib/invoices/engine'
import { getT } from '@/lib/i18n/translate'

const t = getT('Api')

// Send the document's link to the customer on WhatsApp (agent+).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let ctx
  try {
    ctx = await requireRole('agent')
  } catch (err) {
    return toErrorResponse(err)
  }
  if (!isUuid(id)) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
  const db = supabaseAdmin()
  const { data: inv } = await db.from('invoices').select('*').eq('id', id).eq('account_id', ctx.accountId).maybeSingle()
  if (!inv) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
  if (inv.status === 'cancelled') return NextResponse.json({ error: t('invoices.invalid') }, { status: 400 })

  const result = await sendInvoiceOnWhatsApp(inv as InvoiceRow, appBaseUrl(request), ctx.userId)
  if (!result.ok) {
    const key = result.reason === 'no_contact' ? 'noContact' : result.reason === 'window_closed' ? 'windowClosed' : 'sendFailed'
    return NextResponse.json({ error: t(`invoices.${key}`), detail: result.message }, { status: result.reason === 'failed' ? 502 : 409 })
  }
  if (inv.status === 'draft') {
    await db.from('invoices').update({ status: 'sent', updated_at: new Date().toISOString() }).eq('id', id).eq('account_id', ctx.accountId)
  }
  return NextResponse.json({ ok: true, via: result.via })
}
