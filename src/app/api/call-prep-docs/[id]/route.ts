import { NextRequest, NextResponse } from 'next/server'
import { rawService } from '@/lib/tenant-db'
import { createClient } from '@/lib/supabase/server'

function mimeFromPath(path: string): string {
  if (path.endsWith('.pdf')) return 'application/pdf'
  return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
}

function extFromPath(path: string): string {
  if (path.endsWith('.pdf')) return '.pdf'
  return '.docx'
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = supabase // T1: user client — RLS enforces the family boundary

  const { data: doc, error } = await admin
    .from('prep_docs')
    .select('storage_path, coach_name_snapshot, generated_at')
    .eq('id', id)
    .single()

  if (error || !doc?.storage_path) {
    return NextResponse.json({ error: 'Doc not found' }, { status: 404 })
  }

  const { data: fileData, error: downloadError } = await rawService().storage /* T1: storage streaming stays service-role */
    .from('assets')
    .download(doc.storage_path)

  if (downloadError || !fileData) {
    return NextResponse.json({ error: 'Download failed' }, { status: 500 })
  }

  const dateStr = doc.generated_at.split('T')[0]
  const ext = extFromPath(doc.storage_path)
  const fileName = `Call_Prep_${doc.coach_name_snapshot.replace(/\s+/g, '_')}_${dateStr}${ext}`

  const buffer = Buffer.from(await fileData.arrayBuffer())
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': mimeFromPath(doc.storage_path),
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
}
