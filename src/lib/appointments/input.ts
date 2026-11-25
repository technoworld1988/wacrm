// Validate appointment + reminder-settings input from the API. Pure.

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

export const APPOINTMENT_STATUSES = [
  'scheduled', 'confirmed', 'reschedule_requested', 'cancelled', 'completed', 'no_show',
] as const
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number]

export interface AppointmentInput {
  contact_id?: string
  title?: string
  starts_at?: string
  duration_minutes?: number
  location?: string | null
  notes?: string | null
  reminders_enabled?: boolean
  status?: AppointmentStatus
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const YEAR_MS = 365 * 24 * 60 * 60 * 1000

/** `partial` = PATCH (every field optional). Error codes map to Api.appointments.* */
export function parseAppointmentInput(body: unknown, partial = false): ParseResult<AppointmentInput> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'invalid' }
  const b = body as Record<string, unknown>
  const out: AppointmentInput = {}

  if (b.contact_id !== undefined || !partial) {
    if (typeof b.contact_id !== 'string' || !UUID.test(b.contact_id)) return { ok: false, error: 'contactRequired' }
    out.contact_id = b.contact_id
  }
  if (b.title !== undefined || !partial) {
    const title = typeof b.title === 'string' ? b.title.trim() : ''
    if (!title || title.length > 120) return { ok: false, error: 'titleRequired' }
    out.title = title
  }
  if (b.starts_at !== undefined || !partial) {
    const d = typeof b.starts_at === 'string' ? new Date(b.starts_at) : new Date(NaN)
    if (Number.isNaN(d.getTime()) || Math.abs(d.getTime() - Date.now()) > 2 * YEAR_MS) {
      return { ok: false, error: 'timeInvalid' }
    }
    out.starts_at = d.toISOString()
  }
  if (b.duration_minutes !== undefined) {
    const n = Number(b.duration_minutes)
    if (!Number.isInteger(n) || n < 5 || n > 1440) return { ok: false, error: 'durationInvalid' }
    out.duration_minutes = n
  }
  for (const key of ['location', 'notes'] as const) {
    if (b[key] === undefined) continue
    const max = key === 'location' ? 200 : 1000
    out[key] = typeof b[key] === 'string' && (b[key] as string).trim() ? (b[key] as string).trim().slice(0, max) : null
  }
  if (b.reminders_enabled !== undefined) out.reminders_enabled = b.reminders_enabled === true
  if (b.status !== undefined) {
    if (!APPOINTMENT_STATUSES.includes(b.status as AppointmentStatus)) return { ok: false, error: 'statusInvalid' }
    out.status = b.status as AppointmentStatus
  }
  return { ok: true, value: out }
}

export interface ReminderSettingsInput {
  template_name: string | null
  template_language: string
  variables: string[]
  remind_day_before: boolean
  remind_hours_before: number | null
}

export function parseSettingsInput(body: unknown): ParseResult<ReminderSettingsInput> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'invalid' }
  const b = body as Record<string, unknown>
  const template_name = typeof b.template_name === 'string' && b.template_name.trim() ? b.template_name.trim().slice(0, 512) : null
  const template_language =
    typeof b.template_language === 'string' && /^[a-zA-Z]{2,3}(_[a-zA-Z]{2,4})?$/.test(b.template_language)
      ? b.template_language
      : 'en_US'
  const variables = Array.isArray(b.variables)
    ? b.variables.slice(0, 10).map((v) => (typeof v === 'string' ? v.slice(0, 200) : ''))
    : []
  if (template_name && variables.some((v) => !v.trim())) return { ok: false, error: 'variableRequired' }
  let hours: number | null = null
  if (b.remind_hours_before !== null && b.remind_hours_before !== undefined && b.remind_hours_before !== '') {
    const n = Number(b.remind_hours_before)
    if (!Number.isInteger(n) || n < 1 || n > 12) return { ok: false, error: 'hoursInvalid' }
    hours = n
  }
  return {
    ok: true,
    value: { template_name, template_language, variables, remind_day_before: b.remind_day_before !== false, remind_hours_before: hours },
  }
}
