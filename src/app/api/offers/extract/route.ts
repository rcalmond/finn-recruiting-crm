import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

function makeAdmin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * POST /api/offers/extract
 *
 * Given a school_id, pulls recent inbound contact_log rows and asks Sonnet
 * to extract offer details (offer_type, headline, money_note, conditions,
 * key_dates) as a draft. Returns the extracted fields for pre-filling the
 * add-offer modal. Extraction failures degrade to empty fields.
 */
export async function POST(request: Request) {
  try {
    const { schoolId } = await request.json()
    if (!schoolId) return NextResponse.json({ error: 'schoolId required' }, { status: 400 })

    const admin = makeAdmin()

    // Fetch the school name and recent inbound contact_log rows
    const [{ data: school }, { data: inbounds }] = await Promise.all([
      admin.from('schools').select('name, short_name').eq('id', schoolId).single(),
      admin.from('contact_log')
        .select('date, coach_name, summary, direction')
        .eq('school_id', schoolId)
        .eq('direction', 'Inbound')
        .not('parse_status', 'in', '("orphan","non_coach")')
        .order('sent_at', { ascending: false })
        .limit(5),
    ])

    if (!school || !inbounds || inbounds.length === 0) {
      return NextResponse.json({ draft: null })
    }

    const client = new Anthropic()

    const inboundText = inbounds.map((r: { date: string; coach_name: string | null; summary: string }) =>
      `[${r.date}] ${r.coach_name ?? 'unknown'}: ${(r.summary ?? '').slice(0, 500)}`
    ).join('\n')

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      system: `You extract offer/admission details from college recruiting emails. Return a JSON object with these fields:
- offer_type: one of "conditional_admission", "admission", "roster_spot", "preread_positive", "other"
- headline: a short description (e.g. "Conditional admission — Aerospace Engineering")
- money_note: scholarship/aid details if mentioned, or null
- conditions: what's required to finalize, or null
- key_dates: important dates/deadlines, or null
Return ONLY the JSON object. If no clear offer is found, return {"offer_type":"other","headline":"","money_note":null,"conditions":null,"key_dates":null}.`,
      messages: [{
        role: 'user',
        content: `School: ${school.name}\n\nRecent inbound emails:\n${inboundText}`,
      }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''

    // Parse JSON from response
    let draft
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      draft = jsonMatch ? JSON.parse(jsonMatch[0]) : null
    } catch {
      draft = null
    }

    return NextResponse.json({ draft })
  } catch (err) {
    console.error('Offer extraction failed:', err)
    return NextResponse.json({ draft: null })
  }
}
