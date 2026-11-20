'use client'

import { useEffect } from 'react'

export function AdminAutoLogout() {
  useEffect(() => {
    const body = JSON.stringify({ scope: 'ADMIN' })

    function logout() {
      const blob = new Blob([body], { type: 'application/json' })
      if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon('/api/auth/logout', blob)) return
      void fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {})
    }

    window.addEventListener('pagehide', logout)
    return () => window.removeEventListener('pagehide', logout)
  }, [])

  return null
}
