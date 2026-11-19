import type { SupabaseClient } from '@supabase/supabase-js'
import type { ContentType } from '@/types'
import {
  buildNotificationContent,
  pickContactDisplayName,
} from '@/lib/notifications/browser-notify'
import { isPushConfigured, sendPushToUsers } from './web-push'
import { pickPushRecipients, type MemberRow } from './recipients'

export interface InboundPushArgs {
  accountId: string
  conversationId: string
  contactId: string
  messageId: string
  contentType: string
  contentText: string | null
}

/**
 * Push a "new customer message" notification to the right teammates'
 * devices. Called from the WhatsApp webhook after the message is
 * stored. Never throws and is a no-op when push isn't configured.
 */
export async function notifyInboundMessage(
  db: SupabaseClient,
  args: InboundPushArgs,
): Promise<void> {
  if (!isPushConfigured()) return
  try {
    const [{ data: conv }, { data: contact }, { data: members }] = await Promise.all([
      db
        .from('conversations')
        .select('assigned_agent_id')
        .eq('id', args.conversationId)
        .maybeSingle(),
      db
        .from('contacts')
        .select('name, wa_username, phone')
        .eq('id', args.contactId)
        .maybeSingle(),
      db
        .from('profiles')
        .select('user_id, account_role')
        .eq('account_id', args.accountId),
    ])

    const recipients = pickPushRecipients(
      (members ?? []) as MemberRow[],
      (conv as { assigned_agent_id?: string | null } | null)?.assigned_agent_id,
    )
    if (recipients.length === 0) return

    const { title, body } = buildNotificationContent(
      {
        id: args.messageId,
        conversation_id: args.conversationId,
        sender_type: 'customer',
        content_type: args.contentType as ContentType,
        content_text: args.contentText,
      },
      pickContactDisplayName(contact),
    )

    await sendPushToUsers(db, args.accountId, recipients, {
      title,
      body: body || 'New message',
      url: `/inbox?c=${args.conversationId}`,
      // Same tag the in-tab alert uses, so the two never stack.
      tag: args.conversationId,
    })
  } catch (err) {
    console.error('[push] inbound notify failed:', err)
  }
}
