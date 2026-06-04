/**
 * call-prep-pdf.tsx
 *
 * Generates a formatted PDF call prep document from structured JSON output.
 * Uses @react-pdf/renderer with Helvetica (PDF built-in, visually identical
 * to Arial at 11pt body).
 *
 * Replaces call-prep-docx.ts — same content structure, PDF output instead of docx.
 *
 * Formatting: US Letter, 1" margins, Helvetica 11pt body, school accent color.
 * Heading hierarchy: H1 (parts + cover), H2 (sections), H3 (sub-sections).
 */

import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { CallPrepOutput } from './call-prep-prompt'

// ─── School accent colors (darker, refined shades) ────────────────────────

const SCHOOL_COLORS: Record<string, string> = {
  'illinois tech': '#8B1A1A', 'iit': '#8B1A1A', 'rit': '#8B1A1A',
  'rpi': '#8B1A1A', 'cornell': '#8B1A1A', 'stevens': '#8B1A1A',
  'mit': '#8B1A1A', 'stanford': '#8B1A1A', 'msoe': '#8B1A1A',
  'wpi': '#8B1A1A', 'clark': '#8B1A1A', 'colgate': '#8B1A1A',
  'lafayette': '#8B1A1A',
  'rochester': '#0D3D7A', 'case western': '#0D3D7A', 'colby': '#0D3D7A',
  'middlebury': '#0D3D7A', 'emory': '#0D3D7A', 'sd mines': '#0D3D7A',
  'cal poly': '#1F3A2F', 'dartmouth': '#1F3A2F', 'mines': '#1F3A2F',
  'lehigh': '#8B6F00',
  'amherst': '#3D2A52', 'williams': '#3D2A52', 'northwestern': '#3D2A52',
  'princeton': '#8B6F00',
  'bowdoin': '#1A1A1A',
}

function getAccentColor(schoolName: string): string {
  const lower = schoolName.toLowerCase()
  for (const [key, color] of Object.entries(SCHOOL_COLORS)) {
    if (lower.includes(key)) return color
  }
  return '#1A1A1A'
}

// ─── Styles ───────────────────────────────────────────────────────────────

const base = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 11,
    color: '#1A1A1A',
    paddingTop: 54,    // ~0.75"
    paddingBottom: 54,
    paddingLeft: 72,   // 1"
    paddingRight: 72,
    lineHeight: 1.5,
  },
  body: { marginBottom: 8 },
  bullet: { marginBottom: 4, paddingLeft: 14 },
  bulletDot: { position: 'absolute', left: 0, top: 0 },
  labelRow: { flexDirection: 'row', marginBottom: 4 },
  labelKey: { fontFamily: 'Helvetica-Bold', fontSize: 11 },
  labelVal: { fontSize: 11 },
  hr: {
    borderBottomWidth: 0.5,
    borderBottomColor: '#CCCCCC',
    marginTop: 14,
    marginBottom: 14,
  },
})

// ─── Reusable elements ────────────────────────────────────────────────────

function H1({ children, accent }: { children: string; accent: string }) {
  return (
    <Text style={{
      fontFamily: 'Helvetica-Bold', fontSize: 18, color: accent,
      marginTop: 20, marginBottom: 10,
    }}>
      {children}
    </Text>
  )
}

function H2({ children }: { children: string }) {
  return (
    <Text style={{
      fontFamily: 'Helvetica-Bold', fontSize: 14, color: '#1A1A1A',
      marginTop: 16, marginBottom: 8,
    }}>
      {children}
    </Text>
  )
}

function H3({ children }: { children: string }) {
  return (
    <Text style={{
      fontFamily: 'Helvetica-Bold', fontSize: 12, color: '#1A1A1A',
      marginTop: 12, marginBottom: 6,
    }}>
      {children}
    </Text>
  )
}

function Body({ children }: { children: string }) {
  return <Text style={base.body}>{children}</Text>
}

function Bullet({ children }: { children: string }) {
  return (
    <View style={base.bullet}>
      <Text style={base.bulletDot}>{'\u2022'}</Text>
      <Text>{children}</Text>
    </View>
  )
}

function LabelValue({ label, value }: { label: string; value: string }) {
  return (
    <Text style={base.labelRow}>
      <Text style={base.labelKey}>{label}: </Text>
      <Text style={base.labelVal}>{value}</Text>
    </Text>
  )
}

function Hr() {
  return <View style={base.hr} />
}

function Paras({ text }: { text: string }) {
  return (
    <>
      {text.split('\n\n').filter(p => p.trim()).map((p, i) => (
        <Body key={i}>{p.trim()}</Body>
      ))}
    </>
  )
}

// ─── Document component ───────────────────────────────────────────────────

function CallPrepDocument({ data }: { data: CallPrepOutput }) {
  const accent = getAccentColor(data.title)

  let globalNum = 0

  return (
    <Document>
      {/* Page 1: Cover + Quick Ref + Where We Stand */}
      <Page size="LETTER" style={base.page}>
        <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 22, color: accent }}>
          {data.title}
        </Text>
        <Text style={{ fontSize: 14, color: '#666666', marginTop: 4 }}>
          {data.subtitle}
        </Text>
        <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 12, color: '#333333', marginTop: 4, marginBottom: 14 }}>
          {data.call_with}
        </Text>

        <Hr />

        <H2>Quick Reference</H2>
        <LabelValue label="Division / Conference" value={data.quick_reference.division_conference} />
        <LabelValue label="Head Coach" value={data.quick_reference.head_coach} />
        {data.quick_reference.point_of_contact ? (
          <LabelValue label="Point of Contact" value={data.quick_reference.point_of_contact} />
        ) : null}
        <LabelValue label="Recent Results" value={data.quick_reference.recent_results} />
        {data.quick_reference.engineering ? (
          <LabelValue label="Engineering" value={data.quick_reference.engineering} />
        ) : null}
        <LabelValue label="Academic Anchor" value={data.quick_reference.academic_anchor} />
        <LabelValue label="Location" value={data.quick_reference.location} />

        <Hr />

        <H2>Where We Stand Today</H2>
        <Paras text={data.where_we_stand} />
      </Page>

      {/* Page 2: Part 1 — Background */}
      <Page size="LETTER" style={base.page}>
        <H1 accent={accent}>Part 1 — Background</H1>

        <H2>The University</H2>
        <Paras text={data.part_1_background.university} />

        <H2>What Makes It Distinctive</H2>
        <Paras text={data.part_1_background.what_makes_distinctive} />

        <H3>{data.part_1_background.academic_program.name}</H3>
        <Paras text={data.part_1_background.academic_program.description} />
        {data.part_1_background.academic_program.relevant_programs.map((prog, i) => (
          <Bullet key={i}>{prog}</Bullet>
        ))}

        {data.part_1_background.soccer_roster_academic_fit.players.length > 0 ? (
          <View>
            <H3>Soccer × Academics — Roster Fit</H3>
            <Body>{data.part_1_background.soccer_roster_academic_fit.intro}</Body>
            {data.part_1_background.soccer_roster_academic_fit.players.map((p, i) => (
              <Bullet key={i}>{`${p.name} (${p.year}) — ${p.major} — ${p.hometown}`}</Bullet>
            ))}
          </View>
        ) : null}

        {data.part_1_background.geographic_connection ? (
          <View>
            <H3>Geographic Connection</H3>
            <Body>{data.part_1_background.geographic_connection}</Body>
          </View>
        ) : null}

        <H3>Student Life</H3>
        <Body>{data.part_1_background.student_life}</Body>

        <H3>Honest Reality Checks</H3>
        {data.part_1_background.honest_reality_checks.map((check, i) => (
          <Bullet key={i}>{check}</Bullet>
        ))}
      </Page>
      {/* Page 3: Part 2 — The Program */}
      <Page size="LETTER" style={base.page}>
        <H1 accent={accent}>Part 2 — The Program</H1>

        <H2>Recent Performance</H2>
        {data.part_2_program.recent_performance.map((item, i) => (
          <Bullet key={i}>{item}</Bullet>
        ))}

        {data.part_2_program.coaching_transition ? (
          <View>
            <H2>Coaching Transition</H2>
            <Body>{data.part_2_program.coaching_transition}</Body>
          </View>
        ) : null}

        <H2>Coaching Staff</H2>
        {data.part_2_program.coaching_staff.map((item, i) => (
          <Bullet key={i}>{item}</Bullet>
        ))}

        <H2>Roster Shape</H2>
        <Paras text={data.part_2_program.roster_shape} />

        <H2>Where They Recruit From</H2>
        {data.part_2_program.where_they_recruit_from.map((item, i) => (
          <Bullet key={i}>{item}</Bullet>
        ))}

        <H2>Position Depth — Left Wingback</H2>
        <Paras text={data.part_2_program.position_depth} />
      </Page>
      {/* Page 4: Part 3 — The Coach */}
      <Page size="LETTER" style={base.page}>
        <H1 accent={accent}>Part 3 — The Coach</H1>

        <H2>Quick Facts</H2>
        {data.part_3_coach.quick_facts.hometown ? (
          <LabelValue label="Hometown" value={data.part_3_coach.quick_facts.hometown} />
        ) : null}
        {data.part_3_coach.quick_facts.playing_position ? (
          <LabelValue label="Playing Position" value={data.part_3_coach.quick_facts.playing_position} />
        ) : null}
        {data.part_3_coach.quick_facts.at_program_since ? (
          <LabelValue label="At Program Since" value={data.part_3_coach.quick_facts.at_program_since} />
        ) : null}
        {data.part_3_coach.quick_facts.latest_credential ? (
          <LabelValue label="Latest Credential" value={data.part_3_coach.quick_facts.latest_credential} />
        ) : null}

        <Body>{data.part_3_coach.intro}</Body>

        <H2>Playing Career</H2>
        {data.part_3_coach.playing_career.map((item, i) => (
          <Bullet key={i}>{item}</Bullet>
        ))}

        <H2>Coaching Path</H2>
        {data.part_3_coach.coaching_path.map((item, i) => (
          <Bullet key={i}>{item}</Bullet>
        ))}

        <H2>Education & Credentials</H2>
        {data.part_3_coach.education_credentials.map((item, i) => (
          <Bullet key={i}>{item}</Bullet>
        ))}

        <H2>How to Connect with Him</H2>
        {data.part_3_coach.how_to_connect.map((item, i) => (
          <Bullet key={i}>{item}</Bullet>
        ))}
      </Page>
      {/* Page 5: Part 4 — Questions + Closers */}
      <Page size="LETTER" style={base.page}>
        <H1 accent={accent}>Part 4 — Questions for the Call</H1>
        <Body>{data.part_4_questions.intro}</Body>

        {data.part_4_questions.categories.map((cat) => (
          <View key={cat.name}>
            <H2>{cat.name}</H2>
            {cat.questions.map((q) => {
              globalNum++
              return (
                <View key={q.number} style={{ marginBottom: 10 }}>
                  <Text style={{ fontSize: 10, marginBottom: 3 }}>
                    <Text style={{ fontFamily: 'Helvetica-Bold', color: accent }}>
                      {'QUESTION '}{globalNum}
                    </Text>
                    <Text style={{ color: '#5A5A5A' }}>
                      {'   \u2022   '}{cat.name}
                    </Text>
                  </Text>
                  <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 12, marginBottom: 4 }}>
                    {q.question}
                  </Text>
                  <Text style={{ fontSize: 11, color: '#5A5A5A' }}>
                    <Text style={{ fontFamily: 'Helvetica-BoldOblique' }}>{'Why it matters: '}</Text>
                    <Text style={{ fontFamily: 'Helvetica-Oblique' }}>{q.why_it_matters}</Text>
                  </Text>
                </View>
              )
            })}
          </View>
        ))}

        <H2>Closing Moves</H2>
        {data.closers.map((closer, i) => (
          <Bullet key={i}>{closer}</Bullet>
        ))}

        <Hr />
        <Text style={{ fontSize: 10, color: '#999999', marginTop: 8 }}>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>{'POST-CALL: '}</Text>
          <Text style={{ fontStyle: 'italic' }}>
            {'Send a thank-you email within 24 hours. Reference something specific from the conversation.'}
          </Text>
        </Text>
      </Page>
    </Document>
  )
}

// ─── Public API ───────────────────────────────────────────────────────────

export async function generateCallPrepPdf(data: CallPrepOutput): Promise<Buffer> {
  const { renderToBuffer } = await import('@react-pdf/renderer')
  const element = <CallPrepDocument data={data} />
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(element as any)
  return Buffer.from(buffer)
}
