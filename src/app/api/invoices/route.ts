import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { parseInvoiceInput } from '@/lib/invoices/input'
import { nextNumber, totalsFor } from '@/lib/invoices/engine'
import { getT } from '@/lib/i18n/translate'

const t = getT('Api')

// Create an estimate or invoice (agent+). Totals are always computed here.
export async function POST(request: Request) {
  let ctx
  try {
    ctx = await requireRole('agent')
  } catch (err) {
    return toErrorResponse(err)
  }
  const parsed = parseInvoiceInput(await request.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: t(`invoices.${parsed.error}`) }, { status: 400 })
  const v = parsed.value
  const db = supabaseAdmin()

  if (v.contact_id) {
    const { data: c } = await db.from('contacts').select('id').eq('id', v.contact_id).eq('account_id', ctx.accountId).maybeSingle()
    if (!c) return NextResponse.json({ error: t('invoices.invalid') }, { status: 400 })
  }
  try {
    const totals = await totalsFor(db, ctx.accountId, v.items!, v.discount ?? 0, v.place_of_supply)
    const number = await nextNumber(db, ctx.accountId, v.kind!)
    const { data: settings } = await db.from('invoice_settings').select('default_terms').eq('account_id', ctx.accountId).maybeSingle()
    const { data, error } = await db
      .from('invoices')
      .insert({
        ...v,
        ...totals,
        terms: v.terms ?? (settings?.default_terms as string | null) ?? null,
        number,
        status: 'draft',
        account_id: ctx.accountId,
        created_by: ctx.userId,
      })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ invoice: data }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'error' }, { status: 500 })
  }
}
