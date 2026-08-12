'use client'

import { useEffect, useRef } from 'react'

/**
 * Fire-and-forget 404 beacon. Mounted by the branded not-found page; on mount it
 * reports the current path + referrer to /api/not-found-log (which fills in the
 * authed user id and user-agent server-side). Renders nothing. A failed beacon
 * is silently ignored — logging must never affect the 404 render.
 *
 * Client-side by necessity: the app-router not-found boundary doesn't receive
 * the requested path, but window.location has it. Trade-off: no-JS bots aren't
 * logged — acceptable, since the signal we care about (internal 404s from a
 * signed-in browser) always runs JS.
 */
export default function NotFoundLogger() {
  const fired = useRef(false)

  useEffect(() => {
    if (fired.current) return
    fired.current = true

    try {
      const payload = JSON.stringify({
        path: window.location.pathname + window.location.search,
        referrer: document.referrer || undefined,
      })

      // Prefer sendBeacon — survives the navigation away, truly fire-and-forget.
      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          '/api/not-found-log',
          new Blob([payload], { type: 'application/json' })
        )
      } else {
        fetch('/api/not-found-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
        }).catch(() => {})
      }
    } catch {
      // Never let logging surface to the page.
    }
  }, [])

  return null
}
