/**
 * call-prep-pdf.ts
 *
 * Generates a formatted PDF call prep document from structured JSON output.
 * Uses pdfmake (pure JS, no React, no reconciler, no native binaries).
 *
 * Formatting: US Letter, 1" margins, Helvetica 11pt body, school accent color.
 * Heading hierarchy: H1 = 18pt bold accent, H2 = 14pt bold #1A1A1A, H3 = 12pt bold #1A1A1A.
 */

import type { TDocumentDefinitions, Content } from 'pdfmake/interfaces'
import type { CallPrepOutput } from './call-prep-prompt'

// Use Content for all helper return types — pdfmake's Content union is broad enough

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

// ─── Content helpers ──────────────────────────────────────────────────────

function h1(text: string, accent: string, pageBreak?: boolean): Content {
  return {
    text, fontSize: 18, bold: true, color: accent,
    margin: [0, 16, 0, 8],
    ...(pageBreak ? { pageBreak: 'before' as const } : {}),
  }
}

function h2(text: string): Content {
  return { text, fontSize: 14, bold: true, color: '#1A1A1A', margin: [0, 14, 0, 6] }
}

function h3(text: string): Content {
  return { text, fontSize: 12, bold: true, color: '#1A1A1A', margin: [0, 10, 0, 4] }
}

function body(text: string): Content {
  return { text, margin: [0, 0, 0, 6] }
}

function bullet(text: string): Content {
  return {
    columns: [
      { text: '\u2022', width: 12, alignment: 'left' as const },
      { text, width: '*' },
    ],
    margin: [0, 0, 0, 3],
  }
}

function labelValue(label: string, value: string): Content {
  return {
    text: [
      { text: `${label}: `, bold: true },
      { text: value },
    ],
    margin: [0, 0, 0, 3],
  }
}

function hr(): Content {
  return {
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: 468, y2: 0, lineWidth: 0.5, lineColor: '#CCCCCC' }],
    margin: [0, 10, 0, 10],
  }
}

function paras(text: string): Content[] {
  return text.split('\n\n').filter(p => p.trim()).map(p => body(p.trim()))
}

// ─── Document builder ─────────────────────────────────────────────────────

function buildDocDefinition(data: CallPrepOutput): TDocumentDefinitions {
  const accent = getAccentColor(data.title)
  const content: Content[] = []

  // ── Page 1: Cover + Quick Reference + Where We Stand ────────────────

  content.push({ text: data.title, fontSize: 22, bold: true, color: accent })
  content.push({ text: data.subtitle, fontSize: 14, color: '#666666', margin: [0, 3, 0, 0] })
  content.push({ text: data.call_with, fontSize: 12, bold: true, color: '#333333', margin: [0, 3, 0, 12] })

  content.push(hr())

  content.push(h2('Quick Reference'))
  const qr = data.quick_reference
  content.push(labelValue('Division / Conference', qr.division_conference))
  content.push(labelValue('Head Coach', qr.head_coach))
  if (qr.point_of_contact) content.push(labelValue('Point of Contact', qr.point_of_contact))
  content.push(labelValue('Recent Results', qr.recent_results))
  if (qr.engineering) content.push(labelValue('Engineering', qr.engineering))
  content.push(labelValue('Academic Anchor', qr.academic_anchor))
  content.push(labelValue('Location', qr.location))

  content.push(hr())

  content.push(h2('Where We Stand Today'))
  content.push(...paras(data.where_we_stand))

  // ── Page 2: Part 1 — Background ─────────────────────────────────────

  content.push(h1('Part 1 \u2014 Background', accent, true))

  content.push(h2('The University'))
  content.push(...paras(data.part_1_background.university))

  content.push(h2('What Makes It Distinctive'))
  content.push(...paras(data.part_1_background.what_makes_distinctive))

  content.push(h3(data.part_1_background.academic_program.name))
  content.push(...paras(data.part_1_background.academic_program.description))
  for (const prog of data.part_1_background.academic_program.relevant_programs) {
    content.push(bullet(prog))
  }

  const fit = data.part_1_background.soccer_roster_academic_fit
  if (fit.players.length > 0) {
    content.push(h3('Soccer \u00d7 Academics \u2014 Roster Fit'))
    content.push(body(fit.intro))
    for (const p of fit.players) {
      content.push(bullet(`${p.name} (${p.year}) \u2014 ${p.major} \u2014 ${p.hometown}`))
    }
  }

  if (data.part_1_background.geographic_connection) {
    content.push(h3('Geographic Connection'))
    content.push(body(data.part_1_background.geographic_connection))
  }

  content.push(h3('Student Life'))
  content.push(body(data.part_1_background.student_life))

  content.push(h3('Honest Reality Checks'))
  for (const check of data.part_1_background.honest_reality_checks) {
    content.push(bullet(check))
  }

  // ── Page 3: Part 2 — The Program ────────────────────────────────────

  content.push(h1('Part 2 \u2014 The Program', accent, true))

  content.push(h2('Recent Performance'))
  for (const item of data.part_2_program.recent_performance) {
    content.push(bullet(item))
  }

  if (data.part_2_program.coaching_transition) {
    content.push(h2('Coaching Transition'))
    content.push(body(data.part_2_program.coaching_transition))
  }

  content.push(h2('Coaching Staff'))
  for (const item of data.part_2_program.coaching_staff) {
    content.push(bullet(item))
  }

  content.push(h2('Roster Shape'))
  content.push(...paras(data.part_2_program.roster_shape))

  content.push(h2('Where They Recruit From'))
  for (const item of data.part_2_program.where_they_recruit_from) {
    content.push(bullet(item))
  }

  content.push(h2('Position Depth \u2014 Left Wingback'))
  content.push(...paras(data.part_2_program.position_depth))

  // ── Page 4: Part 3 — The Coach ──────────────────────────────────────

  content.push(h1('Part 3 \u2014 The Coach', accent, true))

  content.push(h2('Quick Facts'))
  const qf = data.part_3_coach.quick_facts
  if (qf.hometown) content.push(labelValue('Hometown', qf.hometown))
  if (qf.playing_position) content.push(labelValue('Playing Position', qf.playing_position))
  if (qf.at_program_since) content.push(labelValue('At Program Since', qf.at_program_since))
  if (qf.latest_credential) content.push(labelValue('Latest Credential', qf.latest_credential))

  content.push(body(data.part_3_coach.intro))

  content.push(h2('Playing Career'))
  for (const item of data.part_3_coach.playing_career) {
    content.push(bullet(item))
  }

  content.push(h2('Coaching Path'))
  for (const item of data.part_3_coach.coaching_path) {
    content.push(bullet(item))
  }

  content.push(h2('Education & Credentials'))
  for (const item of data.part_3_coach.education_credentials) {
    content.push(bullet(item))
  }

  content.push(h2('How to Connect with Him'))
  for (const item of data.part_3_coach.how_to_connect) {
    content.push(bullet(item))
  }

  // ── Page 5: Part 4 — Questions + Closers ────────────────────────────

  content.push(h1('Part 4 \u2014 Questions for the Call', accent, true))
  content.push(body(data.part_4_questions.intro))

  let globalNum = 0
  for (const cat of data.part_4_questions.categories) {
    content.push(h2(cat.name))

    for (const q of cat.questions) {
      globalNum++

      // Split-run question label: "QUESTION N   •   Category"
      content.push({
        text: [
          { text: `QUESTION ${globalNum}`, bold: true, color: accent },
          { text: `   \u2022   ${cat.name}`, color: '#5A5A5A' },
        ],
        fontSize: 10,
        margin: [0, 10, 0, 2],
      })

      // Question text
      content.push({
        text: q.question,
        bold: true, fontSize: 12,
        margin: [0, 2, 0, 3],
      })

      // Why it matters
      content.push({
        text: [
          { text: 'Why it matters: ', bold: true, italics: true },
          { text: q.why_it_matters, italics: true },
        ],
        fontSize: 11, color: '#5A5A5A',
        margin: [0, 2, 0, 6],
      })
    }
  }

  // Closers
  content.push(h2('Closing Moves'))
  for (const closer of data.closers) {
    content.push(bullet(closer))
  }

  // Post-call reminder
  content.push(hr())
  content.push({
    text: [
      { text: 'POST-CALL: ', bold: true, color: '#999999' },
      { text: 'Send a thank-you email within 24 hours. Reference something specific from the conversation.', italics: true, color: '#999999' },
    ],
    fontSize: 10,
    margin: [0, 4, 0, 0],
  })

  return {
    pageSize: 'LETTER' as const,
    pageMargins: [72, 54, 72, 54], // 1" left/right, ~0.75" top/bottom
    defaultStyle: {
      font: 'Helvetica',
      fontSize: 11,
      color: '#1A1A1A',
      lineHeight: 1.4,
    },
    content,
  }
}

// ─── PDF generation ───────────────────────────────────────────────────────

import path from 'path'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PdfPrinterModule = require('pdfmake/js/Printer')
const PdfPrinterClass = PdfPrinterModule.default ?? PdfPrinterModule

const fontDir = path.join(process.cwd(), 'fonts')

const FONTS = {
  Helvetica: {
    normal: path.join(fontDir, 'Arimo-Regular.ttf'),
    bold: path.join(fontDir, 'Arimo-Bold.ttf'),
    italics: path.join(fontDir, 'Arimo-Italic.ttf'),
    bolditalics: path.join(fontDir, 'Arimo-BoldItalic.ttf'),
  },
}

// pdfmake 0.3.x PdfPrinter requires a urlResolver (3rd constructor arg)
// to avoid crashing on resolveUrls(). We don't use URLs in docs, so noop.
const noopUrlResolver = { resolve: () => {}, resolved: () => [] }

export async function generateCallPrepPdf(data: CallPrepOutput): Promise<Buffer> {
  const docDefinition = buildDocDefinition(data)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const printer = new (PdfPrinterClass as any)(FONTS, undefined, noopUrlResolver)
  // pdfmake 0.3.x returns a Promise<PDFDocument> from createPdfKitDocument
  const pdfDoc = await printer.createPdfKitDocument(docDefinition)

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk))
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks)))
    pdfDoc.on('error', reject)
    pdfDoc.end()
  })
}
