'use client'

import { useState } from 'react'
import type { School } from '@/lib/types'

interface EmailTemplate {
  id: string
  name: string
  description: string
  generate: (school: School) => { subject: string; body: string }
}

function coachLastName(school: School): string {
  if (!school.head_coach) return '[COACH]'
  const name = school.head_coach.split('–')[0].split('-')[0]
    .replace(/Head Coach|Assistant Coach/gi, '').trim()
  return name.split(' ').filter(Boolean).pop() || '[COACH]'
}

const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'first_contact',
    name: 'First Contact / Introduction',
    description: "Initial email to a coach you haven't contacted yet.",
    generate: (school) => ({
      subject: `Class of 2027 Left Wingback — Interested in ${school.short_name || school.name}`,
      body: `Coach ${coachLastName(school)},

My name is Finn Almond and I'm a Class of 2027 left wingback from Lafayette, CO. I play for Albion SC Boulder County in the MLS NEXT Academy (U19) and attend Alexander Dawson School.

I'm reaching out because I'm very interested in ${school.name} — both the ${school.division === 'D1' ? `competitiveness of the ${school.conference || ''} program` : `quality of the program`} and the academic opportunities, particularly in engineering. I'm pursuing mechanical/aerospace engineering and your school stands out for the combination of strong academics and competitive soccer.

A bit about me:
• Position: Left Wingback — strong attacking background as a striker/CAM
• Left-footed, comfortable with right | 5'11" / 165 lbs
• NCAA ID: 2405288624
• GPA: 3.57 UW / 3.78 W | AP Calc AB, AP Chem, AP US History, Mandarin | National Honor Society
• SAT: 1340 (Math 690, EBRW 650)
• 2024 HS Season (Junior): 29 goals, 14 assists in 16 games — 2nd Team All-State, 1st Team All-Conference, Team MVP
• 2025–26 Club Season: 13 games at left wingback, Albion SC Boulder County MLS NEXT Academy U19

Highlight Reel: https://www.youtube.com/watch?v=Va_Z09OYcs0
Full-Game Film: https://youtu.be/Zzp-YMma_8g

I'd love to learn more about your program and what you look for in recruits. Would you be open to a conversation?

Thank you for your time,
Finn Almond
finnalmond08@gmail.com
(720) 687-8982
Sports Recruits: https://my.sportsrecruits.com/athlete/finn_almond`,
    }),
  },
  {
    id: 'wingback_update',
    name: 'Wingback Reel Update',
    description: "Share an updated highlight reel with a coach you've already contacted.",
    generate: (school) => ({
      subject: `Updated Highlight Reel — Finn Almond, 2027 Left Wingback`,
      body: `Coach ${coachLastName(school)},

I hope you're doing well. I wanted to share an update and my latest highlight reel showcasing my play at left wingback this season with Albion SC Boulder County in MLS NEXT.

This reel highlights overlapping runs, set piece delivery, 1v1 defending, transition play, and pressing — reflecting my development as a two-way wingback built on a strong attacking background.

Highlight Reel: https://www.youtube.com/watch?v=Va_Z09OYcs0
Full-Game Film: https://youtu.be/Zzp-YMma_8g

Quick update:
• 2025–26 Club: 13 games at left wingback, Albion SC Boulder County MLS NEXT Academy U19
• Most recent event: MLS NEXT Cup Qualifiers, Scottsdale, AZ (April 2026)
• 2024 HS Season: 29 goals, 14 assists in 16 games — 2nd Team All-State, Team MVP
• GPA: 3.57 UW / 3.78 W | SAT: 1340 (Math 690) | National Honor Society
• Strong interest in mechanical/aerospace engineering at ${school.short_name || school.name}

I'd love to continue the conversation. Are there any upcoming ID camps or opportunities to connect?

Thank you,
Finn Almond
finnalmond08@gmail.com
(720) 687-8982
NCAA ID: 2405288624`,
    }),
  },
  {
    id: 'post_event',
    name: 'Post-Event Follow-Up',
    description: "Follow up after a showcase, tournament, or ID camp.",
    generate: (school) => ({
      subject: `Follow-Up: Finn Almond — 2027 Left Wingback, Albion SC MLS NEXT`,
      body: `Coach ${coachLastName(school)},

Thank you for taking the time at [EVENT NAME]. I really enjoyed [learning about your program / the camp / competing in front of your staff].

As a reminder, I'm Finn Almond — a Class of 2027 left wingback playing for Albion SC Boulder County in MLS NEXT. I wore #[NUMBER] and played [WHICH GAMES/HALVES].

A few things I wanted to highlight from the event:
• [SPECIFIC MOMENT — e.g., "I felt good about my overlapping run and cross in the second half"]
• [ANOTHER SPECIFIC MOMENT]

I'm continuing to develop as a two-way wingback and ${school.name} is a top choice for both the soccer program and engineering opportunities.

Highlight Reel: https://www.youtube.com/watch?v=Va_Z09OYcs0
Full-Game Film: https://youtu.be/Zzp-YMma_8g

I'd love to keep the conversation going. Would it be possible to schedule a call or visit?

Thank you,
Finn Almond
finnalmond08@gmail.com
(720) 687-8982
NCAA ID: 2405288624`,
    }),
  },
  {
    id: 'campus_visit',
    name: 'Request Campus Visit',
    description: "Ask to schedule an unofficial visit or meet with coaching staff.",
    generate: (school) => ({
      subject: `Unofficial Visit Request — Finn Almond, 2027 Left Wingback`,
      body: `Coach ${coachLastName(school)},

I hope your season is going well. I'm writing to see if I could schedule an unofficial visit to ${school.short_name || school.name} this [summer/fall]. I'm very interested in your program and would love the chance to see campus, meet the coaching staff, and get a feel for the team culture.

I'm a Class of 2027 left wingback from Albion SC Boulder County (MLS NEXT Academy). I'm pursuing mechanical/aerospace engineering and ${school.name} is high on my list for the combination of competitive soccer and strong academics.

A quick snapshot:
• GPA: 3.57 UW / 3.78 W | SAT: 1340 | National Honor Society
• 2024 HS Season: 29 goals, 14 assists — 2nd Team All-State, Team MVP
• NCAA ID: 2405288624

Highlight Reel: https://www.youtube.com/watch?v=Va_Z09OYcs0

I'm flexible on dates — would any time in [MONTH RANGE] work?

Thank you for your time,
Finn Almond
finnalmond08@gmail.com
(720) 687-8982`,
    }),
  },
  {
    id: 'academic_update',
    name: 'Academic / Season Update',
    description: "Send an academic or season results update to a coach.",
    generate: (school) => ({
      subject: `Academic & Season Update — Finn Almond, 2027 Left Wingback`,
      body: `Coach ${coachLastName(school)},

I wanted to send a quick update on my academics and season.

Academic Update:
• GPA: 3.57 UW / 3.78 W (Cumulative) | National Honor Society
• Current coursework: AP Calculus AB, AP Chemistry, AP US History, Mandarin
• SAT: 1340 (Math 690, EBRW 650) — [planning to retake in DATE if applicable]
• AP Human Geography: scored 4
• Pursuing mechanical/aerospace engineering

Season Update:
• 2025–26 Club: 13 games at left wingback, Albion SC Boulder County MLS NEXT Academy U19
• Most recent: MLS NEXT Cup Qualifiers, Scottsdale, AZ (April 2026)
• 2024 HS Season: 29 goals, 14 assists in 16 games — 2nd Team All-State, 1st Team All-Conference, Team MVP

${school.name} remains a top choice for me. I'd love to stay in touch and hear about upcoming opportunities to connect.

Highlight Reel: https://www.youtube.com/watch?v=Va_Z09OYcs0
Full-Game Film: https://youtu.be/Zzp-YMma_8g

Thank you,
Finn Almond
finnalmond08@gmail.com
(720) 687-8982
NCAA ID: 2405288624`,
    }),
  },
]

export default function EmailDraftsPanel({ schools }: { schools: School[] }) {
  const [selectedSchoolId, setSelectedSchoolId] = useState('')
  const [activeTmpl, setActiveTmpl] = useState<EmailTemplate | null>(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [copied, setCopied] = useState(false)

  const activeSchools = schools
    .filter(s => s.category !== 'Nope' && s.status !== 'Inactive')
    .sort((a, b) => a.name.localeCompare(b.name))
  const selectedSchool = schools.find(s => s.id === selectedSchoolId)

  function openTemplate(tmpl: EmailTemplate) {
    if (!selectedSchool) return
    const generated = tmpl.generate(selectedSchool)
    setSubject(generated.subject)
    setBody(generated.body)
    setActiveTmpl(tmpl)
  }

  function copyAll() {
    navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }
  function copyBody() {
    navigator.clipboard.writeText(body).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: '#64748b', marginTop: 0, marginBottom: 14 }}>
        Pick a school and a template to generate a draft pre-filled with Finn's info. Edit before sending.
      </p>

      {/* School picker */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Select School</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {activeSchools.map(s => (
            <button
              key={s.id}
              onClick={() => { setSelectedSchoolId(s.id); setActiveTmpl(null) }}
              style={{
                padding: '4px 10px', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit',
                border: selectedSchoolId === s.id ? '2px solid #2563eb' : '1px solid #e5e7eb',
                background: selectedSchoolId === s.id ? '#eff6ff' : '#fff',
                fontSize: 11.5, fontWeight: selectedSchoolId === s.id ? 700 : 500,
                color: selectedSchoolId === s.id ? '#1e40af' : '#475569',
              }}
            >
              {s.short_name || s.name}
            </button>
          ))}
        </div>
      </div>

      {/* Template selection or draft editor */}
      {!selectedSchool ? (
        <div style={{ background: '#fff', borderRadius: 10, padding: 30, textAlign: 'center', color: '#94a3b8', border: '1px solid #e5e7eb' }}>
          Select a school above to see available email templates.
        </div>
      ) : !activeTmpl ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            Templates for <span style={{ color: '#2563eb' }}>{selectedSchool.short_name || selectedSchool.name}</span>
            <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: 8 }}>Status: {selectedSchool.status}</span>
          </div>
          {EMAIL_TEMPLATES.map(tmpl => (
            <div
              key={tmpl.id}
              onClick={() => openTemplate(tmpl)}
              style={{ background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', padding: '14px 18px', cursor: 'pointer', transition: 'all 0.1s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(59,130,246,0.1)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none' }}
            >
              <div style={{ fontWeight: 700, fontSize: 13.5, color: '#0f172a', marginBottom: 3 }}>{tmpl.name}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>{tmpl.description}</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => setActiveTmpl(null)} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', color: '#475569' }}>← Back</button>
            <span style={{ fontSize: 13, color: '#64748b' }}>To: <span style={{ color: '#2563eb' }}>{selectedSchool.coach_email}</span></span>
          </div>
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#92400e' }}>
            Edit the bracketed placeholders <strong>[LIKE THIS]</strong> before copying. Customize for this specific coach.
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>Subject</div>
            <input value={subject} onChange={e => setSubject(e.target.value)} style={{ width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>Body</div>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={18} style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12.5, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.6 }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: copied ? '#059669' : 'transparent', fontWeight: 600, transition: 'color 0.2s' }}>{copied ? 'Copied!' : '.'}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={copyBody} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', background: '#f1f5f9', color: '#475569' }}>Copy Body</button>
              <button onClick={copyAll} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', background: '#0f172a', color: '#fff' }}>Copy All</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
