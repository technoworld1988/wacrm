import { describe, expect, it } from 'vitest'
import {
  countPlaceholders,
  endOfTodayIst,
  intoSendingHours,
  nextRunAt,
  renderVariable,
  toVariableList,
} from './schedule'

// 12:00 IST = 06:30 UTC
const noonIst = new Date('2026-11-25T06:30:00Z')

describe('intoSendingHours', () => {
  it('keeps a time inside 09:00–20:00 IST', () => {
    expect(intoSendingHours(noonIst).toISOString()).toBe(noonIst.toISOString())
  })
  it('moves an early-morning time to 10:00 IST the same day', () => {
    // 06:00 IST = 00:30 UTC
    expect(intoSendingHours(new Date('2026-11-25T00:30:00Z')).toISOString()).toBe('2026-11-25T04:30:00.000Z')
  })
  it('moves a late-evening time to 10:00 IST the next day', () => {
    // 21:00 IST = 15:30 UTC
    expect(intoSendingHours(new Date('2026-11-25T15:30:00Z')).toISOString()).toBe('2026-11-26T04:30:00.000Z')
  })
  it('treats 20:00 IST as outside hours', () => {
    expect(intoSendingHours(new Date('2026-11-25T14:30:00Z')).toISOString()).toBe('2026-11-26T04:30:00.000Z')
  })
})

describe('nextRunAt', () => {
  it('sends straight away for a 0-day delay, even at night', () => {
    const night = new Date('2026-11-25T18:00:00Z')
    expect(nextRunAt(night, 0).toISOString()).toBe(night.toISOString())
  })
  it('adds whole days and keeps the time when it is in hours', () => {
    expect(nextRunAt(noonIst, 2).toISOString()).toBe('2026-11-27T06:30:00.000Z')
  })
  it('pulls a night-time result into the next morning', () => {
    // 23:00 IST on the 25th + 1 day → 23:00 IST 26th → 10:00 IST 27th
    expect(nextRunAt(new Date('2026-11-25T17:30:00Z'), 1).toISOString()).toBe('2026-11-27T04:30:00.000Z')
  })
})

describe('endOfTodayIst', () => {
  it('is 23:59:59.999 IST of the current IST day', () => {
    expect(endOfTodayIst(noonIst).toISOString()).toBe('2026-11-25T18:29:59.999Z')
  })
  it('uses the IST date, not the UTC date, just after IST midnight', () => {
    // 00:30 IST on the 26th = 19:00 UTC on the 25th
    expect(endOfTodayIst(new Date('2026-11-25T19:00:00Z')).toISOString()).toBe('2026-11-26T18:29:59.999Z')
  })
})

describe('renderVariable', () => {
  it('fills name, first name and phone', () => {
    expect(renderVariable('Hi {{first_name}} ({{name}}, {{phone}})', { name: 'Priya Nair', phone: '+919000012300' }))
      .toBe('Hi Priya (Priya Nair, +919000012300)')
  })
  it('falls back to "there" when the name is just a number', () => {
    expect(renderVariable('Hi {{first_name}}', { name: '+91 90000 12300', phone: '+919000012300' })).toBe('Hi there')
    expect(renderVariable('Hi {{name}}', { name: null })).toBe('Hi there')
  })
  it('leaves fixed text untouched', () => {
    expect(renderVariable('2 BHK in Baner', { name: 'A' })).toBe('2 BHK in Baner')
  })
})

describe('countPlaceholders', () => {
  it('returns the highest positional placeholder', () => {
    expect(countPlaceholders('Hi {{1}}, your {{2}} and {{ 3 }}')).toBe(3)
    expect(countPlaceholders('No variables')).toBe(0)
    expect(countPlaceholders(null)).toBe(0)
  })
})

describe('toVariableList', () => {
  it('keeps strings, blanks others, caps the length', () => {
    expect(toVariableList(['a', 3, null])).toEqual(['a', '', ''])
    expect(toVariableList('x')).toEqual([])
    expect(toVariableList(Array(15).fill('v'))).toHaveLength(10)
  })
})
