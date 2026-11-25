// ============================================================
// Sample data for the public demo account — "Sharma Interiors",
// a Kolkata home-interiors business. Every timestamp is relative to
// `now`, so the inbox always reads "2 hours ago", not "last month".
//
// Phone numbers use the +91 90000 0xxxx range and the demo account
// has no WhatsApp connection, so nothing can ever be sent to them.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'

const H = 60 * 60 * 1000
const M = 60 * 1000
const D = 24 * H

type Msg = [from: 'c' | 'a' | 'b' | 'ai', minutesAgo: number, text: string, extra?: { template?: string }]

interface ConvSeed {
  key: string
  name: string
  phone: string
  tags: string[]
  status: 'open' | 'pending' | 'closed'
  unread: number
  messages: Msg[]
}

const CONVS: ConvSeed[] = [
  {
    key: 'priya', name: 'Priya Nair', phone: '+919000001201', tags: ['Hot lead'], status: 'open', unread: 2,
    messages: [
      ['c', 190, 'Hi, I saw your ad on Instagram. We have a 2BHK in Salt Lake. Need full interiors.'],
      ['b', 189, 'Hi Priya 👋 Thanks for contacting Sharma Interiors! Our designer will reply in a few minutes. Meanwhile, what is your budget range?'],
      ['c', 180, 'Around 6 to 8 lakhs'],
      ['a', 160, 'Thank you Priya! For a 2BHK at that budget we can do modular kitchen, wardrobes, TV unit and false ceiling. Can we visit the flat this Saturday at 11 AM?'],
      ['c', 25, 'Saturday works. Can you also send some kitchen designs?'],
      ['c', 24, 'Preferably light colours 🙂'],
    ],
  },
  {
    key: 'arjun', name: 'Arjun Mehta', phone: '+919000001202', tags: ['Quote sent'], status: 'open', unread: 0,
    messages: [
      ['a', 3 * 24 * 60, 'Hi Arjun, as discussed, please find the quotation for your 3BHK: ₹9,85,000 including GST.', { template: 'quote_followup' }],
      ['c', 2 * 24 * 60, 'Thanks. Can you do anything on the price? Another vendor quoted 9 lakh.'],
      ['a', 2 * 24 * 60 - 40, 'We use Century ply and Hettich fittings with 10 years warranty. I can offer ₹9,45,000 if you confirm this week.'],
      ['c', 300, 'Ok let me discuss with my wife and confirm by tomorrow'],
      ['a', 290, 'Sure Arjun, take your time. I have set a reminder to call you tomorrow 😊'],
    ],
  },
  {
    key: 'fatima', name: 'Fatima Khan', phone: '+919000001203', tags: ['Site visit'], status: 'open', unread: 1,
    messages: [
      ['c', 26 * 60, 'Hello, do you do only kitchen work? Not full house.'],
      ['ai', 26 * 60 - 1, 'Hi Fatima! Yes, we do modular kitchens on their own too. An L-shaped kitchen usually starts from ₹1.6 lakh. Would you like a free measurement visit?'],
      ['c', 26 * 60 - 10, 'Yes please. I am in Behala.'],
      ['a', 25 * 60, 'Great! Our team can come on Thursday between 4–6 PM. Does that work?'],
      ['c', 50, 'Yes Thursday is fine. Please share the address of your showroom also'],
    ],
  },
  {
    key: 'rahul', name: 'Rahul Banerjee', phone: '+919000001204', tags: ['Customer'], status: 'pending', unread: 0,
    messages: [
      ['b', 5 * 60, 'Hi Rahul, your payment of ₹1,20,000 for invoice INV-0042 is due on 30 Nov. Pay by UPI: sharmainteriors@okhdfcbank', { template: 'payment_reminder' }],
      ['c', 4 * 60, 'Done, paid just now. Sharing screenshot.'],
      ['a', 4 * 60 - 5, 'Received, thank you Rahul! Installation of the wardrobes starts Monday 🙏'],
    ],
  },
  {
    key: 'sneha', name: 'Sneha Kulkarni', phone: '+919000001205', tags: ['Hot lead'], status: 'open', unread: 3,
    messages: [
      ['c', 12, 'Hi'],
      ['c', 11, 'Looking for pooja room and foyer design'],
      ['c', 10, 'What will be the cost approximately?'],
    ],
  },
  {
    key: 'vikram', name: 'Vikram Singh', phone: '+919000001206', tags: [], status: 'open', unread: 0,
    messages: [
      ['b', 2 * 24 * 60, 'Hi Vikram, thanks for your enquiry about a studio apartment makeover. Shall I send some designs?', { template: 'new_lead_followup_1' }],
      ['c', 6 * 60, 'Yes, share details'],
      ['a', 6 * 60 - 15, 'Here are 3 designs we did recently in New Town. Budget for a studio is ₹2.5–3.5 lakh.'],
    ],
  },
  {
    key: 'meera', name: 'Meera Iyer', phone: '+919000001207', tags: ['Customer'], status: 'closed', unread: 0,
    messages: [
      ['c', 4 * 24 * 60, 'The living room looks amazing! Thank you so much team 😍'],
      ['a', 4 * 24 * 60 - 30, 'Thank you Meera! It was a pleasure. If you know anyone who needs interiors, we would be grateful for a referral 🙏'],
    ],
  },
  {
    key: 'abdul', name: 'Abdul Rahman', phone: '+919000001208', tags: ['Site visit'], status: 'open', unread: 0,
    messages: [
      ['b', 26 * 60, 'Reminder: our site visit is tomorrow, Friday at 11 AM at Park Street. Reply 1 to confirm or 2 to reschedule.', { template: 'appointment_reminder' }],
      ['c', 25 * 60, '1'],
      ['b', 25 * 60 - 1, 'Thanks Abdul, your visit is confirmed ✅'],
    ],
  },
]

// Contacts without a chat yet — leads from forms, walk-ins, imports.
const EXTRA_CONTACTS: { key: string; name: string; phone: string; tags: string[] }[] = [
  { key: 'kavita', name: 'Kavita Reddy', phone: '+919000001209', tags: ['Hot lead'] },
  { key: 'sandeep', name: 'Sandeep Joshi', phone: '+919000001210', tags: [] },
  { key: 'tarun', name: 'Tarun Mehta', phone: '+919000001211', tags: [] },
  { key: 'anjali', name: 'Anjali Gupta', phone: '+919000001212', tags: ['Quote sent'] },
  { key: 'karthik', name: 'Karthik Subramanian', phone: '+919000001213', tags: [] },
  { key: 'neha', name: 'Neha Saxena', phone: '+919000001214', tags: ['Customer'] },
]

const TAGS: [string, string][] = [
  ['Hot lead', '#ef4444'],
  ['Site visit', '#3E6FD6'],
  ['Quote sent', '#E0A93A'],
  ['Customer', '#22c55e'],
]

const TEMPLATES = [
  {
    name: 'new_lead_followup_1', category: 'Marketing',
    body_text: 'Hi {{1}}, thanks for your enquiry with Sharma Interiors. Would you like us to send a few designs and prices?',
    buttons: [{ type: 'QUICK_REPLY', text: 'Yes, share details' }, { type: 'QUICK_REPLY', text: 'Not now' }],
  },
  {
    name: 'new_lead_followup_2', category: 'Marketing',
    body_text: 'Hi {{1}}, we have a free design consultation slot this week. Shall I book one for you?',
    buttons: [{ type: 'QUICK_REPLY', text: 'Book a slot' }],
  },
  {
    name: 'new_lead_final', category: 'Marketing',
    body_text: "Hi {{1}}, I won't disturb you further. Whenever you plan your interiors, just reply here. Have a great day!",
    buttons: null,
  },
  {
    name: 'appointment_reminder', category: 'Utility',
    body_text: 'Reminder: our site visit is on {{1}} at {{2}}. Reply 1 to confirm or 2 to reschedule.',
    buttons: [{ type: 'QUICK_REPLY', text: 'Confirm' }, { type: 'QUICK_REPLY', text: 'Reschedule' }],
  },
  {
    name: 'payment_reminder', category: 'Utility',
    body_text: 'Hi {{1}}, your payment of {{2}} for invoice {{3}} is due on {{4}}. Pay by UPI: sharmainteriors@okhdfcbank',
    buttons: null,
  },
  {
    name: 'quote_followup', category: 'Utility',
    body_text: 'Hi {{1}}, as discussed, please find the quotation for your {{2}}: {{3}} including GST.',
    buttons: null,
  },
  {
    name: 'diwali_offer', category: 'Marketing',
    body_text: 'Hi {{1}}! 🪔 Diwali offer: flat 15% off on modular kitchens booked before 15 Nov. Reply YES for a free visit.',
    buttons: [{ type: 'QUICK_REPLY', text: 'YES' }],
  },
]

const STAGES: [string, string][] = [
  ['New enquiry', '#94a3b8'],
  ['Site visit', '#3E6FD6'],
  ['Quote sent', '#E0A93A'],
  ['Negotiation', '#a855f7'],
  ['Won', '#22c55e'],
]

const DEALS: { contact: string; title: string; value: number; stage: number; status?: 'won' | 'open' }[] = [
  { contact: 'priya', title: '2BHK full interiors – Salt Lake', value: 720000, stage: 1 },
  { contact: 'arjun', title: '3BHK interiors – Rajarhat', value: 945000, stage: 3 },
  { contact: 'fatima', title: 'L-shaped modular kitchen', value: 165000, stage: 1 },
  { contact: 'sneha', title: 'Pooja room + foyer', value: 120000, stage: 0 },
  { contact: 'vikram', title: 'Studio apartment makeover', value: 300000, stage: 2 },
  { contact: 'anjali', title: 'Home office & study', value: 95000, stage: 2 },
  { contact: 'kavita', title: 'Living room makeover', value: 210000, stage: 0 },
  { contact: 'rahul', title: 'Wardrobes – 3 bedrooms', value: 240000, stage: 4, status: 'won' },
  { contact: 'meera', title: 'Living + dining interiors', value: 385000, stage: 4, status: 'won' },
]

function sender(from: Msg[0]): { sender_type: 'customer' | 'agent' | 'bot'; ai_generated: boolean } {
  if (from === 'c') return { sender_type: 'customer', ai_generated: false }
  if (from === 'a') return { sender_type: 'agent', ai_generated: false }
  if (from === 'ai') return { sender_type: 'bot', ai_generated: true }
  return { sender_type: 'bot', ai_generated: false }
}

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>, what: string): Promise<T> {
  const { data, error } = await p
  if (error) throw new Error(`demo seed: ${what}: ${error.message}`)
  return data
}

/** Wipe the demo account's business data. Contacts cascade to chats, deals, tags, enrollments. */
export async function clearDemoData(db: SupabaseClient, accountId: string): Promise<void> {
  for (const table of [
    'followup_sequences', 'broadcasts', 'automations', 'deals', 'pipelines',
    'contacts', 'tags', 'message_templates', 'notifications',
  ]) {
    await must(db.from(table).delete().eq('account_id', accountId), `clear ${table}`)
  }
}

export async function seedDemoData(
  db: SupabaseClient,
  accountId: string,
  ownerUserId: string,
  now: Date = new Date(),
): Promise<void> {
  const at = (msAgo: number) => new Date(now.getTime() - msAgo).toISOString()
  const base = { account_id: accountId, user_id: ownerUserId }

  // Tags
  const tagRows = await must(
    db.from('tags').insert(TAGS.map(([name, color]) => ({ ...base, name, color }))).select('id, name'),
    'tags',
  )
  const tagId = new Map((tagRows as { id: string; name: string }[]).map((t) => [t.name, t.id]))

  // Contacts
  const allContacts = [
    ...CONVS.map((c, i) => ({ key: c.key, name: c.name, phone: c.phone, tags: c.tags, created: (i + 2) * D })),
    ...EXTRA_CONTACTS.map((c, i) => ({ ...c, created: (i + 1) * 3 * D })),
  ]
  const contactRows = await must(
    db
      .from('contacts')
      .insert(allContacts.map((c) => ({ ...base, name: c.name, phone: c.phone, created_at: at(c.created) })))
      .select('id, phone'),
    'contacts',
  )
  const idByPhone = new Map((contactRows as { id: string; phone: string }[]).map((r) => [r.phone, r.id]))
  const cid = (key: string) => idByPhone.get(allContacts.find((c) => c.key === key)!.phone)!

  const contactTags = allContacts.flatMap((c) => c.tags.map((t) => ({ contact_id: cid(c.key), tag_id: tagId.get(t)! })))
  if (contactTags.length) await must(db.from('contact_tags').insert(contactTags), 'contact_tags')

  // Manual follow-up reminders (feed the Follow-ups → Today list)
  const reminders: [string, number, string][] = [
    ['arjun', -2 * H, 'Call Arjun – he will confirm the 3BHK quote after talking to his wife'],
    ['kavita', 20 * H, 'Overdue: send living room designs she asked for at the expo'],
    ['anjali', -5 * H, 'Ask if she reviewed the home-office quote'],
  ]
  for (const [key, msAgo, note] of reminders) {
    await must(db.from('contacts').update({ next_follow_up_at: at(msAgo), follow_up_note: note }).eq('id', cid(key)), 'reminder')
  }

  // Conversations + messages
  for (const conv of CONVS) {
    const last = conv.messages[conv.messages.length - 1]
    const convRow = await must(
      db
        .from('conversations')
        .insert({
          ...base,
          contact_id: cid(conv.key),
          status: conv.status,
          unread_count: conv.unread,
          last_message_text: last[2],
          last_message_at: at(last[1] * M),
          first_inbound_at: (() => {
            const first = conv.messages.find((m) => m[0] === 'c')
            return first ? at(first[1] * M) : null
          })(),
          created_at: at(conv.messages[0][1] * M + M),
        })
        .select('id')
        .single(),
      'conversation',
    )
    const convId = (convRow as { id: string }).id
    await must(
      db.from('messages').insert(
        conv.messages.map(([from, minutesAgo, text, extra]) => ({
          conversation_id: convId,
          ...sender(from),
          sender_id: from === 'a' ? ownerUserId : null,
          content_type: extra?.template ? 'template' : 'text',
          content_text: text,
          template_name: extra?.template ?? null,
          status: from === 'c' ? 'delivered' : minutesAgo > 30 ? 'read' : 'delivered',
          created_at: at(minutesAgo * M),
        })),
      ),
      'messages',
    )
  }

  // Notes
  await must(
    db.from('contact_notes').insert([
      { ...base, contact_id: cid('priya'), note_text: 'Wants light colours, white + oak finish. Husband works from home – needs a study corner.', created_at: at(150 * M) },
      { ...base, contact_id: cid('arjun'), note_text: 'Competitor quoted ₹9L with local ply. Our final offer ₹9.45L valid till Sunday.', created_at: at(2 * D) },
    ]),
    'notes',
  )

  // Pipeline + deals
  const pipe = await must(db.from('pipelines').insert({ ...base, name: 'Interior projects' }).select('id').single(), 'pipeline')
  const pipelineId = (pipe as { id: string }).id
  const stageRows = await must(
    db
      .from('pipeline_stages')
      .insert(STAGES.map(([name, color], position) => ({ pipeline_id: pipelineId, name, color, position })))
      .select('id, position'),
    'stages',
  )
  const stageId = new Map((stageRows as { id: string; position: number }[]).map((s) => [s.position, s.id]))
  await must(
    db.from('deals').insert(
      DEALS.map((d, i) => ({
        ...base,
        pipeline_id: pipelineId,
        stage_id: stageId.get(d.stage),
        contact_id: cid(d.contact),
        title: d.title,
        value: d.value,
        currency: 'INR',
        status: d.status ?? 'open',
        created_at: at((i + 1) * 2 * D),
      })),
    ),
    'deals',
  )

  // Templates (shown as approved; the demo has no WhatsApp number)
  await must(
    db.from('message_templates').insert(
      TEMPLATES.map((t) => ({
        ...base,
        name: t.name,
        category: t.category,
        language: 'en',
        body_text: t.body_text,
        buttons: t.buttons,
        status: 'APPROVED',
        quality_score: 'GREEN',
      })),
    ),
    'templates',
  )

  // Broadcasts
  await must(
    db.from('broadcasts').insert([
      {
        ...base, name: 'Diwali kitchen offer', template_name: 'diwali_offer', template_language: 'en',
        status: 'sent', total_recipients: 486, sent_count: 486, delivered_count: 471, read_count: 402,
        replied_count: 63, failed_count: 15, created_at: at(18 * D), scheduled_at: at(18 * D),
      },
      {
        ...base, name: 'Old customers – referral thank you', template_name: 'new_lead_final', template_language: 'en',
        status: 'sent', total_recipients: 132, sent_count: 132, delivered_count: 130, read_count: 118,
        replied_count: 21, failed_count: 2, created_at: at(7 * D), scheduled_at: at(7 * D),
      },
    ]),
    'broadcasts',
  )

  // Automations
  const autos = await must(
    db
      .from('automations')
      .insert([
        {
          ...base, name: 'Welcome new enquiries', description: 'Greets every new customer and asks their budget',
          trigger_type: 'first_inbound_message', trigger_config: {}, is_active: true, execution_count: 214,
          last_executed_at: at(189 * M),
        },
        {
          ...base, name: 'After-hours reply', description: 'Replies between 8 PM and 9 AM',
          trigger_type: 'new_message_received', trigger_config: {}, is_active: true, execution_count: 57,
          last_executed_at: at(14 * H),
        },
      ])
      .select('id, name'),
    'automations',
  )
  const autoId = new Map((autos as { id: string; name: string }[]).map((a) => [a.name, a.id]))
  await must(
    db.from('automation_steps').insert([
      {
        automation_id: autoId.get('Welcome new enquiries'), step_type: 'send_message', position: 0,
        step_config: { text: 'Hi 👋 Thanks for contacting Sharma Interiors! Our designer will reply in a few minutes. Meanwhile, what is your budget range?' },
      },
      { automation_id: autoId.get('Welcome new enquiries'), step_type: 'add_tag', position: 1, step_config: { tag_id: tagId.get('Hot lead') } },
      { automation_id: autoId.get('After-hours reply'), step_type: 'condition', position: 0, step_config: { subject: 'time_of_day', operand: '20:00-09:00' } },
    ]),
    'automation steps',
  )

  // Follow-up sequence + enrollments
  const seq = await must(
    db
      .from('followup_sequences')
      .insert({ ...base, name: 'New lead follow-up', auto_enroll_new_contacts: true, is_active: true })
      .select('id')
      .single(),
    'sequence',
  )
  const seqId = (seq as { id: string }).id
  await must(
    db.from('followup_steps').insert([
      { sequence_id: seqId, position: 0, delay_days: 1, template_name: 'new_lead_followup_1', template_language: 'en', variables: ['{{first_name}}'] },
      { sequence_id: seqId, position: 1, delay_days: 2, template_name: 'new_lead_followup_2', template_language: 'en', variables: ['{{first_name}}'] },
      { sequence_id: seqId, position: 2, delay_days: 4, template_name: 'new_lead_final', template_language: 'en', variables: ['{{first_name}}'] },
    ]),
    'steps',
  )
  const enr = (key: string, fields: Record<string, unknown>) => ({
    account_id: accountId, sequence_id: seqId, contact_id: cid(key), enrolled_by: ownerUserId, ...fields,
  })
  await must(
    db.from('followup_enrollments').insert([
      enr('sandeep', { status: 'active', next_step: 1, next_run_at: at(-3 * H), last_sent_at: at(2 * D) }),
      enr('tarun', { status: 'active', next_step: 0, next_run_at: at(-5 * H) }),
      enr('karthik', { status: 'active', next_step: 2, next_run_at: at(-26 * H), last_sent_at: at(2 * D) }),
      enr('vikram', { status: 'replied', next_step: 1, last_sent_at: at(2 * D), replied_at: at(6 * H), updated_at: at(6 * H) }),
    ]),
    'enrollments',
  )
}
