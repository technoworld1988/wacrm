import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { supabaseAdmin } from '@/lib/ai/admin-client'
import { isPushConfigured, sendPushToUsers } from '@/lib/push/web-push'

/**
 * POST /api/push/test — send a test push to every device the caller has
 * enabled. Returns { delivered } so the UI can say whether any device
 * accepted it.
 */
export async function POST(request: Request) {
  try {
    const { accountId, userId } = await getCurrentAccount()
    const limit = checkRateLimit(`push-test:${userId}`, RATE_LIMITS.adminAction)
    if (!limit.success) return rateLimitResponse(limit)
    if (!isPushConfigured()) {
      return NextResponse.json({ error: 'Push notifications are not configured on this server.' }, { status: 503 })
    }
    const body = await request.json().catch(() => null)
    const title = typeof body?.title === 'string' ? body.title.slice(0, 80) : 'Test notification'
    const text = typeof body?.body === 'string' ? body.body.slice(0, 160) : 'Notifications are working on this device.'
    const delivered = await sendPushToUsers(supabaseAdmin(), accountId, [userId], {
      title,
      body: text,
      url: '/inbox',
      tag: 'wacrm-test',
    })
    return NextResponse.json({ delivered })
  } catch (err) {
    return toErrorResponse(err)
  }
}
