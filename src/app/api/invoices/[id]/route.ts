import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { isUuid } from '@/lib/api/v1/pagination'
import { parseInvoiceInput, parsePayment } from '@/lib/invoices/input'
import { totalsFor } from '@/lib/invoices/engine'
import { getT } from '@/lib/i18n/translate'

const t = getT('Api')
const STATUS_CHANGES = new Set(['draft', 'sent', 'accepted', 'declined', 'cancelled'])

function notFound() {
  return NextResponse.json({ error: t('common.notFound') }, { status: 404 })
}

// Edit a document, change its status, or record a payment (agent+).
// Body: invoice fields, and/or { status }, and/or { payment: rupees }.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let ctx
  try {
    ctx = await requireRole('agent')
  } catch (err) {
    return toErrorResponse(err)
  }
  if (!isUuid(id)) return notFound()
  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>
  const db = supabaseAdmin()
  const { data: inv } = await db.from('invoices').select('*').eq('id', id).eq('account_id', ctx.accountId).maybeSingle()
  if (!inv) return notFound()
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = { updated_at: now }

  // Payment
  if (body.payment !== undefined) {
    if (inv.kind !== 'invoice' || inv.status === 'cancelled') return NextResponse.json({ error: t('invoices.paymentInvalid') }, { status: 400 })
    const balance = Number(inv.total) - Number(inv.amount_paid)
    const p = parsePayment(body.payment, balance)
    if (!p.ok) return NextResponse.json({ error: t(`invoices.${p.error}`) }, { status: 400 })
    const paid = Math.round((Number(inv.amount_paid) + p.value) * 100) / 100
    patch.amount_paid = paid
    patch.status = paid >= Number(inv.total) - 0.005 ? 'paid' : 'partially_paid'
    if (patch.status === 'paid') patch.paid_at = now
  }

  // Status change
  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !STATUS_CHANGES.has(body.status)) {
      return NextResponse.json({ error: t('invoices.invalid') }, { status: 400 })
    }
    if ((body.status === 'accepted' || body.status === 'declined') && inv.kind !== 'estimate') {
      return NextResponse.json({ error: t('invoices.invalid') }, { status: 400 })
    }
    patch.status = body.status
  }

  // Field edits (not once paid or cancelled)
  const fieldKeys = Object.keys(body).filter((k) => k !== 'payment' && k !== 'status')
  if (fieldKeys.length) {
    if (['paid', 'cancelled'].includes(inv.status as string) || Number(inv.amount_paid) > 0) {
      return NextResponse.json({ error: t('invoices.locked') }, { status: 409 })
    }
    const fields: Record<string, unknown> = {}
    for (const k of fieldKeys) fields[k] = body[k]
    const parsed = parseInvoiceInput(fields, true)
    if (!parsed.ok) return NextResponse.json({ error: t(`invoices.${parsed.error}`) }, { status: 400 })
    const { kind: _k, ...v } = parsed.value
    void _k
    if (v.contact_id) {
      const { data: c } = await db.from('contacts').select('id').eq('id', v.contact_id).eq('account_id', ctx.accountId).maybeSingle()
      if (!c) return NextResponse.json({ error: t('invoices.invalid') }, { status: 400 })
    }
    if (v.issue_date && v.due_date === undefined && inv.due_date && inv.due_date < v.issue_date) {
      return NextResponse.json({ error: t('invoices.dueBeforeIssue') }, { status: 400 })
    }
    Object.assign(patch, v)
    const totals = await totalsFor(
      db,
      ctx.accountId,
      v.items ?? (inv.items as never),
      v.discount ?? Number(inv.discount),
      v.place_of_supply !== undefined ? v.place_of_supply : (inv.place_of_supply as string | null),
    )
    Object.assign(patch, totals)
    // A changed due date restarts the reminder schedule.
    if (v.due_date !== undefined && v.due_date !== inv.due_date) Object.assign(patch, { reminder_count: 0, last_reminder_at: null })
  }

  const { data, error } = await db.from('invoices').update(patch).eq('id', id).eq('account_id', ctx.accountId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ invoice: data })
}

// Delete a draft (agent+). Sent documents are cancelled instead.
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
    .from('invoices')
    .delete()
    .eq('id', id)
    .eq('account_id', ctx.accountId)
    .eq('status', 'draft')
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: t('invoices.onlyDrafts') }, { status: 409 })
  return NextResponse.json({ ok: true })
}
