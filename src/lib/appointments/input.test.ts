import { describe, expect, it } from 'vitest'
import { parseAppointmentInput, parseSettingsInput } from './input'

const cid = '3f2b8c1e-4a5d-4e6f-8a9b-0c1d2e3f4a5b'
const soon = new Date(Date.now() + 86400000).toISOString()

describe('parseAppointmentInput', () => {
  it('accepts a full create', () => {
    const r = parseAppointmentInput({ contact_id: cid, title: ' Check-up ', starts_at: soon, duration_minutes: 45, location: ' ', notes: 'x' })
    expect(r).toEqual({ ok: true, value: { contact_id: cid, title: 'Check-up', starts_at: soon, duration_minutes: 45, location: null, notes: 'x' } })
  })
  it('requires contact, title and time on create', () => {
    expect(parseAppointmentInput({ title: 'a', starts_at: soon })).toEqual({ ok: false, error: 'contactRequired' })
    expect(parseAppointmentInput({ contact_id: cid, starts_at: soon })).toEqual({ ok: false, error: 'titleRequired' })
    expect(parseAppointmentInput({ contact_id: cid, title: 'a', starts_at: 'later' })).toEqual({ ok: false, error: 'timeInvalid' })
  })
  it('allows a partial update and checks status', () => {
    expect(parseAppointmentInput({ status: 'completed' }, true)).toEqual({ ok: true, value: { status: 'completed' } })
    expect(parseAppointmentInput({ status: 'gone' }, true)).toEqual({ ok: false, error: 'statusInvalid' })
    expect(parseAppointmentInput({ duration_minutes: 2 }, true)).toEqual({ ok: false, error: 'durationInvalid' })
  })
})

describe('parseSettingsInput', () => {
  it('accepts settings and cleans the language', () => {
    expect(parseSettingsInput({ template_name: 'reminder', template_language: 'en', variables: ['{{first_name}}'], remind_hours_before: '2' })).toEqual({
      ok: true,
      value: { template_name: 'reminder', template_language: 'en', variables: ['{{first_name}}'], remind_day_before: true, remind_hours_before: 2 },
    })
  })
  it('allows switching reminders off and rejects bad hours', () => {
    expect(parseSettingsInput({ template_name: '', remind_day_before: false, remind_hours_before: null })).toMatchObject({ ok: true, value: { template_name: null, remind_day_before: false, remind_hours_before: null } })
    expect(parseSettingsInput({ template_name: 't', variables: [], remind_hours_before: 24 })).toEqual({ ok: false, error: 'hoursInvalid' })
    expect(parseSettingsInput({ template_name: 't', variables: [''] })).toEqual({ ok: false, error: 'variableRequired' })
  })
})
