import { NextRequest, NextResponse } from 'next/server'
import { getSession, getSessions, type Session, type SessionSlot } from '@/lib/auth'

function publicSession({ jti: _jti, ...session }: Session): Omit<Session, 'jti'> {
  return session
}

export async function GET(request: NextRequest) {
  const scope = (request.nextUrl.searchParams.get('scope') ?? '').toUpperCase()
  if (scope) {
    if (scope !== 'ADMIN' && scope !== 'CREW') {
      return NextResponse.json({ error: 'scope invalid' }, { status: 400 })
    }
    const slot = scope as SessionSlot
    const session = await getSession(slot)
    if (!session) return NextResponse.json({ user: null, sessions: [] }, { status: 401 })
    return NextResponse.json({ user: publicSession(session), sessions: [publicSession(session)] })
  }

  const sessions = await getSessions()
  return NextResponse.json({ user: sessions[0] ? publicSession(sessions[0]) : null, sessions: sessions.map(publicSession) })
}