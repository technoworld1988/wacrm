import { describe, expect, it } from 'vitest'
import { clearDemoData, seedDemoData } from './seed'

// A tiny fake of the Supabase query builder that records inserts and
// hands back ids, so the seed can run end to end without a database.
function fakeDb() {
  const inserted: Record<string, Record<string, unknown>[]> = {}
  let n = 0
  const builder = (table: string) => {
    let rows: Record<string, unknown>[] = []
    const result = () => ({ data: rows.map((r) => ({ id: `${table}-${++n}`, ...r })), error: null })
    const b: Record<string, unknown> = {
      insert(v: Record<string, unknown> | Record<string, unknown>[]) {
        rows = Array.isArray(v) ? v : [v]
        ;(inserted[table] ??= []).push(...rows)
        return b
      },
      update() { return b },
      delete() { return b },
      eq() { return b },
      select() { return b },
      single() { const r = result(); return Promise.resolve({ data: r.data[0], error: null }) },
      then(resolve: (v: unknown) => void) { resolve(result()) },
    }
    return b
  }
  return { db: { from: builder } as never, inserted }
}

describe('demo seed', () => {
  it('runs end to end and every reference resolves', async () => {
    const { db, inserted } = fakeDb()
    await clearDemoData(db, 'acc')
    await seedDemoData(db, 'acc', 'owner', new Date('2026-11-25T06:30:00Z'))

    const templateNames = new Set(inserted.message_templates.map((t) => t.name))
    for (const step of inserted.followup_steps) expect(templateNames).toContain(step.template_name)
    for (const m of inserted.messages) if (m.template_name) expect(templateNames).toContain(m.template_name)
    for (const d of inserted.deals) {
      expect(d.contact_id).toBeTruthy()
      expect(d.stage_id).toBeTruthy()
    }
    for (const e of inserted.followup_enrollments) expect(e.contact_id).toBeTruthy()
    expect(inserted.contacts.length).toBeGreaterThanOrEqual(10)
    for (const a of inserted.appointments) expect(a.contact_id).toBeTruthy()
    expect(templateNames).toContain(inserted.appointment_settings[0].template_name)
    // Every row belongs to the demo account.
    for (const t of ['contacts', 'conversations', 'deals', 'message_templates', 'broadcasts', 'automations']) {
      for (const r of inserted[t]) expect(r.account_id).toBe('acc')
    }
  })
})
