/**
 * call-prep-docx.ts
 *
 * Generates a formatted .docx call prep document from structured JSON output.
 * Uses the `docx` library. Matches the structure and formatting of the
 * Rochester_Call_Prep and IIT_Call_Prep reference documents.
 *
 * Formatting: US Letter, 1" margins, Arial 11pt body, school accent color.
 * Heading hierarchy: H1 (parts + cover), H2 (sections), H3 (sub-sections).
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  PageBreak,
  BorderStyle,
  SectionType,
  convertInchesToTwip,
  type IStylesOptions,
} from 'docx'

import type { CallPrepOutput } from './call-prep-prompt'

// ─── School accent colors (darker, refined shades) ────────────────────────

const SCHOOL_COLORS: Record<string, string> = {
  // Dark red schools
  'illinois tech': '8B1A1A',
  'iit': '8B1A1A',
  'rit': '8B1A1A',
  'rpi': '8B1A1A',
  'cornell': '8B1A1A',
  'stevens': '8B1A1A',
  'mit': '8B1A1A',
  'stanford': '8B1A1A',
  'msoe': '8B1A1A',
  'wpi': '8B1A1A',
  'clark': '8B1A1A',
  'colgate': '8B1A1A',
  'lafayette': '8B1A1A',
  // Dark navy / blue schools
  'rochester': '0D3D7A',
  'case western': '0D3D7A',
  'colby': '0D3D7A',
  'middlebury': '0D3D7A',
  'emory': '0D3D7A',
  'sd mines': '0D3D7A',
  // Dark green schools
  'cal poly': '1F3A2F',
  'dartmouth': '1F3A2F',
  'mines': '1F3A2F',
  // Dark gold / brown schools
  'lehigh': '8B6F00',
  // Deep purple schools
  'amherst': '3D2A52',
  'williams': '3D2A52',
  'northwestern': '3D2A52',
  // Orange → dark gold
  'princeton': '8B6F00',
  // Black
  'bowdoin': '1A1A1A',
}

function getAccentColor(schoolName: string): string {
  const lower = schoolName.toLowerCase()
  for (const [key, color] of Object.entries(SCHOOL_COLORS)) {
    if (lower.includes(key)) return color
  }
  return '1A1A1A'
}

// ─── Style definitions ────────────────────────────────────────────────────

function buildStyles(accent: string): IStylesOptions {
  return {
    default: {
      document: {
        run: { font: 'Arial', size: 22 },
      },
    },
    paragraphStyles: [
      {
        id: 'Heading1',
        name: 'Heading 1',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { size: 36, bold: true, font: 'Arial', color: accent },
        paragraph: { spacing: { before: 320, after: 160 } },
      },
      {
        id: 'Heading2',
        name: 'Heading 2',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { size: 28, bold: true, font: 'Arial', color: '1A1A1A' },
        paragraph: { spacing: { before: 260, after: 120 } },
      },
      {
        id: 'Heading3',
        name: 'Heading 3',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { size: 24, bold: true, font: 'Arial', color: '1A1A1A' },
        paragraph: { spacing: { before: 200, after: 80 } },
      },
    ],
  }
}

// ─── Paragraph helpers ────────────────────────────────────────────────────

function h1(text: string): Paragraph {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] })
}

function h2(text: string): Paragraph {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] })
}

function h3(text: string): Paragraph {
  return new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(text)] })
}

function body(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, font: 'Arial', size: 22 })],
  })
}

function bullet(text: string): Paragraph {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 60 },
    children: [new TextRun({ text, font: 'Arial', size: 22 })],
  })
}

function labelValue(label: string, value: string): Paragraph {
  return new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({ text: `${label}: `, font: 'Arial', size: 22, bold: true }),
      new TextRun({ text: value, font: 'Arial', size: 22 }),
    ],
  })
}

function hr(): Paragraph {
  return new Paragraph({
    spacing: { before: 200, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' } },
    children: [new TextRun({ text: '', font: 'Arial', size: 2 })],
  })
}

function pb(): Paragraph {
  return new Paragraph({ children: [new PageBreak()] })
}

function splitParas(text: string, fn: (t: string) => Paragraph): Paragraph[] {
  return text.split('\n\n').filter(p => p.trim()).map(p => fn(p.trim()))
}

// ─── Document generator ────────────────────────────────────────────────────

export async function generateCallPrepDocx(data: CallPrepOutput): Promise<Buffer> {
  const accent = getAccentColor(data.title)
  const children: Paragraph[] = []

  // ── Cover block ──────────────────────────────────────────────────────────

  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { after: 40 },
    children: [new TextRun({ text: data.title, font: 'Arial', size: 44, bold: true, color: accent })],
  }))

  children.push(new Paragraph({
    spacing: { after: 40 },
    children: [new TextRun({ text: data.subtitle, font: 'Arial', size: 28, color: '666666' })],
  }))

  children.push(new Paragraph({
    spacing: { after: 240 },
    children: [new TextRun({ text: data.call_with, font: 'Arial', size: 24, bold: true, color: '333333' })],
  }))

  children.push(hr())

  // ── Quick Reference ──────────────────────────────────────────────────────

  children.push(h2('Quick Reference'))

  const qr = data.quick_reference
  children.push(labelValue('Division / Conference', qr.division_conference))
  children.push(labelValue('Head Coach', qr.head_coach))
  if (qr.point_of_contact) children.push(labelValue('Point of Contact', qr.point_of_contact))
  children.push(labelValue('Recent Results', qr.recent_results))
  if (qr.engineering) children.push(labelValue('Engineering', qr.engineering))
  children.push(labelValue('Academic Anchor', qr.academic_anchor))
  children.push(labelValue('Location', qr.location))

  children.push(hr())

  // ── Where We Stand ──────────────────────────────────────────────────────

  children.push(h2('Where We Stand Today'))
  children.push(...splitParas(data.where_we_stand, body))

  children.push(pb())

  // ── Part 1: Background ──────────────────────────────────────────────────

  children.push(h1('Part 1 — Background'))

  children.push(h2('The University'))
  children.push(...splitParas(data.part_1_background.university, body))

  children.push(h2('What Makes It Distinctive'))
  children.push(...splitParas(data.part_1_background.what_makes_distinctive, body))

  children.push(h3(data.part_1_background.academic_program.name))
  children.push(...splitParas(data.part_1_background.academic_program.description, body))
  for (const prog of data.part_1_background.academic_program.relevant_programs) {
    children.push(bullet(prog))
  }

  // Soccer roster academic fit
  const fit = data.part_1_background.soccer_roster_academic_fit
  if (fit.players.length > 0) {
    children.push(h3('Soccer × Academics — Roster Fit'))
    children.push(body(fit.intro))
    for (const p of fit.players) {
      children.push(bullet(`${p.name} (${p.year}) — ${p.major} — ${p.hometown}`))
    }
  }

  if (data.part_1_background.geographic_connection) {
    children.push(h3('Geographic Connection'))
    children.push(body(data.part_1_background.geographic_connection))
  }

  children.push(h3('Student Life'))
  children.push(body(data.part_1_background.student_life))

  children.push(h3('Honest Reality Checks'))
  for (const check of data.part_1_background.honest_reality_checks) {
    children.push(bullet(check))
  }

  children.push(pb())

  // ── Part 2: The Program ─────────────────────────────────────────────────

  children.push(h1('Part 2 — The Program'))

  children.push(h2('Recent Performance'))
  for (const item of data.part_2_program.recent_performance) {
    children.push(bullet(item))
  }

  if (data.part_2_program.coaching_transition) {
    children.push(h2('Coaching Transition'))
    children.push(body(data.part_2_program.coaching_transition))
  }

  children.push(h2('Coaching Staff'))
  for (const item of data.part_2_program.coaching_staff) {
    children.push(bullet(item))
  }

  children.push(h2('Roster Shape'))
  children.push(...splitParas(data.part_2_program.roster_shape, body))

  children.push(h2('Where They Recruit From'))
  for (const item of data.part_2_program.where_they_recruit_from) {
    children.push(bullet(item))
  }

  children.push(h2('Position Depth — Left Wingback'))
  children.push(...splitParas(data.part_2_program.position_depth, body))

  children.push(pb())

  // ── Part 3: The Coach ───────────────────────────────────────────────────

  children.push(h1('Part 3 — The Coach'))

  // Quick facts
  children.push(h2('Quick Facts'))
  const qf = data.part_3_coach.quick_facts
  if (qf.hometown) children.push(labelValue('Hometown', qf.hometown))
  if (qf.playing_position) children.push(labelValue('Playing Position', qf.playing_position))
  if (qf.at_program_since) children.push(labelValue('At Program Since', qf.at_program_since))
  if (qf.latest_credential) children.push(labelValue('Latest Credential', qf.latest_credential))

  children.push(body(data.part_3_coach.intro))

  children.push(h2('Playing Career'))
  for (const item of data.part_3_coach.playing_career) {
    children.push(bullet(item))
  }

  children.push(h2('Coaching Path'))
  for (const item of data.part_3_coach.coaching_path) {
    children.push(bullet(item))
  }

  children.push(h2('Education & Credentials'))
  for (const item of data.part_3_coach.education_credentials) {
    children.push(bullet(item))
  }

  children.push(h2('How to Connect with Him'))
  for (const item of data.part_3_coach.how_to_connect) {
    children.push(bullet(item))
  }

  children.push(pb())

  // ── Part 4: Questions ───────────────────────────────────────────────────

  children.push(h1('Part 4 — Questions for the Call'))
  children.push(body(data.part_4_questions.intro))

  let globalNum = 0
  for (const cat of data.part_4_questions.categories) {
    // Category header as H2
    children.push(h2(cat.name))

    for (const q of cat.questions) {
      globalNum++

      // Question label: two runs — "QUESTION N" in accent + "   •   Category" in gray
      children.push(new Paragraph({
        spacing: { before: 200, after: 40 },
        children: [
          new TextRun({
            text: `QUESTION ${globalNum}`,
            font: 'Arial',
            size: 20,
            bold: true,
            color: accent,
          }),
          new TextRun({
            text: `   \u2022   ${cat.name}`,
            font: 'Arial',
            size: 20,
            color: '5A5A5A',
          }),
        ],
      }))

      // Question text (bold, 12pt)
      children.push(new Paragraph({
        spacing: { before: 40, after: 80 },
        children: [
          new TextRun({
            text: q.question,
            font: 'Arial',
            size: 24,
            bold: true,
          }),
        ],
      }))

      // Why it matters (italic label in muted gray, text in default color, 11pt)
      children.push(new Paragraph({
        spacing: { before: 40, after: 80 },
        children: [
          new TextRun({
            text: 'Why it matters: ',
            font: 'Arial',
            size: 22,
            italics: true,
            bold: true,
            color: '5A5A5A',
          }),
          new TextRun({
            text: q.why_it_matters,
            font: 'Arial',
            size: 22,
            italics: true,
            color: '5A5A5A',
          }),
        ],
      }))
    }
  }

  // ── Closers ──────────────────────────────────────────────────────────────

  children.push(h2('Closing Moves'))
  for (const closer of data.closers) {
    children.push(bullet(closer))
  }

  // ── Post-call reminder ───────────────────────────────────────────────────

  children.push(hr())
  children.push(new Paragraph({
    spacing: { before: 120 },
    children: [
      new TextRun({ text: 'POST-CALL: ', font: 'Arial', size: 20, bold: true, color: '999999' }),
      new TextRun({
        text: 'Send a thank-you email within 24 hours. Reference something specific from the conversation.',
        font: 'Arial', size: 20, color: '999999', italics: true,
      }),
    ],
  }))

  // ── Build document ───────────────────────────────────────────────────────

  const doc = new Document({
    styles: buildStyles(accent),
    sections: [{
      properties: {
        type: SectionType.CONTINUOUS,
        page: {
          margin: {
            top: convertInchesToTwip(0.9),
            bottom: convertInchesToTwip(0.9),
            left: convertInchesToTwip(1),
            right: convertInchesToTwip(1),
          },
          size: {
            width: convertInchesToTwip(8.5),
            height: convertInchesToTwip(11),
          },
        },
      },
      children,
    }],
  })

  const buffer = await Packer.toBuffer(doc)
  return Buffer.from(buffer)
}
