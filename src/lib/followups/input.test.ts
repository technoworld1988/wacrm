import { describe, expect, it } from 'vitest'
import { parseReminder, parseSequenceInput } from './input'

const step = { delay_days: 1, template_name: 'follow_up_1', template_language: 'en', variables: ['{{first_name}}'] }

describe('parseSequenceInput', () => {
  it('accepts a valid sequence and defaults flags', () => {
    const r = parseSequenceInput({ name: ' New leads ', steps: [step] })
    expect(r).toEqual({
      ok: true,
      value: { name: 'New leads', auto_enroll_new_contacts: false, is_active: true, steps: [step] },
    })
  })
  it('requires a name and at least one step', () => {
    expect(parseSequenceInput({ name: '', steps: [step] })).toEqual({ ok: false, error: 'nameRequired' })
    expect(parseSequenceInput({ name: 'x', steps: [] })).toEqual({ ok: false, error: 'stepsRequired' })
    expect(parseSequenceInput(null)).toEqual({ ok: false, error: 'invalid' })
  })
  it('rejects bad steps', () => {
    expect(parseSequenceInput({ name: 'x', steps: [{ ...step, template_name: '' }] })).toEqual({ ok: false, error: 'templateRequired' })
    expect(parseSequenceInput({ name: 'x', steps: [{ ...step, delay_days: 61 }] })).toEqual({ ok: false, error: 'delayInvalid' })
    expect(parseSequenceInput({ name: 'x', steps: [{ ...step, delay_days: 1.5 }] })).toEqual({ ok: false, error: 'delayInvalid' })
    expect(parseSequenceInput({ name: 'x', steps: [{ ...step, variables: [' '] }] })).toEqual({ ok: false, error: 'variableRequired' })
    expect(parseSequenceInput({ name: 'x', steps: Array(11).fill(step) })).toEqual({ ok: false, error: 'tooManySteps' })
  })
  it('falls back to en_US for an odd language code', () => {
    const r = parseSequenceInput({ name: 'x', steps: [{ ...step, template_language: 'bad lang' }] })
    expect(r.ok && r.value.steps[0].template_language).toBe('en_US')
  })
})

describe('parseReminder', () => {
  it('clears with null', () => {
    expect(parseReminder({ at: null })).toEqual({ ok: true, value: { at: null, note: null } })
  })
  it('accepts a date with a note', () => {
    const at = new Date(Date.now() + 86400000).toISOString()
    expect(parseReminder({ at, note: ' Call about quote ' })).toEqual({ ok: true, value: { at, note: 'Call about quote' } })
  })
  it('rejects junk and far-off dates', () => {
    expect(parseReminder({ at: 'soon' })).toEqual({ ok: false, error: 'reminderInvalid' })
    expect(parseReminder({ at: '2099-01-01T00:00:00Z' })).toEqual({ ok: false, error: 'reminderInvalid' })
  })
})
