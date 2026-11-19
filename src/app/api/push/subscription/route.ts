import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { supabaseAdmin } from '@/lib/ai/admin-client'
import { isPushConfigured } from '@/lib/push/web-push'

/**
 * /api/push/subscription  (any signed-in member)
 *
 *   POST   { endpoint, keys: { p256dh, auth } } — store this device's push
 *          subscription for the caller in their current account.
 *   DELETE { endpoint } — forget it (switch off on this device).
 *
 * Written with the service role after the session is verified; the
 * table only grants clients SELECT/DELETE on their own rows.
 */

function isValidEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

function isKey(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 512
}

export async function POST(request: Request) {
  try {
    const { accountId, userId } = await getCurrentAccount()
    const limit = checkRateLimit(`push-sub:${userId}`, RATE_LIMITS.adminAction)
    if (!limit.success) return rateLimitResponse(limit)

    if (!isPushConfigured()) {
      return NextResponse.json({ error: 'Push notifications are not configured on this server.' }, { status: 503 })
    }

    const body = await request.json().catch(() => null)
    const endpoint = body?.endpoint
    const p256dh = body?.keys?.p256dh
    const auth = body?.keys?.auth
    if (!isValidEndpoint(endpoint) || !isKey(p256dh) || !isKey(auth)) {
      return NextResponse.json({ error: 'Invalid push subscription.' }, { status: 400 })
    }

    const userAgent = request.headers.get('user-agent')?.slice(0, 300) ?? null
    const { error } = await supabaseAdmin()
      .from('push_subscriptions')
      .upsert(
        { endpoint, p256dh, auth, account_id: accountId, user_id: userId, user_agent: userAgent },
        { onConflict: 'endpoint' },
      )
    if (error) {
      console.error('[push] save subscription failed:', error)
      return NextResponse.json({ error: 'Could not save subscription.' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function DELETE(request: Request) {
  try {
    const { userId } = await getCurrentAccount()
    const body = await request.json().catch(() => null)
    const endpoint = body?.endpoint
    if (!isValidEndpoint(endpoint)) {
      return NextResponse.json({ error: 'Invalid endpoint.' }, { status: 400 })
    }
    await supabaseAdmin()
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint)
      .eq('user_id', userId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
