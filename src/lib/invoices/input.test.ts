import { describe, expect, it } from 'vitest'
import { parseInvoiceInput, parseInvoiceSettings, parsePayment } from './input'

const base = {
  kind: 'invoice',
  customer_name: ' Rahul Banerjee ',
  issue_date: '2026-11-26',
  due_date: '2026-12-10',
  items: [{ description: 'Wardrobe', qty: '2', rate: '60000', gst_rate: 18, hsn: '9403' }],
}

describe('parseInvoiceInput', () => {
  it('accepts a full invoice and coerces numbers', () => {
    const r = parseInvoiceInput(base)
    expect(r.ok && r.value).toMatchObject({
      kind: 'invoice', customer_name: 'Rahul Banerjee', due_date: '2026-12-10',
      items: [{ description: 'Wardrobe', hsn: '9403', qty: 2, rate: 60000, gst_rate: 18 }],
    })
  })
  it('rejects bad items, dates and GSTINs', () => {
    expect(parseInvoiceInput({ ...base, items: [] })).toEqual({ ok: false, error: 'itemsRequired' })
    expect(parseInvoiceInput({ ...base, items: [{ description: 'x', qty: 1, rate: 1, gst_rate: 7 }] })).toEqual({ ok: false, error: 'gstRateInvalid' })
    expect(parseInvoiceInput({ ...base, items: [{ description: '', qty: 1, rate: 1, gst_rate: 0 }] })).toEqual({ ok: false, error: 'itemInvalid' })
    expect(parseInvoiceInput({ ...base, issue_date: '2026-02-30' })).toEqual({ ok: false, error: 'dateInvalid' })
    expect(parseInvoiceInput({ ...base, due_date: '2026-11-01' })).toEqual({ ok: false, error: 'dueBeforeIssue' })
    expect(parseInvoiceInput({ ...base, customer_gstin: 'abc' })).toEqual({ ok: false, error: 'gstinInvalid' })
    expect(parseInvoiceInput({ ...base, kind: 'bill' })).toEqual({ ok: false, error: 'invalid' })
  })
  it('uppercases a valid GSTIN and allows partial updates', () => {
    const r = parseInvoiceInput({ ...base, customer_gstin: '19abcde1234f1z5' })
    expect(r.ok && r.value.customer_gstin).toBe('19ABCDE1234F1Z5')
    expect(parseInvoiceInput({ notes: 'Thanks' }, true)).toEqual({ ok: true, value: { notes: 'Thanks' } })
  })
})

describe('parseInvoiceSettings', () => {
  it('derives the state from the GSTIN and checks the UPI ID', () => {
    const r = parseInvoiceSettings({ business_name: 'Sharma Interiors', gstin: '19ABCDE1234F1Z5', upi_id: 'shop@okhdfcbank' })
    expect(r.ok && r.value).toMatchObject({ state_code: '19', upi_id: 'shop@okhdfcbank', invoice_prefix: 'INV-' })
    expect(parseInvoiceSettings({ upi_id: 'not a upi' })).toEqual({ ok: false, error: 'upiInvalid' })
    expect(parseInvoiceSettings({ reminder_template_name: 't', reminder_variables: [''] })).toEqual({ ok: false, error: 'variableRequired' })
  })
})

describe('parsePayment', () => {
  it('accepts up to the balance', () => {
    expect(parsePayment('500.005', 1000)).toEqual({ ok: true, value: 500.01 })
    expect(parsePayment(1000, 1000)).toEqual({ ok: true, value: 1000 })
    expect(parsePayment(1001, 1000)).toEqual({ ok: false, error: 'paymentTooMuch' })
    expect(parsePayment(0, 1000)).toEqual({ ok: false, error: 'paymentInvalid' })
  })
})
