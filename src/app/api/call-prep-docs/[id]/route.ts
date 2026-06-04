import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

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

  const admin = serviceClient()

  const { data: doc, error } = await admin
    .from('call_prep_docs')
    .select('docx_storage_path, coach_name_snapshot, generated_at')
    .eq('id', id)
    .single()

  if (error || !doc?.docx_storage_path) {
    return NextResponse.json({ error: 'Doc not found' }, { status: 404 })
  }

  const { data: fileData, error: downloadError } = await admin.storage
    .from('assets')
    .download(doc.docx_storage_path)

  if (downloadError || !fileData) {
    return NextResponse.json({ error: 'Download failed' }, { status: 500 })
  }

  const dateStr = doc.generated_at.split('T')[0]
  const ext = extFromPath(doc.docx_storage_path)
  const fileName = `Call_Prep_${doc.coach_name_snapshot.replace(/\s+/g, '_')}_${dateStr}${ext}`

  const buffer = Buffer.from(await fileData.arrayBuffer())
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': mimeFromPath(doc.docx_storage_path),
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
}
