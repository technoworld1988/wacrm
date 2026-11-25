import { describe, expect, it } from 'vitest'
import { amountInWords, computeTotals, inr, istDate, reminderDue, slotsPassed, taxByRate, upiLink } from './calc'

const items = [
  { description: 'Modular kitchen', qty: 1, rate: 150000, gst_rate: 18 },
  { description: 'Installation', qty: 2, rate: 5000, gst_rate: 18 },
  { description: 'Design fee', qty: 1, rate: 10000, gst_rate: 0 },
]

describe('computeTotals', () => {
  it('splits CGST/SGST for the same state', () => {
    const t = computeTotals(items, 0, '19', '19')
    expect(t).toMatchObject({ subtotal: 170000, taxable: 170000, cgst: 14400, sgst: 14400, igst: 0, total: 198800, intraState: true })
  })
  it('uses IGST across states', () => {
    const t = computeTotals(items, 0, '19', '27')
    expect(t).toMatchObject({ cgst: 0, sgst: 0, igst: 28800, total: 198800, intraState: false })
  })
  it('takes the discount off before tax', () => {
    const t = computeTotals([{ description: 'x', qty: 1, rate: 1000, gst_rate: 18 }], 100, '19', '19')
    expect(t).toMatchObject({ subtotal: 1000, discount: 100, taxable: 900, cgst: 81, sgst: 81, total: 1062 })
  })
  it('never lets the discount exceed the subtotal, and handles odd paise', () => {
    expect(computeTotals([{ description: 'x', qty: 3, rate: 33.33, gst_rate: 5 }], 0, null, null)).toMatchObject({
      subtotal: 99.99, cgst: 2.5, sgst: 2.5, total: 104.99,
    })
    expect(computeTotals([{ description: 'x', qty: 1, rate: 10, gst_rate: 18 }], 50, '19', '19').total).toBe(0)
  })
})

describe('taxByRate', () => {
  it('groups by GST rate', () => {
    expect(taxByRate(items, 0)).toEqual([
      { rate: 0, taxable: 10000, tax: 0 },
      { rate: 18, taxable: 160000, tax: 28800 },
    ])
  })
})

describe('amountInWords', () => {
  it('uses lakh and crore', () => {
    expect(amountInWords(198800)).toBe('Rupees One Lakh Ninety Eight Thousand Eight Hundred Only')
    expect(amountInWords(12345678.5)).toBe('Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight and Fifty Paise Only')
    expect(amountInWords(0)).toBe('Rupees Zero Only')
    expect(amountInWords(0.75)).toBe('Rupees Zero and Seventy Five Paise Only')
  })
})

describe('inr / upiLink', () => {
  it('formats with Indian grouping', () => {
    expect(inr(198800)).toBe('₹1,98,800.00')
  })
  it('builds a UPI link', () => {
    expect(upiLink('shop@okhdfcbank', 'Sharma Interiors', 1062, 'INV-0001')).toBe(
      'upi://pay?pa=shop%40okhdfcbank&pn=Sharma+Interiors&am=1062.00&cu=INR&tn=INV-0001',
    )
  })
})

describe('payment reminders', () => {
  it('first reminder 2 days before due, then on the day, +3, +7', () => {
    expect(reminderDue('2026-12-10', 0, '2026-12-07', null)).toBe(false)
    expect(reminderDue('2026-12-10', 0, '2026-12-08', null)).toBe(true)
    expect(reminderDue('2026-12-10', 1, '2026-12-09', '2026-12-08')).toBe(false)
    expect(reminderDue('2026-12-10', 1, '2026-12-10', '2026-12-08')).toBe(true)
    expect(reminderDue('2026-12-10', 2, '2026-12-13', '2026-12-10')).toBe(true)
    expect(reminderDue('2026-12-10', 3, '2026-12-17', '2026-12-13')).toBe(true)
    expect(reminderDue('2026-12-10', 4, '2026-12-30', '2026-12-17')).toBe(false)
  })
  it('only one reminder per day, none without a due date', () => {
    expect(reminderDue('2026-12-10', 1, '2026-12-10', '2026-12-10')).toBe(false)
    expect(reminderDue(null, 0, '2026-12-10', null)).toBe(false)
  })
  it('counts passed slots so a late invoice does not send a burst', () => {
    expect(slotsPassed('2026-12-10', '2026-12-14')).toBe(3)
    expect(slotsPassed('2026-12-10', '2026-12-01')).toBe(0)
  })
  it('istDate uses India time', () => {
    expect(istDate(new Date('2026-11-25T19:00:00Z'))).toBe('2026-11-26')
  })
})
