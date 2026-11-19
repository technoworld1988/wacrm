/**
 * Who gets a push for a new inbound customer message.
 *
 * - Conversation assigned to an agent → only that agent (if they're
 *   still a member of the account).
 * - Unassigned → every member who can act on the inbox (agent role and
 *   above). Viewers are read-only, so they aren't paged.
 *
 * Pure so it is unit-testable; the caller supplies the member list.
 */
export interface MemberRow {
  user_id: string
  account_role: 'owner' | 'admin' | 'agent' | 'viewer' | string
}

const NOTIFIABLE_ROLES = new Set(['owner', 'admin', 'agent'])

export function pickPushRecipients(
  members: MemberRow[],
  assignedAgentId: string | null | undefined,
): string[] {
  if (assignedAgentId) {
    return members.some((m) => m.user_id === assignedAgentId)
      ? [assignedAgentId]
      : []
  }
  return [
    ...new Set(
      members.filter((m) => NOTIFIABLE_ROLES.has(m.account_role)).map((m) => m.user_id),
    ),
  ]
}
