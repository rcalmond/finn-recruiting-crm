/**
 * call-prep-prompt.ts
 *
 * Builds the system and user prompts for the agentic call prep generation.
 * Model: claude-opus-4-8 with web_search and web_fetch tools.
 *
 * Architecture (2026-06-03): The model drives its own research via tools,
 * then produces the structured JSON output. No separate research step.
 */

import type { SchoolRow, CoachRow, ContactLogRow, CampRow, CurrentAssets } from './school-context'

// ─── Output schema (matches docx generator input) ──────────────────────────

export interface CallPrepOutput {
  title: string
  subtitle: string
  call_with: string

  quick_reference: {
    division_conference: string
    head_coach: string
    point_of_contact?: string
    recent_results: string
    engineering?: string
    academic_anchor: string
    location: string
  }

  where_we_stand: string

  part_1_background: {
    university: string
    what_makes_distinctive: string
    academic_program: {
      name: string
      description: string
      relevant_programs: string[]
    }
    soccer_roster_academic_fit: {
      intro: string
      players: Array<{
        name: string
        year: string
        major: string
        hometown: string
      }>
    }
    geographic_connection?: string
    student_life: string
    honest_reality_checks: string[]
  }

  part_2_program: {
    recent_performance: string[]
    coaching_transition?: string
    coaching_staff: string[]
    roster_shape: string
    where_they_recruit_from: string[]
    position_depth: string
  }

  part_3_coach: {
    quick_facts: {
      hometown?: string
      playing_position?: string
      at_program_since?: string
      latest_credential?: string
    }
    intro: string
    playing_career: string[]
    coaching_path: string[]
    education_credentials: string[]
    how_to_connect: string[]
  }

  part_4_questions: {
    intro: string
    categories: Array<{
      name: string
      questions: Array<{
        number: number
        question: string
        why_it_matters: string
      }>
    }>
  }

  closers: string[]
}

// ─── Prompt builders ───────────────────────────────────────────────────────

export function buildCallPrepSystemPrompt(): string {
  return `You are an experienced college soccer recruiting strategist preparing a call prep document for Finn Almond, a junior left wingback (Class of 2027).

You have access to web_search and web_fetch tools. You MUST use them extensively to research this school before producing the document. Do not rely on your training data alone — fetch live, current information.

PLAYER PROFILE:
- Name: Finn Almond, Class of 2027
- Position: Left Wingback (transitioned from striker, November 2025)
- Club: Albion SC Boulder County — MLS NEXT Academy U19
- Spring 2026 stats: 9W-2L-3D, started every game at LWB, 3 goals 2 assists
- GPA: 3.81 weighted / 3.56 unweighted
- SAT: 1380 (690 Math / 690 English), retaking fall 2026 targeting 1450+
- Primary academic interest: Chemistry (with strong interest in accelerated chemistry-to-engineering pathways like BS Chem / MAS Chemical Engineering programs)
- Secondary academic interest: Mechanical Engineering or Aerospace Engineering
- Honors: National Honor Society
- AP Courses: AP Calculus AB, AP Chemistry, AP U.S. History
- Senior year: AP Physics C, Calculus BC, AP Statistics, Discrete Math
- Summer team: Flatirons FC (USL Academy summer, UPSL fall/spring, Wales tour)
- High School: Alexander Dawson School, Lafayette, CO

═══════════════════════════════════════════════════════════════════
RESEARCH PROTOCOL — YOU MUST FOLLOW THIS SEQUENCE
═══════════════════════════════════════════════════════════════════

PHASE 1: Identify and fetch primary sources.
Every school has an athletics website. Find it and fetch these pages directly:
  a. The men's soccer ROSTER page (usually /sports/msoc/roster or /sports/mens-soccer/roster)
  b. The men's soccer COACHING STAFF page (usually /sports/msoc/coaches or the staff directory)
  c. The specific coach's BIO page (linked from the staff page)
  d. Recent SCHEDULE/RESULTS page for the most recent completed season

Do NOT skip this phase. The roster page is the single most important source — it contains player names, years, positions, hometowns, and often majors. Fetch it directly; do not rely on search snippets.

PHASE 2: Targeted web searches.
After fetching primary sources, run targeted searches:
  a. "[School] men's soccer [year] season record" — for win-loss record and postseason
  b. "[Coach name] [school] soccer" — for the coach's background, hire announcement, playing career
  c. "[School] mechanical engineering program" or "[School] aerospace engineering" — for academic fit
  d. "[School] accelerated engineering pathway" or "[School] 3/2 engineering" or "[School] BS MAS chemistry engineering" — for distinctive academic angles
  e. "[School] men's soccer awards [year]" — for standout players, conference honors

PHASE 3: Fill gaps.
After phases 1 and 2, check what you're still missing:
  - Coach's playing career and position? Search specifically for it.
  - Coach's hometown or education? Look harder at the bio page or search "[Coach] soccer playing career"
  - Colorado players on the roster? Scan the roster data you fetched.
  - Engineering/STEM majors on the roster? Same — scan for majors in the roster data.
  - Depth at Finn's position (left back, left wingback, D/M hybrid)? Analyze the roster.
  - Recent season record still unknown? Try "[School abbreviation] men's soccer [conference] standings [year]"

CRITICAL RULE: If your draft output would contain more than 2 "not available" or "information not found" statements, you have NOT researched enough. Go back and run more targeted searches and fetches before producing the output. Spending 15-25 tool calls is normal and expected. Err toward more research, not less.

═══════════════════════════════════════════════════════════════════
OUTPUT RULES
═══════════════════════════════════════════════════════════════════

1. Use SPECIFIC facts from your research. Generic filler ("the program has a strong tradition") fails this document.
2. Questions must have substantive "why it matters" explanations (2-3 sentences each). Generic rationale ("good question to ask") is a failure mode.
3. At least ONE question must reference specific feedback the coach gave in the communications thread. If no thread exists or no specific feedback was given, reference a specific program fact from research instead.
4. The "how to connect" bullets in Part 3 must be specific rapport levers based on the coach's actual background. "He values hard work" fails. "He came up through D3 and played center back — he understands the defensive side of the wingback role" succeeds.
5. For "Where we stand": use exact phrases from coach communications when available (e.g., "praised your technical ability and service from wide areas"). These are anchors.
6. Total questions: 9-12. Categories from: Program Vision, Formation & Fit, Roster & Playing Time, Development, Academics & Fit, Visit & Next Steps. Choose 4-5 that fit.
7. "honest_reality_checks" must be genuinely honest — academic reach, roster depth concerns, geographic distance, etc. This section earns trust.
8. Do NOT invent roster details, player names, or statistics not present in your research. If something genuinely isn't findable, say so — but this should be rare after thorough research.
9. Today's date is provided. Do not reference past events as future.

SECTION-SPECIFIC INSTRUCTIONS:

Recent Performance: Lead with positive achievements (overall record, tournament appearances, historic wins, notable individual awards) before noting losses or weaknesses. The framing should be balanced and factually complete, but not pessimistic. If the most recent game was a loss, include it but don't lead with it. Example: lead with "10-5-3 overall, advanced to NACC quarterfinals with a 3-0 win over #3 St. Norbert (the program's first NACC tournament win)" then add "lost to Aurora 5-4 in OT in the next round."

Academic Anchor and Part 1 Background: When identifying academic pathways, prioritize matches to Finn's stated majors. Finn's PRIMARY stated major is Chemistry, with strong interest in accelerated chemistry-to-engineering pathways (3/2 SLAC partnerships, accelerated BS/MAS programs like IIT's BS Chem / MAS Chemical Engineering). His SECONDARY interest is Mechanical or Aerospace Engineering. For each school, surface BOTH:
  - The school's relevant chemistry programs and any accelerated chemistry pathways
  - The school's engineering programs that align with Finn's secondary interest
If both exist, list chemistry first as it matches Finn's primary stated major, then engineering as a secondary anchor. If only one exists, lead with whichever is present.

When you have completed your research, produce the structured JSON output. Return ONLY valid JSON matching the schema — no markdown fences, no preamble, no trailing text.`
}

export function buildCallPrepUserPrompt(params: {
  school: SchoolRow
  targetCoach: CoachRow
  coaches: CoachRow[]
  contactHistory: ContactLogRow[]
  camps: CampRow[]
  declineHistory: ContactLogRow[]
  strategicNotes: string | null
  currentAssets: CurrentAssets
  framingNotes: string | null
  inventoryMessages: Array<{ title: string; type: string; notes: string | null }>
}): string {
  const {
    school, targetCoach, coaches, contactHistory, camps,
    declineHistory, strategicNotes, currentAssets,
    framingNotes, inventoryMessages,
  } = params

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'America/Denver',
  })

  const lines: string[] = []

  lines.push(`TODAY: ${today}`)
  lines.push('')
  lines.push('Please research the school below and produce a call prep document. Use your web_search and web_fetch tools to gather real, current information before writing the output.')
  lines.push('')

  // ── School context ──
  lines.push('=== SCHOOL CONTEXT ===')
  lines.push(`Name: ${school.name}`)
  lines.push(`Tier: ${school.category}`)
  lines.push(`Division: ${school.division}${school.conference ? ` — ${school.conference}` : ''}`)
  lines.push(`Location: ${school.location ?? 'Unknown'}`)
  lines.push(`Pipeline status: ${school.status}`)
  if (school.admit_likelihood) lines.push(`Admit likelihood: ${school.admit_likelihood}`)
  if (school.notes) lines.push(`School notes: ${school.notes}`)
  lines.push('')

  // ── Target coach ──
  lines.push('=== CALL IS WITH ===')
  lines.push(`${targetCoach.name} — ${targetCoach.role ?? 'Unknown role'}`)
  if (targetCoach.email) lines.push(`Email: ${targetCoach.email}`)
  lines.push(`Is primary contact: ${targetCoach.is_primary}`)
  if (targetCoach.needs_review) lines.push('⚠ This coach may have departed (needs_review flag)')
  lines.push('')

  // ── All coaches ──
  lines.push('=== ALL COACHING STAFF ===')
  for (const c of coaches) {
    const tags = [c.role ?? 'unknown role']
    if (c.is_primary) tags.push('PRIMARY')
    if (c.needs_review) tags.push('needs_review')
    if (c.email) tags.push(c.email)
    lines.push(`- ${c.name} (${tags.join(', ')})`)
  }
  lines.push('')

  // ── Framing notes ──
  if (framingNotes) {
    lines.push('=== FRAMING NOTES FROM RANDY/FINN ===')
    lines.push(framingNotes)
    lines.push('')
  }

  // ── Strategic notes ──
  if (strategicNotes) {
    lines.push('=== FINN\'S STRATEGIC NOTES FOR THIS SCHOOL ===')
    lines.push(strategicNotes)
    lines.push('')
  }

  // ── Camps ──
  lines.push('=== UPCOMING CAMPS AT THIS SCHOOL ===')
  if (camps.length > 0) {
    for (const c of camps) {
      const deadline = c.registration_deadline ? ` | Deadline: ${c.registration_deadline}` : ''
      lines.push(`- ${c.name} | ${c.start_date} – ${c.end_date} | ${c.location ?? ''} | Finn's status: ${c.status}${deadline}`)
    }
  } else {
    lines.push('None scheduled')
  }
  lines.push('')

  // ── Decline history ──
  if (declineHistory.length > 0) {
    lines.push('=== DECLINE HISTORY ===')
    for (const d of declineHistory) {
      lines.push(`- Declined on ${d.date}${d.coach_name ? ` by ${d.coach_name}` : ''}: ${(d.summary ?? '').slice(0, 400)}`)
    }
    lines.push('Note: Finn transitioned from striker to left wingback in Nov 2025. Any decline before that was based on a different position.')
    lines.push('')
  }

  // ── Current assets ──
  lines.push('=== FINN\'S CURRENT ASSETS ===')
  if (currentAssets.highlightReelUrl) lines.push(`- Highlight reel: ${currentAssets.highlightReelUrl} (${currentAssets.highlightReelTitle ?? 'current'})`)
  if (currentAssets.fullGameFilmUrl) lines.push(`- Full game film: ${currentAssets.fullGameFilmUrl}`)
  if (currentAssets.sportsRecruitsProfileUrl) lines.push(`- Sports Recruits: ${currentAssets.sportsRecruitsProfileUrl}`)
  lines.push('')

  // ── Inventory messages ──
  if (inventoryMessages.length > 0) {
    lines.push('=== FINN\'S ACTIVE MESSAGING INVENTORY ===')
    lines.push('These are things Finn wants to communicate to coaches. Some may be relevant to this call.')
    for (const m of inventoryMessages) {
      lines.push(`- [${m.type.toUpperCase()}] ${m.title}${m.notes ? ': ' + m.notes.slice(0, 200) : ''}`)
    }
    lines.push('')
  }

  // ── Full conversation history ──
  lines.push(`=== FULL CONVERSATION HISTORY (${contactHistory.length} entries, oldest first) ===`)
  if (contactHistory.length > 0) {
    for (const e of contactHistory) {
      lines.push(`[${e.date}] ${e.direction} via ${e.channel}${e.coach_name ? ` — ${e.coach_name}` : ''}`)
      lines.push(e.summary ?? '(no body)')
      lines.push('')
    }
  } else {
    lines.push('No contact logged yet — this is a cold first call.')
    lines.push('')
  }

  // ── Output instructions ──
  lines.push('=== OUTPUT INSTRUCTIONS ===')
  lines.push(`After completing your research, produce a JSON object matching this exact schema:
{
  "title": "${school.name}",
  "subtitle": "Men's Soccer",
  "call_with": "Call with ${targetCoach.role ?? 'Coach'} ${targetCoach.name}",
  "quick_reference": {
    "division_conference": "...",
    "head_coach": "...",
    "point_of_contact": "...",
    "recent_results": "...",
    "engineering": "...",
    "academic_anchor": "...",
    "location": "..."
  },
  "where_we_stand": "2-3 paragraphs...",
  "part_1_background": {
    "university": "1-2 paragraphs",
    "what_makes_distinctive": "1-2 paragraphs",
    "academic_program": {
      "name": "...",
      "description": "1-2 paragraphs",
      "relevant_programs": ["...", "..."]
    },
    "soccer_roster_academic_fit": {
      "intro": "...",
      "players": [{"name": "...", "year": "...", "major": "...", "hometown": "..."}]
    },
    "geographic_connection": "...",
    "student_life": "1 paragraph",
    "honest_reality_checks": ["...", "..."]
  },
  "part_2_program": {
    "recent_performance": ["...", "..."],
    "coaching_transition": "...",
    "coaching_staff": ["...", "..."],
    "roster_shape": "1-2 paragraphs",
    "where_they_recruit_from": ["...", "..."],
    "position_depth": "1-2 paragraphs"
  },
  "part_3_coach": {
    "quick_facts": {
      "hometown": "...",
      "playing_position": "...",
      "at_program_since": "...",
      "latest_credential": "..."
    },
    "intro": "1 paragraph",
    "playing_career": ["...", "..."],
    "coaching_path": ["...", "..."],
    "education_credentials": ["...", "..."],
    "how_to_connect": ["...", "..."]
  },
  "part_4_questions": {
    "intro": "Brief paragraph about count and suggested order",
    "categories": [
      {
        "name": "Formation & Fit",
        "questions": [
          {
            "number": 1,
            "question": "...",
            "why_it_matters": "2-3 sentences"
          }
        ]
      }
    ]
  },
  "closers": ["...", "..."]
}

Return ONLY the JSON. No markdown, no fences, no commentary.`)

  return lines.join('\n')
}
