import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { cookieOpts, getSessionCookieName, SESSION_MAX_AGE, signSession, slotOfRole } from '@/lib/auth'
import { logger } from '@/lib/logger'

const DUMMY_HASH = '$2b$10$OyeDM9NMGCtakHwJ/qrORutPReVjNeD.uQzUWcs7heLGsU9xpREV.'
const WINDOW_MS = 60_000
const MAX_ATTEMPTS = 5
const attempts = new Map<string, { count: number; resetAt: number }>()

function clientIp(request: NextRequest): string {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]?.trim() || 'unknown'
  return request.headers.get('x-real-ip') || 'unknown'
}

function rateLimited(key: string): boolean {
  const now = Date.now()
  const rec = attempts.get(key)
  if (!rec || rec.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }
  rec.count += 1
  return rec.count > MAX_ATTEMPTS
}

export async function POST(request: NextRequest) {
  let body: { username?: unknown; password?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const username = typeof body.username === 'string' ? body.username.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!username || !password) {
    return NextResponse.json({ error: 'Username dan password wajib diisi.' }, { status: 400 })
  }

  const ip = clientIp(request)
  const key = `${ip}:${username.toLowerCase()}`
  if (rateLimited(key)) {
    logger.warn('login rate limited', { ip, username })
    return NextResponse.json({ error: 'Terlalu banyak percobaan. Coba lagi dalam 1 menit.' }, { status: 429 })
  }

  const user = await prisma.user.findUnique({ where: { username } })
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH)

  if (!user || !ok) {
    await prisma.activityLog.create({
      data: { userId: user?.id ?? null, action: 'auth.login.failed', detail: { username } },
    })
    logger.warn('login failed', { username, reason: user ? 'wrong_password' : 'user_not_found' })
    return NextResponse.json({ error: 'Username atau password salah.' }, { status: 401 })
  }

  const now = new Date()
  await prisma.userSession.deleteMany({ where: { userId: user.id, expiresAt: { lte: now } } })
  const active = await prisma.userSession.findUnique({
    where: { userId: user.id },
    select: { id: true },
  })
  if (active) {
    await prisma.activityLog.create({
      data: { userId: user.id, action: 'auth.login.blocked', detail: { username: user.username, ip } },
    })
    logger.warn('login blocked: another device is active', { username, ip })
    return NextResponse.json(
      { error: 'Akun sedang aktif di perangkat lain. Logout dari perangkat tersebut sebelum login di sini.' },
      { status: 409 },
    )
  }

  const jti = randomUUID()
  const token = await signSession({ sub: user.id, username: user.username, role: user.role, jti })
  try {
    await prisma.userSession.create({
      data: {
        id: jti,
        userId: user.id,
        expiresAt: new Date(now.getTime() + SESSION_MAX_AGE * 1000),
        ip,
        userAgent: (request.headers.get('user-agent') ?? '').slice(0, 500) || null,
      },
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json(
        { error: 'Akun sedang aktif di perangkat lain. Logout dari perangkat tersebut sebelum login di sini.' },
        { status: 409 },
      )
    }
    throw err
  }

  await prisma.activityLog.create({
    data: { userId: user.id, action: 'auth.login.success', detail: { username: user.username, role: user.role, ip } },
  })
  logger.info('login ok', { username, role: user.role })

  const res = NextResponse.json({ ok: true, role: user.role, username: user.username, scope: slotOfRole(user.role) })
  res.cookies.set(getSessionCookieName(slotOfRole(user.role)), token, cookieOpts())
  return res
}