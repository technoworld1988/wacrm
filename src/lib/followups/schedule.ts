// ============================================================
// Follow-up scheduling helpers — pure, no I/O, unit-tested.
//
// Follow-ups go out in business hours (India time) so a lead isn't
// woken by a "just checking in" at 2 AM. A send that would land
// outside 09:00–20:00 IST is moved to 10:00 IST on the next
// suitable morning.
// ============================================================

const IST_OFFSET_MIN = 330 // UTC+05:30
const DAY_MS = 24 * 60 * 60 * 1000
export const SEND_START_HOUR = 9
export const SEND_END_HOUR = 20
export const MORNING_SEND_HOUR = 10

/** Minutes since midnight, India time, for `d`. */
function istMinutes(d: Date): number {
  const shifted = new Date(d.getTime() + IST_OFFSET_MIN * 60_000)
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes()
}

/** `d` moved to hh:00 IST on the same IST calendar day. */
function atIstHour(d: Date, hour: number): Date {
  const shifted = new Date(d.getTime() + IST_OFFSET_MIN * 60_000)
  shifted.setUTCHours(hour, 0, 0, 0)
  return new Date(shifted.getTime() - IST_OFFSET_MIN * 60_000)
}

/** Pull `d` into sending hours: unchanged if inside, else next 10:00 IST. */
export function intoSendingHours(d: Date): Date {
  const m = istMinutes(d)
  if (m >= SEND_START_HOUR * 60 && m < SEND_END_HOUR * 60) return d
  if (m < SEND_START_HOUR * 60) return atIstHour(d, MORNING_SEND_HOUR)
  return atIstHour(new Date(d.getTime() + DAY_MS), MORNING_SEND_HOUR)
}

/**
 * When the step after `from` should go out. A 0-day delay means "now"
 * (an agent enrolling someone expects the first message straight away);
 * any real delay is pulled into sending hours.
 */
export function nextRunAt(from: Date, delayDays: number): Date {
  if (delayDays <= 0) return from
  return intoSendingHours(new Date(from.getTime() + delayDays * DAY_MS))
}

/** End of today (23:59:59.999 IST) — the cut-off for the Today list. */
export function endOfTodayIst(now: Date = new Date()): Date {
  const shifted = new Date(now.getTime() + IST_OFFSET_MIN * 60_000)
  shifted.setUTCHours(23, 59, 59, 999)
  return new Date(shifted.getTime() - IST_OFFSET_MIN * 60_000)
}

export interface FollowUpContact {
  name?: string | null
  phone?: string | null
}

/** Fill {{name}}, {{first_name}} and {{phone}} in one template value. */
export function renderVariable(value: string, contact: FollowUpContact): string {
  const name = (contact.name ?? '').trim()
  const phone = (contact.phone ?? '').trim()
  // A contact saved only by number has its phone as its name — "Hi
  // +919876…" reads badly, so fall back to a friendly word.
  const looksLikePhone = /^\+?[\d\s-]{6,}$/.test(name)
  const display = name && !looksLikePhone ? name : 'there'
  const first = display === 'there' ? 'there' : display.split(/\s+/)[0]
  return value
    .replace(/\{\{\s*first_name\s*\}\}/gi, first)
    .replace(/\{\{\s*name\s*\}\}/gi, display)
    .replace(/\{\{\s*phone\s*\}\}/gi, phone)
}

/** Number of positional {{1}}, {{2}}, … placeholders in a template body. */
export function countPlaceholders(body: string | null | undefined): number {
  if (!body) return 0
  let max = 0
  for (const m of body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) {
    max = Math.max(max, Number(m[1]))
  }
  return max
}

/** Coerce stored JSON into a clean string list (max 10 values). */
export function toVariableList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, 10).map((v) => (typeof v === 'string' ? v.slice(0, 200) : ''))
}
