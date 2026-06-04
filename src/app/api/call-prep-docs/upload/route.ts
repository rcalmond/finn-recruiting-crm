import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25 MB
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const schoolId = formData.get('schoolId') as string
  const coachId = formData.get('coachId') as string
  const coachName = formData.get('coachName') as string
  const date = formData.get('date') as string
  const notes = (formData.get('notes') as string) || null

  if (!file || !schoolId || !coachId || !coachName || !date) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File exceeds 25 MB limit' }, { status: 400 })
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: 'Only .docx and .pdf files are accepted.' },
      { status: 400 }
    )
  }

  const admin = serviceClient()

  const docId = crypto.randomUUID()
  const ext = file.name.endsWith('.pdf') ? '.pdf' : '.docx'
  const storagePath = `call-prep/${schoolId}/${docId}${ext}`

  const arrayBuffer = await file.arrayBuffer()
  const { error: storageError } = await admin.storage
    .from('assets')
    .upload(storagePath, Buffer.from(arrayBuffer), {
      contentType: file.type,
      upsert: false,
    })

  if (storageError) {
    return NextResponse.json({ error: storageError.message }, { status: 500 })
  }

  const { data: doc, error: dbError } = await admin
    .from('call_prep_docs')
    .insert({
      id: docId,
      school_id: schoolId,
      coach_id: coachId,
      coach_name_snapshot: coachName,
      framing_notes: notes,
      docx_storage_path: storagePath,
      tool_call_count: null,
      source: 'uploaded',
      generated_at: new Date(date + 'T12:00:00-07:00').toISOString(),
    })
    .select()
    .single()

  if (dbError) {
    await admin.storage.from('assets').remove([storagePath])
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  return NextResponse.json({ doc }, { status: 201 })
}
