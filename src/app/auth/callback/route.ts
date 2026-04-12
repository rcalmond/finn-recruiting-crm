import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Handles OAuth / magic-link callbacks from Supabase
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const type = searchParams.get('type')
      if (type === 'recovery' || type === 'invite') {
        return NextResponse.redirect(`${origin}/auth/update-password`)
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=auth-callback-failed`)
}
