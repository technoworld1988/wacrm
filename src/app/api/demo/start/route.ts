import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { createClient } from '@/lib/supabase/server'
import { ensureDemo } from '@/lib/demo/provision'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

// POST /api/demo/start — the "Open live demo" button on /demo.
// Makes sure the demo account is ready, signs the browser in as the
// shared read-only demo visitor, and sends it to the dashboard.
// No password is involved: a one-time sign-in token is created and
// redeemed on the server in the same request.

export const dynamic = 'force-dynamic'

function back(request: Request, query: string) {
  return NextResponse.redirect(new URL(`/demo?${query}`, request.url), 303)
}

export async function POST(request: Request) {
  const limit = checkRateLimit(`demo-start:${getClientIp(request)}`, { limit: 20, windowMs: 60 * 60 * 1000 })
  if (!limit.success) return back(request, 'error=busy')

  try {
    const db = supabaseAdmin()
    const { visitorEmail } = await ensureDemo(db)

    const { data, error } = await db.auth.admin.generateLink({ type: 'magiclink', email: visitorEmail })
    if (error || !data.properties?.hashed_token) throw new Error(error?.message ?? 'no token')

    const supabase = await createClient()
    // Replace whatever session this browser had (the /demo page warns first).
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
    const { error: otpErr } = await supabase.auth.verifyOtp({
      type: 'magiclink',
      token_hash: data.properties.hashed_token,
    })
    if (otpErr) throw new Error(otpErr.message)

    return NextResponse.redirect(new URL('/dashboard', request.url), 303)
  } catch (err) {
    console.error('[demo] start failed:', err instanceof Error ? err.message : err)
    return back(request, 'error=failed')
  }
}
