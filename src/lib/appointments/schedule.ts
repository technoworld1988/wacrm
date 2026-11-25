// ============================================================
// Appointment reminder timing + text helpers — pure, unit-tested.
//
// Two reminders per appointment, both optional:
//   • day before: from 10:00 India time on the previous day, sent
//     between 09:00 and 20:00, and only while the appointment is still
//     at least 3 hours away (later than that the "hours before" one
//     covers it);
//   • N hours before: from starts_at − N hours until the start, never
//     before 07:00 India time.
// ============================================================

const IST_OFFSET_MIN = 330
const HOUR = 60 * 60 * 1000
export const TIME_ZONE = 'Asia/Kolkata'

function istParts(d: Date): { y: number; m: number; day: number; minutes: number } {
  const s = new Date(d.getTime() + IST_OFFSET_MIN * 60_000)
  return {
    y: s.getUTCFullYear(),
    m: s.getUTCMonth(),
    day: s.getUTCDate(),
    minutes: s.getUTCHours() * 60 + s.getUTCMinutes(),
  }
}

/** 10:00 IST on the IST calendar day before `startsAt`. */
export function dayBeforeDueAt(startsAt: Date): Date {
  const p = istParts(startsAt)
  return new Date(Date.UTC(p.y, p.m, p.day - 1, 10, 0) - IST_OFFSET_MIN * 60_000)
}

export interface ReminderState {
  startsAt: Date
  dayBeforeSent: boolean
  hoursBeforeSent: boolean
}

export interface ReminderSettings {
  remindDayBefore: boolean
  remindHoursBefore: number | null
}

export type DueReminder = 'day_before' | 'hours_before' | null

/** Which reminder (if any) should go out at `now`. Hours-before wins when both are due. */
export function dueReminder(a: ReminderState, s: ReminderSettings, now: Date): DueReminder {
  const t = now.getTime()
  const start = a.startsAt.getTime()
  if (t >= start) return null
  const nowIst = istParts(now).minutes

  if (s.remindHoursBefore && !a.hoursBeforeSent) {
    const due = start - s.remindHoursBefore * HOUR
    if (t >= due && nowIst >= 7 * 60) return 'hours_before'
  }
  if (s.remindDayBefore && !a.dayBeforeSent) {
    const due = dayBeforeDueAt(a.startsAt).getTime()
    const inHours = nowIst >= 9 * 60 && nowIst < 20 * 60
    if (t >= due && inHours && start - t >= 3 * HOUR) return 'day_before'
  }
  return null
}

export interface AppointmentVars {
  name?: string | null
  phone?: string | null
  title: string
  location?: string | null
  startsAt: Date
}

/** "Fri, 28 Nov" and "11:00 am" in India time. */
export function formatAppointmentDate(d: Date): { date: string; time: string } {
  return {
    date: d.toLocaleDateString('en-IN', { timeZone: TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short' }),
    time: d.toLocaleTimeString('en-IN', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit', hour12: true }),
  }
}

/** Fill {{first_name}}, {{name}}, {{phone}}, {{date}}, {{time}}, {{title}}, {{location}}. */
export function renderAppointmentVariable(value: string, v: AppointmentVars): string {
  const raw = (v.name ?? '').trim()
  const looksLikePhone = /^\+?[\d\s-]{6,}$/.test(raw)
  const name = raw && !looksLikePhone ? raw : 'there'
  const first = name === 'there' ? 'there' : name.split(/\s+/)[0]
  const { date, time } = formatAppointmentDate(v.startsAt)
  return value
    .replace(/\{\{\s*first_name\s*\}\}/gi, first)
    .replace(/\{\{\s*name\s*\}\}/gi, name)
    .replace(/\{\{\s*phone\s*\}\}/gi, (v.phone ?? '').trim())
    .replace(/\{\{\s*date\s*\}\}/gi, date)
    .replace(/\{\{\s*time\s*\}\}/gi, time)
    .replace(/\{\{\s*title\s*\}\}/gi, v.title)
    .replace(/\{\{\s*location\s*\}\}/gi, (v.location ?? '').trim() || '-')
}

/**
 * Read a customer's answer to a reminder: a quick-reply tap
 * ("Confirm" / "Reschedule") or a typed 1 / 2 / yes / no.
 */
export function parseReminderReply(text: string | null | undefined): 'confirm' | 'reschedule' | null {
  const t = (text ?? '').trim().toLowerCase()
  if (!t || t.length > 40) return null
  if (/^(1|yes|y|ok|okay|confirm|confirmed|haan|ha|han|ji|done|sure|👍)\b/u.test(t) || t === '👍') return 'confirm'
  if (/^(2|no|reschedule|change|cancel|can't|cant|not)\b/.test(t)) return 'reschedule'
  return null
}
