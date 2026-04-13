'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Mode = 'password' | 'magic'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<Mode>('password')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    if (mode === 'password') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      router.push('/dashboard')
      router.refresh()
    } else {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      setSuccess(`Magic link sent to ${email} — check your inbox and click the link to sign in.`)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 to-blue-700">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">⚽</div>
          <h1 className="text-2xl font-bold text-gray-900">Recruiting CRM</h1>
          <p className="text-sm text-gray-500 mt-1">
            Finn Almond · Class of 2027 · LWB
          </p>
          <p className="text-xs text-gray-400 mt-0.5">Albion SC MLS NEXT Academy</p>
        </div>

        {/* Mode toggle */}
        <div className="flex rounded-lg bg-gray-100 p-1 mb-5">
          <button
            type="button"
            onClick={() => { setMode('password'); setError(null); setSuccess(null) }}
            className={`flex-1 py-1.5 rounded-md text-sm font-semibold transition ${mode === 'password' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
          >
            Password
          </button>
          <button
            type="button"
            onClick={() => { setMode('magic'); setError(null); setSuccess(null) }}
            className={`flex-1 py-1.5 rounded-md text-sm font-semibold transition ${mode === 'magic' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
          >
            Magic Link
          </button>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="you@example.com"
            />
          </div>

          {mode === 'password' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••"
              />
            </div>
          )}

          {mode === 'magic' && (
            <p className="text-xs text-gray-500">
              We&apos;ll email you a one-click sign-in link. No password needed.
            </p>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {success && (
            <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
              {success}
            </p>
          )}

          {!success && (
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-700 hover:bg-blue-800 text-white font-semibold py-2.5 rounded-lg text-sm transition disabled:opacity-60"
            >
              {loading
                ? (mode === 'magic' ? 'Sending…' : 'Signing in…')
                : (mode === 'magic' ? 'Send Magic Link' : 'Sign In')}
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
