// Validate follow-up sequence input from the API. Pure; unit-tested.

export interface SequenceStepInput {
  delay_days: number
  template_name: string
  template_language: string
  variables: string[]
}

export interface SequenceInput {
  name: string
  auto_enroll_new_contacts: boolean
  is_active: boolean
  steps: SequenceStepInput[]
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

export const MAX_STEPS = 10

/** Error codes map to Api.followUps.* messages. */
export function parseSequenceInput(body: unknown): ParseResult<SequenceInput> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'invalid' }
  const b = body as Record<string, unknown>

  const name = typeof b.name === 'string' ? b.name.trim() : ''
  if (!name || name.length > 80) return { ok: false, error: 'nameRequired' }

  if (!Array.isArray(b.steps) || b.steps.length === 0) return { ok: false, error: 'stepsRequired' }
  if (b.steps.length > MAX_STEPS) return { ok: false, error: 'tooManySteps' }

  const steps: SequenceStepInput[] = []
  for (const raw of b.steps) {
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'stepInvalid' }
    const s = raw as Record<string, unknown>
    const template_name = typeof s.template_name === 'string' ? s.template_name.trim() : ''
    if (!template_name) return { ok: false, error: 'templateRequired' }
    const delay = Number(s.delay_days)
    if (!Number.isInteger(delay) || delay < 0 || delay > 60) return { ok: false, error: 'delayInvalid' }
    const template_language =
      typeof s.template_language === 'string' && /^[a-zA-Z]{2,3}(_[a-zA-Z]{2,4})?$/.test(s.template_language)
        ? s.template_language
        : 'en_US'
    const variables = Array.isArray(s.variables)
      ? s.variables.slice(0, 10).map((v) => (typeof v === 'string' ? v.slice(0, 200) : ''))
      : []
    if (variables.some((v) => !v.trim())) return { ok: false, error: 'variableRequired' }
    steps.push({ delay_days: delay, template_name, template_language, variables })
  }

  return {
    ok: true,
    value: {
      name,
      auto_enroll_new_contacts: b.auto_enroll_new_contacts === true,
      is_active: b.is_active !== false,
      steps,
    },
  }
}

/** A reminder time must be a real date, within ~2 years. null clears it. */
export function parseReminder(body: unknown): ParseResult<{ at: string | null; note: string | null }> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'invalid' }
  const b = body as Record<string, unknown>
  const note = typeof b.note === 'string' && b.note.trim() ? b.note.trim().slice(0, 500) : null
  if (b.at === null) return { ok: true, value: { at: null, note: null } }
  if (typeof b.at !== 'string') return { ok: false, error: 'reminderInvalid' }
  const d = new Date(b.at)
  const twoYears = 2 * 365 * 24 * 60 * 60 * 1000
  if (Number.isNaN(d.getTime()) || Math.abs(d.getTime() - Date.now()) > twoYears) {
    return { ok: false, error: 'reminderInvalid' }
  }
  return { ok: true, value: { at: d.toISOString(), note } }
}
