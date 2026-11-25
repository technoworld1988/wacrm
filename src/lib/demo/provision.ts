// ============================================================
// Public demo — make sure the demo account, its owner and the shared
// read-only "visitor" login exist, and that the sample data is fresh.
//
// Runs server-side with the service role, on the first /demo visit
// (and re-seeds every 12 hours). Visitors are signed in as a viewer
// member of the demo account: they can look at everything but cannot
// send messages, change settings or reach any real client's data.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { clearDemoData, seedDemoData } from './seed'

export const DEMO_OWNER_EMAIL = 'demo-owner@demo.technoworld1988.com'
export const DEMO_VISITOR_EMAIL = 'demo-visitor@demo.technoworld1988.com'
export const DEMO_BUSINESS_NAME = 'Sharma Interiors (demo)'
const RESEED_AFTER_MS = 12 * 60 * 60 * 1000

function randomSecret(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString('base64url')
}

async function findUserIdByEmail(db: SupabaseClient, email: string): Promise<string | null> {
  const { data } = await db.from('profiles').select('user_id').eq('email', email).maybeSingle()
  return (data?.user_id as string | undefined) ?? null
}

/** Create a login nobody can sign into with a password (random, discarded). */
async function ensureUser(db: SupabaseClient, email: string, fullName: string): Promise<string> {
  const existing = await findUserIdByEmail(db, email)
  if (existing) return existing
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: randomSecret(),
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })
  if (error || !data.user) {
    // Lost a race with a parallel first visit — the other one created it.
    const raced = await findUserIdByEmail(db, email)
    if (raced) return raced
    throw new Error(`demo: could not create ${email}: ${error?.message}`)
  }
  return data.user.id
}

export interface DemoContext {
  accountId: string
  ownerUserId: string
  visitorEmail: string
}

export async function ensureDemo(db: SupabaseClient, now: Date = new Date()): Promise<DemoContext> {
  // 1. Owner + account
  const ownerUserId = await ensureUser(db, DEMO_OWNER_EMAIL, 'Rohan Sharma')
  const { data: ownerProfile } = await db
    .from('profiles')
    .select('account_id')
    .eq('user_id', ownerUserId)
    .maybeSingle()
  const accountId = ownerProfile?.account_id as string | undefined
  if (!accountId) throw new Error('demo: owner has no account')

  const { data: account } = await db
    .from('accounts')
    .select('id, is_demo, demo_seeded_at')
    .eq('id', accountId)
    .single()
  if (!account?.is_demo) {
    const { error } = await db
      .from('accounts')
      .update({
        is_demo: true,
        name: DEMO_BUSINESS_NAME,
        status: 'active',
        plan: 'ultra',
        plan_ends_at: '2099-12-31T00:00:00Z',
        default_currency: 'INR',
      })
      .eq('id', accountId)
    if (error) throw new Error(`demo: account setup failed: ${error.message}`)
  }

  // 2. Shared visitor login — a viewer member of the demo account.
  const visitorUserId = await ensureUser(db, DEMO_VISITOR_EMAIL, 'Demo visitor')
  const { data: visitorProfile } = await db
    .from('profiles')
    .select('account_id, account_role, full_name')
    .eq('user_id', visitorUserId)
    .maybeSingle()
  if (visitorProfile && (visitorProfile.account_id !== accountId || visitorProfile.account_role !== 'viewer')) {
    const ownAccount = visitorProfile.account_id as string
    await db
      .from('profiles')
      .update({ account_id: accountId, account_role: 'viewer', full_name: 'Demo visitor' })
      .eq('user_id', visitorUserId)
    // Drop the empty account the sign-up trigger made for the visitor.
    if (ownAccount && ownAccount !== accountId) {
      await db.from('accounts').delete().eq('id', ownAccount).eq('owner_user_id', visitorUserId)
    }
  } else if (visitorProfile && visitorProfile.full_name !== 'Demo visitor') {
    // Visitors can rename themselves; put it back.
    await db.from('profiles').update({ full_name: 'Demo visitor' }).eq('user_id', visitorUserId)
  }

  // 3. Fresh sample data. The conditional update is a lock: only one
  //    concurrent visit wins the re-seed.
  const staleBefore = new Date(now.getTime() - RESEED_AFTER_MS).toISOString()
  const { data: claimed } = await db
    .from('accounts')
    .update({ demo_seeded_at: now.toISOString() })
    .eq('id', accountId)
    .or(`demo_seeded_at.is.null,demo_seeded_at.lt.${staleBefore}`)
    .select('id')
  if (claimed && claimed.length > 0) {
    try {
      await clearDemoData(db, accountId)
      await seedDemoData(db, accountId, ownerUserId, now)
    } catch (err) {
      // Let the next visit try again.
      await db.from('accounts').update({ demo_seeded_at: null }).eq('id', accountId)
      throw err
    }
  }

  return { accountId, ownerUserId, visitorEmail: DEMO_VISITOR_EMAIL }
}
