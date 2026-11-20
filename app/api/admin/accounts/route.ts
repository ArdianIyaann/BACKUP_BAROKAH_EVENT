import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { isAccountRole, validatePassword, validateUsername } from '@/lib/account'
import { canManage, requireAdminSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest) {
  const session = await requireAdminSession()
  if (!canManage(session) || session.role !== 'OWNER') {
    return NextResponse.json({ error: 'Hanya owner yang bisa menambah akun.' }, { status: 403 })
  }

  let body: { username?: unknown; password?: unknown; role?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const username = typeof body?.username === 'string' ? body.username.trim() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  const role = typeof body?.role === 'string' ? body.role.toUpperCase() : ''

  const usernameError = validateUsername(username)
  if (usernameError) return NextResponse.json({ error: usernameError }, { status: 400 })
  const passwordError = validatePassword(password)
  if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 })
  if (!isAccountRole(role)) return NextResponse.json({ error: 'Role tidak valid.' }, { status: 400 })

  const taken = await prisma.user.findUnique({ where: { username }, select: { id: true } })
  if (taken) return NextResponse.json({ error: 'Username sudah dipakai akun lain.' }, { status: 409 })

  const passwordHash = await bcrypt.hash(password, 10)
  let user: { id: string; username: string; role: string }
  try {
    user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { username, passwordHash, customPassword: true, role },
        select: { id: true, username: true, role: true, name: true, phone: true },
      })
      await tx.activityLog.create({
        data: {
          userId: session.sub,
          action: 'auth.account.create',
          detail: { username: created.username, role: created.role, by: session.username },
        },
      })
      return created
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json({ error: 'Username sudah dipakai akun lain.' }, { status: 409 })
    }
    throw err
  }

  logger.info('account created', { by: session.username, username: user.username, role: user.role })
  return NextResponse.json({ ok: true, user: { id: user.id, username: user.username, role: user.role } }, { status: 201 })
}
