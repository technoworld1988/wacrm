import { describe, expect, it } from 'vitest'
import { pickPushRecipients } from './recipients'

const members = [
  { user_id: 'owner', account_role: 'owner' },
  { user_id: 'admin', account_role: 'admin' },
  { user_id: 'agent', account_role: 'agent' },
  { user_id: 'viewer', account_role: 'viewer' },
]

describe('pickPushRecipients', () => {
  it('notifies only the assigned agent when the chat is assigned', () => {
    expect(pickPushRecipients(members, 'agent')).toEqual(['agent'])
  })

  it('notifies nobody when the assignee is no longer a member', () => {
    expect(pickPushRecipients(members, 'gone')).toEqual([])
  })

  it('notifies every owner, admin and agent for an unassigned chat, not viewers', () => {
    expect(pickPushRecipients(members, null).sort()).toEqual(['admin', 'agent', 'owner'])
  })

  it('de-duplicates repeated member rows', () => {
    expect(pickPushRecipients([...members, members[0]], undefined).filter((u) => u === 'owner')).toHaveLength(1)
  })
})
