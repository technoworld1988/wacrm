import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Web Push delivery (installable-app / background notifications).
 *
 * Needs three env vars; when any is missing push is simply disabled and
 * every function here becomes a silent no-op, so self-hosters who never
 * set it up see no errors:
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY  — also read by the browser to subscribe
 *   VAPID_PRIVATE_KEY
 *   VAPID_SUBJECT                 — "mailto:you@example.com" or an https URL
 */

export interface PushPayload {
  title: string
  body: string
  /** Path the notification opens when tapped, e.g. /inbox?c=<id>. */
  url: string
  /** Notifications with the same tag replace each other (one per chat). */
  tag?: string
}

interface SubscriptionRow {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

let configured: boolean | null = null

export function isPushConfigured(): boolean {
  if (configured !== null) return configured
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!pub || !priv || !subject) {
    configured = false
    return false
  }
  try {
    webpush.setVapidDetails(subject, pub, priv)
    configured = true
  } catch (err) {
    console.error('[push] invalid VAPID configuration:', err)
    configured = false
  }
  return configured
}

/**
 * Send one payload to every stored subscription of the given users in
 * the given account. Never throws. Subscriptions the push service
 * reports as gone (404/410) are deleted so they aren't retried forever.
 * Returns how many devices accepted the push.
 */
export async function sendPushToUsers(
  db: SupabaseClient,
  accountId: string,
  userIds: string[],
  payload: PushPayload,
): Promise<number> {
  if (!isPushConfigured() || userIds.length === 0) return 0
  try {
    const { data, error } = await db
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('account_id', accountId)
      .in('user_id', userIds)
    if (error) {
      console.error('[push] subscription lookup failed:', error)
      return 0
    }
    const rows = (data ?? []) as SubscriptionRow[]
    if (rows.length === 0) return 0

    const body = JSON.stringify(payload)
    const gone: string[] = []
    const delivered: string[] = []

    await Promise.all(
      rows.map(async (row) => {
        try {
          await webpush.sendNotification(
            { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
            body,
            { TTL: 60 * 60, urgency: 'high', timeout: 8000 },
          )
          delivered.push(row.id)
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode
          if (status === 404 || status === 410) {
            gone.push(row.id)
          } else {
            console.error('[push] send failed:', status ?? err)
          }
        }
      }),
    )

    if (gone.length > 0) {
      await db.from('push_subscriptions').delete().in('id', gone)
    }
    if (delivered.length > 0) {
      await db
        .from('push_subscriptions')
        .update({ last_success_at: new Date().toISOString() })
        .in('id', delivered)
    }
    return delivered.length
  } catch (err) {
    console.error('[push] unexpected failure:', err)
    return 0
  }
}
