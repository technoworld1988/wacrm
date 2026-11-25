import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { isUuid } from '@/lib/api/v1/pagination'
import { nextNumber } from '@/lib/invoices/engine'
import { istDate } from '@/lib/invoices/calc'
import { getT } from '@/lib/i18n/translate'

const t = getT('Api')

// Turn an estimate into a draft invoice (agent+). The estimate is marked accepted.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let ctx
  try {
    ctx = await requireRole('agent')
  } catch (err) {
    return toErrorResponse(err)
  }
  if (!isUuid(id)) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
  const db = supabaseAdmin()
  const { data: est } = await db.from('invoices').select('*').eq('id', id).eq('account_id', ctx.accountId).eq('kind', 'estimate').maybeSingle()
  if (!est) return NextResponse.json({ error: t('common.notFound') }, { status: 404 })

  const issue = istDate()
  const due = new Date(Date.parse(`${issue}T00:00:00Z`) + 15 * 86_400_000).toISOString().slice(0, 10)
  const number = await nextNumber(db, ctx.accountId, 'invoice')
  const { data, error } = await db
    .from('invoices')
    .insert({
      account_id: ctx.accountId,
      contact_id: est.contact_id,
      kind: 'invoice',
      number,
      status: 'draft',
      issue_date: issue,
      due_date: due,
      customer_name: est.customer_name,
      customer_phone: est.customer_phone,
      customer_gstin: est.customer_gstin,
      customer_address: est.customer_address,
      place_of_supply: est.place_of_supply,
      items: est.items,
      discount: est.discount,
      subtotal: est.subtotal,
      cgst: est.cgst,
      sgst: est.sgst,
      igst: est.igst,
      total: est.total,
      notes: est.notes,
      terms: est.terms,
      converted_from_id: est.id,
      created_by: ctx.userId,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await db.from('invoices').update({ status: 'accepted', updated_at: new Date().toISOString() }).eq('id', est.id)
  return NextResponse.json({ invoice: data }, { status: 201 })
}
