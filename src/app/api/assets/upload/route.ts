import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  // Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const name = formData.get('name') as string
  const type = formData.get('type') as string
  const description = (formData.get('description') as string) || null

  if (!file || !name || !type) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File exceeds 10 MB limit' }, { status: 400 })
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'File type not allowed. Use PDF or Word documents.' }, { status: 400 })
  }

  const admin = serviceClient()

  // Determine storage folder
  const folder = type === 'resume' ? 'resumes'
               : type === 'transcript' ? 'transcripts'
               : 'other'

  const storagePath = `${folder}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`

  // Upload to storage
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

  // Insert DB record
  const { data: asset, error: dbError } = await admin
    .from('assets')
    .insert({
      name,
      type,
      category: 'file',
      storage_path: storagePath,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
      description,
      is_current: true,
      version: 1,
      uploaded_by: user.id,
    })
    .select()
    .single()

  if (dbError) {
    // Clean up orphaned file
    await admin.storage.from('assets').remove([storagePath])
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  return NextResponse.json({ asset }, { status: 201 })
}
