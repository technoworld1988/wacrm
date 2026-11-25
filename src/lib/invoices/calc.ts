// ============================================================
// Invoice maths for Indian GST — pure, unit-tested.
//
// Each line: taxable = qty × rate; GST = taxable × gst% (rounded to
// paise per line). A discount comes off the taxable total before tax,
// spread across lines in proportion. Same state for seller and place of
// supply → CGST + SGST (half each); different state → IGST.
// ============================================================

export const GST_RATES = [0, 0.25, 3, 5, 12, 18, 28] as const

export interface InvoiceItem {
  description: string
  hsn?: string
  qty: number
  rate: number
  gst_rate: number
}

export interface Totals {
  subtotal: number
  discount: number
  taxable: number
  cgst: number
  sgst: number
  igst: number
  total: number
  /** true when CGST+SGST apply (same state), false for IGST */
  intraState: boolean
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function lineAmount(item: InvoiceItem): number {
  return round2((Number(item.qty) || 0) * (Number(item.rate) || 0))
}

/**
 * Totals for a document. `sellerState` and `placeOfSupply` are 2-digit GST
 * state codes; when either is missing the sale is treated as intra-state.
 */
export function computeTotals(
  items: InvoiceItem[],
  discount: number,
  sellerState: string | null | undefined,
  placeOfSupply: string | null | undefined,
): Totals {
  const subtotal = round2(items.reduce((s, i) => s + lineAmount(i), 0))
  const disc = Math.min(Math.max(round2(Number(discount) || 0), 0), subtotal)
  const ratio = subtotal > 0 ? (subtotal - disc) / subtotal : 0
  let tax = 0
  for (const i of items) tax += round2(lineAmount(i) * ratio * ((Number(i.gst_rate) || 0) / 100))
  tax = round2(tax)
  const intraState = !sellerState || !placeOfSupply || sellerState === placeOfSupply
  const half = round2(tax / 2)
  const cgst = intraState ? half : 0
  const sgst = intraState ? round2(tax - half) : 0
  const igst = intraState ? 0 : tax
  const taxable = round2(subtotal - disc)
  return { subtotal, discount: disc, taxable, cgst, sgst, igst, total: round2(taxable + tax), intraState }
}

/** Tax per GST rate, for the summary table on the invoice. */
export function taxByRate(items: InvoiceItem[], discount: number): { rate: number; taxable: number; tax: number }[] {
  const subtotal = items.reduce((s, i) => s + lineAmount(i), 0)
  const ratio = subtotal > 0 ? (subtotal - Math.min(discount, subtotal)) / subtotal : 0
  const map = new Map<number, { taxable: number; tax: number }>()
  for (const i of items) {
    const taxable = lineAmount(i) * ratio
    const cur = map.get(i.gst_rate) ?? { taxable: 0, tax: 0 }
    cur.taxable += taxable
    cur.tax += round2(taxable * (i.gst_rate / 100))
    map.set(i.gst_rate, cur)
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rate, v]) => ({ rate, taxable: round2(v.taxable), tax: round2(v.tax) }))
}

/** ₹1,23,456.50 — Indian digit grouping. */
export function inr(n: number): string {
  return `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function under1000(n: number): string {
  const parts: string[] = []
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} Hundred`)
    n %= 100
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : ''))
  } else if (n > 0) {
    parts.push(ONES[n])
  }
  return parts.join(' ')
}

/** "Rupees One Lakh Twenty Thousand and Fifty Paise Only" (Indian system). */
export function amountInWords(amount: number): string {
  const total = Math.round((Number(amount) || 0) * 100)
  let rupees = Math.floor(total / 100)
  const paise = total % 100
  if (rupees === 0 && paise === 0) return 'Rupees Zero Only'
  const parts: string[] = []
  const crore = Math.floor(rupees / 10_000_000)
  rupees %= 10_000_000
  const lakh = Math.floor(rupees / 100_000)
  rupees %= 100_000
  const thousand = Math.floor(rupees / 1000)
  rupees %= 1000
  if (crore) parts.push(`${under1000(crore)} Crore`)
  if (lakh) parts.push(`${under1000(lakh)} Lakh`)
  if (thousand) parts.push(`${under1000(thousand)} Thousand`)
  if (rupees) parts.push(under1000(rupees))
  let words = parts.length ? `Rupees ${parts.join(' ')}` : 'Rupees Zero'
  if (paise) words += ` and ${under1000(paise)} Paise`
  return `${words} Only`
}

/** upi://pay link (opens GPay / PhonePe / Paytm); amount in rupees. */
export function upiLink(upiId: string, payeeName: string, amount: number, note: string): string {
  const p = new URLSearchParams({
    pa: upiId,
    pn: payeeName.slice(0, 50),
    am: (Math.round(amount * 100) / 100).toFixed(2),
    cu: 'INR',
    tn: note.slice(0, 50),
  })
  return `upi://pay?${p.toString()}`
}

export const GST_STATES: [string, string][] = [
  ['01', 'Jammu and Kashmir'], ['02', 'Himachal Pradesh'], ['03', 'Punjab'], ['04', 'Chandigarh'],
  ['05', 'Uttarakhand'], ['06', 'Haryana'], ['07', 'Delhi'], ['08', 'Rajasthan'], ['09', 'Uttar Pradesh'],
  ['10', 'Bihar'], ['11', 'Sikkim'], ['12', 'Arunachal Pradesh'], ['13', 'Nagaland'], ['14', 'Manipur'],
  ['15', 'Mizoram'], ['16', 'Tripura'], ['17', 'Meghalaya'], ['18', 'Assam'], ['19', 'West Bengal'],
  ['20', 'Jharkhand'], ['21', 'Odisha'], ['22', 'Chhattisgarh'], ['23', 'Madhya Pradesh'], ['24', 'Gujarat'],
  ['26', 'Dadra and Nagar Haveli and Daman and Diu'], ['27', 'Maharashtra'], ['29', 'Karnataka'], ['30', 'Goa'],
  ['31', 'Lakshadweep'], ['32', 'Kerala'], ['33', 'Tamil Nadu'], ['34', 'Puducherry'],
  ['35', 'Andaman and Nicobar Islands'], ['36', 'Telangana'], ['37', 'Andhra Pradesh'], ['38', 'Ladakh'],
  ['97', 'Other Territory'],
]

export function stateName(code: string | null | undefined): string {
  return GST_STATES.find(([c]) => c === code)?.[1] ?? ''
}

/**
 * Payment-reminder schedule for an unpaid invoice (dates as YYYY-MM-DD in
 * India time): 2 days before due, on the due date, then 3 and 7 days late.
 * Returns true when the next reminder (index = reminders already sent) is due.
 */
export const REMINDER_OFFSETS_DAYS = [-2, 0, 3, 7]

export function reminderDue(dueDate: string | null, remindersSent: number, todayIst: string, lastReminderDayIst: string | null): boolean {
  if (!dueDate || remindersSent >= REMINDER_OFFSETS_DAYS.length) return false
  if (lastReminderDayIst === todayIst) return false
  const due = Date.parse(`${dueDate}T00:00:00Z`)
  const today = Date.parse(`${todayIst}T00:00:00Z`)
  const daysFromDue = Math.round((today - due) / 86_400_000)
  // Skip slots that already passed (e.g. invoice created after its due date):
  // send the latest slot that has arrived, once.
  return daysFromDue >= REMINDER_OFFSETS_DAYS[remindersSent]
}

/** How many slots are already in the past — used to skip them after sending one. */
export function slotsPassed(dueDate: string, todayIst: string): number {
  const days = Math.round((Date.parse(`${todayIst}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / 86_400_000)
  return REMINDER_OFFSETS_DAYS.filter((o) => days >= o).length
}

/** YYYY-MM-DD for `d` in India time. */
export function istDate(d: Date = new Date()): string {
  return new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10)
}
