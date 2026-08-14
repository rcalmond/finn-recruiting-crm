import { NextRequest, NextResponse } from 'next/server'
import { rawService } from '@/lib/tenant-db'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = supabase // T1: user client — RLS enforces the family boundary

  const { data: asset, error: fetchError } = await admin
    .from('assets')
    .select('storage_path, file_name, mime_type')
    .eq('id', id)
    .single()

  if (fetchError || !asset?.storage_path) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
  }

  const { data: fileData, error: downloadError } = await rawService().storage /* T1: storage streaming stays service-role */
    .from('assets')
    .download(asset.storage_path)

  if (downloadError || !fileData) {
    return NextResponse.json({ error: 'Download failed' }, { status: 500 })
  }

  const buffer = Buffer.from(await fileData.arrayBuffer())
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': asset.mime_type ?? 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${asset.file_name ?? 'download'}"`,
    },
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const updates = await req.json()
  const admin = supabase // T1: user client — RLS enforces the family boundary
  const { error } = await admin.from('assets').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = supabase // T1: user client — RLS enforces the family boundary

  // Fetch asset to get storage path
  const { data: asset, error: fetchError } = await admin
    .from('assets')
    .select('id, storage_path, category')
    .eq('id', id)
    .single()

  if (fetchError || !asset) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
  }

  // Soft delete: mark inactive
  const { error: dbError } = await admin
    .from('assets')
    .update({ is_current: false })
    .eq('id', id)

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  // Remove file from storage (files only)
  if (asset.category === 'file' && asset.storage_path) {
    await rawService().storage /* T1: storage streaming stays service-role */.from('assets').remove([asset.storage_path])
  }

  return NextResponse.json({ ok: true })
}
