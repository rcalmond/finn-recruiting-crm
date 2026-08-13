/**
 * camp-doc-pdf.ts
 *
 * Phase 6 — server-side PDF for a camp prep document (pdfmake, same engine as
 * call-prep-pdf.ts but a SEPARATE renderer; the call-prep renderer and its per-school
 * accent colors are untouched). Camp docs are brand chrome, not per-school colored:
 *
 *   - Masthead: bold italic, green trailing period.
 *   - The Plan: a numbered-act ghost-numeral ramp per day; Pitch Green is chrome here.
 *   - Where You Stand + The Mission carry a "Regista" attribution and stay in the
 *     ink/charcoal weight register — NOT accented green.
 *   - DATA-COLOR FIREWALL: nothing encodes data as color. Classifications are text
 *     labels, not chips; no tier/temperature/status color anywhere.
 *
 * US Letter, 1" margins, Arimo (Helvetica-metric). Written TO the player.
 */

import type { TDocumentDefinitions, Content } from 'pdfmake/interfaces'
import type { CampDoc } from './camp-doc'

// Brand tokens (globals.css --tb-*). Green is CHROME only.
const INK = '#1A1A1A', MUTED = '#6B655A', FAINT = '#8A8478'
const PITCH = '#1F6B48', PITCH_GHOST = '#B7D4C4', BORDER = '#E2DBC9'

function hr(color = BORDER): Content {
  return { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 468, y2: 0, lineWidth: 0.75, lineColor: color }], margin: [0, 12, 0, 12] }
}
function paras(text: string, opts: { color?: string; italics?: boolean } = {}): Content[] {
  return (text || '').split('\n\n').filter(p => p.trim()).map(p => ({ text: p.trim(), color: opts.color ?? INK, italics: opts.italics, margin: [0, 0, 0, 6] as [number, number, number, number] }))
}
// Section header in the ink register, with an optional "Regista" attribution to its right.
function sectionHead(title: string, attribution?: string): Content {
  return {
    columns: [
      { text: title, fontSize: 15, bold: true, color: INK, width: '*' },
      ...(attribution ? [{ text: attribution, fontSize: 9, bold: true, color: MUTED, characterSpacing: 1.5, alignment: 'right' as const, margin: [0, 4, 0, 0] as [number, number, number, number], width: 'auto' as const }] : []),
    ],
    margin: [0, 16, 0, 6],
  }
}
function miniLabel(label: string, value: string): Content {
  return { text: [{ text: `${label}  `, bold: true, color: FAINT, fontSize: 9, characterSpacing: 1 }, { text: value, color: INK, fontSize: 11 }], margin: [0, 0, 0, 5] }
}

function buildDocDefinition(d: CampDoc): TDocumentDefinitions {
  const content: Content[] = []
  const M = d.masthead

  // ── Masthead: bold italic, green trailing period ──
  content.push({ text: `CAMP PREP · ${M.school}`.toUpperCase(), fontSize: 9, bold: true, color: FAINT, characterSpacing: 2, margin: [0, 0, 0, 6] })
  content.push({ text: [{ text: M.camp, fontSize: 26, bold: true, italics: true, color: INK }, { text: '.', fontSize: 26, bold: true, italics: true, color: PITCH }] })
  content.push({ text: `${M.player} — ${M.dates}`, fontSize: 12, color: MUTED, margin: [0, 4, 0, 0] })
  const vs = [M.venue, M.surface].filter(Boolean).join(' · ')
  if (vs) content.push({ text: vs, fontSize: 10.5, color: FAINT, margin: [0, 2, 0, 0] })
  if (M.framing) content.push({ text: M.framing, fontSize: 12.5, italics: true, color: INK, margin: [0, 10, 0, 0], lineHeight: 1.35 })
  content.push(hr())

  // ── Where You Stand (Regista) ──
  const w = d.where_you_stand
  content.push(sectionHead('Where You Stand', 'REGISTA'))
  content.push(...paras(w.read))
  if (w.coach_touchpoints?.length) {
    content.push({ text: 'THE TOUCHPOINTS', fontSize: 8.5, bold: true, color: FAINT, characterSpacing: 1.5, margin: [0, 8, 0, 4] })
    for (const t of w.coach_touchpoints) {
      content.push({
        text: [
          { text: `${t.date}  `, bold: true, color: INK, fontSize: 10 },
          { text: (t.classification || '').toUpperCase(), bold: true, color: MUTED, fontSize: 8.5, characterSpacing: 1 },
          { text: `  ${t.what}`, color: INK, fontSize: 10.5 },
        ],
        margin: [0, 0, 0, t.quote ? 1 : 5], lineHeight: 1.3,
      })
      if (t.quote) content.push({ text: `“${t.quote}”`, italics: true, color: MUTED, fontSize: 10, margin: [14, 0, 0, 6] })
    }
  }
  content.push(miniLabel('OPENED BY', w.relationship_opened_by))
  content.push({ text: 'ADVANCEMENT', fontSize: 8.5, bold: true, color: FAINT, characterSpacing: 1.5, margin: [0, 4, 0, 3] })
  content.push(...paras(w.advancement))
  content.push({ text: 'NOT YET', fontSize: 8.5, bold: true, color: FAINT, characterSpacing: 1.5, margin: [0, 4, 0, 3] })
  content.push(...paras(w.not_yet))
  content.push({ text: w.verdict, bold: true, color: INK, fontSize: 11.5, margin: [0, 8, 0, 0], lineHeight: 1.35 })
  content.push(hr())

  // ── The Mission (Regista) ──
  const mi = d.the_mission
  content.push(sectionHead('The Mission', 'REGISTA'))
  if (mi.rubric_quote?.quote) {
    content.push({
      table: { widths: ['*'], body: [[{
        stack: [
          { text: `“${mi.rubric_quote.quote}”`, italics: true, fontSize: 12, color: INK, lineHeight: 1.35 },
          { text: `— ${mi.rubric_quote.who}${mi.rubric_quote.when ? `, ${mi.rubric_quote.when}` : ''}`, fontSize: 9.5, color: MUTED, margin: [0, 4, 0, 0] },
        ],
        border: [true, false, false, false], borderColor: [PITCH, PITCH, PITCH, PITCH], margin: [10, 6, 6, 6],
      }]] },
      layout: { defaultBorder: false }, margin: [0, 2, 0, 10],
    })
  }
  content.push(...paras(mi.mission))
  content.push({ text: 'CALIBRATION', fontSize: 8.5, bold: true, color: FAINT, characterSpacing: 1.5, margin: [0, 6, 0, 3] })
  content.push(...paras(mi.calibration))
  content.push(hr())

  // ── The Staff (omit when null; omit angle when absent) ──
  if (Array.isArray(d.the_staff) && d.the_staff.length) {
    content.push(sectionHead('The Staff'))
    for (const c of d.the_staff) {
      content.push({
        text: [
          { text: c.name, bold: true, color: INK, fontSize: 11.5 },
          { text: `  ${c.role}`, color: MUTED, fontSize: 10 },
          ...(c.primary_relationship ? [{ text: '  · your primary contact', color: FAINT, fontSize: 9, italics: true }] : []),
        ],
        margin: [0, 6, 0, c.your_angle ? 2 : 4],
      })
      if (c.your_angle) content.push({ text: c.your_angle, color: INK, fontSize: 10.5, margin: [0, 0, 0, 4], lineHeight: 1.3 })
    }
    content.push(hr())
  }

  // ── The Plan — numbered-act ghost-numeral ramp; Pitch Green is chrome here ──
  content.push(sectionHead('The Plan'))
  const planBlock = (b: { time: string | null; activity: string; guidance: string }): Content => ({
    stack: [
      { text: [ ...(b.time ? [{ text: `${b.time}  `, bold: true, color: PITCH, fontSize: 10 }] : []), { text: b.activity, bold: true, color: INK, fontSize: 10.5 } ], margin: [0, 0, 0, 1] },
      { text: b.guidance, color: MUTED, fontSize: 10, lineHeight: 1.3 },
    ],
    unbreakable: true, margin: [34, 0, 0, 6],
  })
  ;(d.the_plan || []).forEach((day, i) => {
    const header: Content = {
      columns: [
        { text: String(i + 1), fontSize: 30, bold: true, color: PITCH_GHOST, width: 34 },
        { text: day.label, fontSize: 13.5, bold: true, color: INK, margin: [0, 9, 0, 0], width: '*' },
      ],
      margin: [0, 10, 0, 4],
    }
    const blocks = day.blocks || []
    // Day header + first block travel together (no orphaned header), rendered FIRST.
    content.push({ stack: [header, ...(blocks[0] ? [planBlock(blocks[0])] : [])], unbreakable: true })
    // Remaining blocks follow, each individually unbreakable (no split block).
    blocks.slice(1).forEach(b => content.push(planBlock(b)))
    if (day.sleep) content.push({ text: [{ text: 'SLEEP  ', bold: true, color: FAINT, fontSize: 8.5, characterSpacing: 1 }, { text: day.sleep, color: INK, fontSize: 10 }], margin: [34, 2, 0, 4] })
    if (day.recovery) content.push({ text: [{ text: 'RECOVERY  ', bold: true, color: FAINT, fontSize: 8.5, characterSpacing: 1 }, { text: day.recovery, color: INK, fontSize: 10 }], margin: [34, 0, 0, 4] })
  })
  content.push(hr())

  // ── Before Leaving ──
  const bl = d.before_leaving
  content.push(sectionHead('Before You Leave'))
  content.push(miniLabel('FIND FIRST', bl.coach_to_find))
  content.push({ text: bl.opening_line, color: INK, fontSize: 11, margin: [0, 0, 0, 8], lineHeight: 1.35 })
  content.push({
    table: { widths: ['*'], body: [[{ text: `“${bl.next_step_question}”`, italics: true, fontSize: 12.5, color: INK, border: [true, false, false, false], borderColor: [PITCH, PITCH, PITCH, PITCH], margin: [10, 6, 6, 6], lineHeight: 1.35 }]] },
    layout: { defaultBorder: false }, margin: [0, 0, 0, 8],
  })
  content.push({ text: [{ text: 'FOLLOW UP  ', bold: true, color: FAINT, fontSize: 8.5, characterSpacing: 1 }, { text: `Email ${bl.follow_up.who} by ${bl.follow_up.send_date} — reference ${bl.follow_up.reference}.`, color: INK, fontSize: 10.5 }], margin: [0, 0, 0, 4], lineHeight: 1.3 })
  content.push(hr(PITCH))

  // ── Footer: closing charge, centered italic ──
  content.push({ text: d.footer, italics: true, bold: true, fontSize: 12.5, color: INK, alignment: 'center', margin: [0, 4, 0, 0], lineHeight: 1.35 })

  return {
    pageSize: 'LETTER' as const,
    pageMargins: [72, 60, 72, 56],
    defaultStyle: { font: 'Helvetica', fontSize: 11, color: INK, lineHeight: 1.4 },
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: 'Throughball · powered by Regista', fontSize: 8, color: FAINT, italics: true, margin: [72, 0, 0, 0] },
        { text: `${currentPage} / ${pageCount}`, fontSize: 8, color: FAINT, alignment: 'right', margin: [0, 0, 72, 0] },
      ], margin: [0, 20, 0, 0],
    }),
    content,
  }
}

// ─── PDF generation (mirrors call-prep-pdf's printer setup) ──────────────────
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
const noopUrlResolver = { resolve: () => {}, resolved: () => [] }

export async function generateCampDocPdf(data: CampDoc): Promise<Buffer> {
  const docDefinition = buildDocDefinition(data)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const printer = new (PdfPrinterClass as any)(FONTS, undefined, noopUrlResolver)
  const pdfDoc = await printer.createPdfKitDocument(docDefinition)
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk))
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks)))
    pdfDoc.on('error', reject)
    pdfDoc.end()
  })
}
