import { describe, expect, it } from 'vitest'
import {
  dayBeforeDueAt,
  dueReminder,
  formatAppointmentDate,
  parseReminderReply,
  renderAppointmentVariable,
} from './schedule'

// 28 Nov 2026, 11:00 IST = 05:30 UTC
const start = new Date('2026-11-28T05:30:00Z')
const both = { remindDayBefore: true, remindHoursBefore: 2 }
const fresh = { startsAt: start, dayBeforeSent: false, hoursBeforeSent: false }
const ist = (s: string) => new Date(`${s}+05:30`)

describe('dayBeforeDueAt', () => {
  it('is 10:00 IST on the previous day', () => {
    expect(dayBeforeDueAt(start).toISOString()).toBe('2026-11-27T04:30:00.000Z')
  })
  it('uses the IST date for an early-morning appointment', () => {
    // 28 Nov 01:00 IST = 27 Nov 19:30 UTC → due 27 Nov 10:00 IST
    expect(dayBeforeDueAt(new Date('2026-11-27T19:30:00Z')).toISOString()).toBe('2026-11-27T04:30:00.000Z')
  })
})

describe('dueReminder', () => {
  it('nothing before the day-before slot', () => {
    expect(dueReminder(fresh, both, ist('2026-11-27T09:59:00'))).toBeNull()
  })
  it('day-before from 10:00 the previous day', () => {
    expect(dueReminder(fresh, both, ist('2026-11-27T10:00:00'))).toBe('day_before')
  })
  it('no day-before at night', () => {
    expect(dueReminder(fresh, both, ist('2026-11-27T21:00:00'))).toBeNull()
  })
  it('no day-before within 3 hours of the start', () => {
    expect(dueReminder(fresh, { remindDayBefore: true, remindHoursBefore: null }, ist('2026-11-28T08:30:00'))).toBeNull()
  })
  it('hours-before from start minus N hours', () => {
    expect(dueReminder({ ...fresh, dayBeforeSent: true }, both, ist('2026-11-28T09:00:00'))).toBe('hours_before')
    expect(dueReminder({ ...fresh, dayBeforeSent: true }, both, ist('2026-11-28T08:59:00'))).toBeNull()
  })
  it('hours-before wins when both are due', () => {
    expect(dueReminder(fresh, both, ist('2026-11-28T09:30:00'))).toBe('hours_before')
  })
  it('never before 07:00 IST', () => {
    const early = { startsAt: ist('2026-11-28T08:00:00'), dayBeforeSent: true, hoursBeforeSent: false }
    expect(dueReminder(early, both, ist('2026-11-28T06:30:00'))).toBeNull()
    expect(dueReminder(early, both, ist('2026-11-28T07:00:00'))).toBe('hours_before')
  })
  it('nothing once started or already sent', () => {
    expect(dueReminder(fresh, both, ist('2026-11-28T11:00:00'))).toBeNull()
    expect(dueReminder({ ...fresh, dayBeforeSent: true, hoursBeforeSent: true }, both, ist('2026-11-28T10:00:00'))).toBeNull()
  })
})

describe('renderAppointmentVariable', () => {
  it('fills appointment details in India time', () => {
    const v = { name: 'Priya Nair', phone: '+91900', title: 'Dental check-up', location: 'Park Street', startsAt: start }
    const { date, time } = formatAppointmentDate(start)
    expect(renderAppointmentVariable('{{first_name}}|{{date}}|{{time}}|{{title}}|{{location}}', v)).toBe(
      `Priya|${date}|${time}|Dental check-up|Park Street`,
    )
    expect(date).toMatch(/28/)
    expect(time.toLowerCase()).toMatch(/11:00/)
  })
  it('uses "there" for number-only names and "-" for no location', () => {
    expect(renderAppointmentVariable('{{name}} {{location}}', { name: '+91 90000 11111', title: 'x', startsAt: start })).toBe('there -')
  })
})

describe('parseReminderReply', () => {
  it('reads confirmations', () => {
    for (const t of ['Confirm', '1', 'yes', 'Haan ji', 'OK sure', '👍']) expect(parseReminderReply(t)).toBe('confirm')
  })
  it('reads reschedule requests', () => {
    for (const t of ['Reschedule', '2', 'No', 'cancel please', "can't come"]) expect(parseReminderReply(t)).toBe('reschedule')
  })
  it('ignores everything else', () => {
    for (const t of ['', null, 'what time?', '10', 'yesterday I called you about the price of the kitchen']) {
      expect(parseReminderReply(t)).toBeNull()
    }
  })
})
