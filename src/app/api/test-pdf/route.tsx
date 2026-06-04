import { Document, Page, Text, renderToBuffer } from '@react-pdf/renderer'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET() {
  try {
    const doc = (
      <Document>
        <Page size="LETTER">
          <Text>Hello PDF from Vercel</Text>
        </Page>
      </Document>
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(doc as any)
    const uint8 = new Uint8Array(buffer)
    return new Response(uint8, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': uint8.length.toString(),
      },
    })
  } catch (e) {
    console.error('[test-pdf] FAILED', e)
    const err = e as Error
    return new Response(
      JSON.stringify({ error: err.message, stack: err.stack }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
