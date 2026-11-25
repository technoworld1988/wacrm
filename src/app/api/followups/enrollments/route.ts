import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { isUuid } from '@/lib/api/v1/pagination'
import { enrollContact } from '@/lib/followups/engine'
import { getT } from '@/lib/i18n/translate'

const t = getT('Api')

// Start a follow-up sequence for one or more contacts (agent+).
// Body: { sequence_id, contact_ids: string[] } — up to 200 at once.
export async function POST(request: Request) {
  let ctx
  try {
    ctx = await requireRole('agent')
  } catch (err) {
    return toErrorResponse(err)
  }
  const body = (await request.json().catch(() => null)) as
    | { sequence_id?: unknown; contact_ids?: unknown }
    | null
  const sequenceId = typeof body?.sequence_id === 'string' ? body.sequence_id : ''
  const contactIds = Array.isArray(body?.contact_ids)
    ? (body.contact_ids as unknown[]).filter((v): v is string => typeof v === 'string' && isUuid(v))
    : []
  if (!isUuid(sequenceId) || contactIds.length === 0 || contactIds.length > 200) {
    return NextResponse.json({ error: t('followUps.enrollInvalid') }, { status: 400 })
  }

  let started = 0
  let alreadyRunning = 0
  for (const contactId of contactIds) {
    const r = await enrollContact({ accountId: ctx.accountId, sequenceId, contactId, enrolledBy: ctx.userId })
    if (r.ok) started++
    else if (r.reason === 'already_running') alreadyRunning++
    else if (r.reason === 'sequence_not_found' || r.reason === 'sequence_empty') {
      return NextResponse.json({ error: t('followUps.sequenceUnavailable') }, { status: 400 })
    }
  }
  return NextResponse.json({ started, alreadyRunning })
}
