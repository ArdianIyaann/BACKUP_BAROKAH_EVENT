import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { canDeleteAccount, isAccountRole, validatePassword, validateUsername } from '@/lib/account'
import { canManage, requireAdminSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { logger } from '@/lib/logger'

type Context = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: Context) {
  const session = await requireAdminSession()
  if (!canManage(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  const isSelf = id === session.sub
  if (!isSelf && session.role !== 'OWNER') {
    return NextResponse.json({ error: 'Hanya owner yang boleh mengubah akun lain.' }, { status: 403 })
  }

  let body: {
    username?: unknown
    password?: unknown
    currentPassword?: unknown
    role?: unknown
    name?: unknown
    phone?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const username = typeof body?.username === 'string' ? body.username.trim() : null
  const password = typeof body?.password === 'string' ? body.password : null
  const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : ''
  const role = typeof body?.role === 'string' ? body.role.toUpperCase() : null
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 191) : null
  const phone = typeof body?.phone === 'string' ? body.phone.trim().slice(0, 191) : null

  if (username === null && password === null && role === null && name === null && phone === null) {
    return NextResponse.json({ error: 'Minimal satu field wajib diisi.' }, { status: 400 })
  }
  if (username !== null) {
    const error = validateUsername(username)
    if (error) return NextResponse.json({ error }, { status: 400 })
  }
  if (password !== null) {
    const error = validatePassword(password)
    if (error) return NextResponse.json({ error }, { status: 400 })
  }
  if (role !== null && !isAccountRole(role)) {
    return NextResponse.json({ error: 'Role tidak valid.' }, { status: 400 })
  }
  if (role !== null && session.role !== 'OWNER') {
    return NextResponse.json({ error: 'Hanya owner yang bisa mengubah level akun.' }, { status: 403 })
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, passwordHash: true, role: true, name: true, phone: true },
  })
  if (!user) return NextResponse.json({ error: 'Akun tidak ditemukan.' }, { status: 404 })

  if (username && username !== user.username) {
    const taken = await prisma.user.findUnique({ where: { username }, select: { id: true } })
    if (taken && taken.id !== user.id) {
      return NextResponse.json({ error: 'Username sudah dipakai akun lain.' }, { status: 409 })
    }
  }

  if (user.role === 'OWNER' && role && role !== 'OWNER') {
    const owners = await prisma.user.count({ where: { role: 'OWNER' } })
    if (owners <= 1) {
      return NextResponse.json({ error: 'Owner terakhir tidak boleh diturunkan levelnya.' }, { status: 409 })
    }
  }

  if (isSelf) {
    if (!currentPassword) {
      return NextResponse.json({ error: 'Password saat ini wajib diisi untuk mengubah akun sendiri.' }, { status: 400 })
    }
    const ok = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!ok) {
      logger.warn('account change rejected', { by: session.username, reason: 'wrong_current_password' })
      return NextResponse.json({ error: 'Password saat ini salah.' }, { status: 401 })
    }
  }

  const data: Prisma.UserUpdateInput = {}
  const changed: string[] = []
  if (username && username !== user.username) {
    data.username = username
    changed.push('username')
  }
  if (password) {
    data.passwordHash = await bcrypt.hash(password, 10)
    data.customPassword = true
    changed.push('password')
  }
  if (role && role !== user.role) {
    data.role = role
    changed.push('role')
  }
  if (name !== null && name !== (user.name ?? '')) {
    data.name = name || null
    changed.push('name')
  }
  if (phone !== null && phone !== (user.phone ?? '')) {
    data.phone = phone || null
    changed.push('phone')
  }
  if (changed.length === 0) return NextResponse.json({ ok: true, unchanged: true })

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data })
      if (password) await tx.userSession.deleteMany({ where: { userId: user.id } })
      await tx.activityLog.create({
        data: {
          userId: session.sub,
          action: 'auth.account.update',
          detail: { target: user.username, changed, by: session.username, signedOut: Boolean(password) },
        },
      })
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json({ error: 'Username sudah dipakai akun lain.' }, { status: 409 })
    }
    throw err
  }

  logger.info('account updated', { by: session.username, target: user.username, changed })
  return NextResponse.json({ ok: true, changed, signedOut: Boolean(password) })
}

export async function DELETE(_request: NextRequest, { params }: Context) {
  const session = await requireAdminSession()
  if (!canManage(session) || session.role !== 'OWNER') {
    return NextResponse.json({ error: 'Hanya owner yang bisa menghapus akun.' }, { status: 403 })
  }
  const { id } = await params
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, role: true },
  })
  if (!user) return NextResponse.json({ error: 'Akun tidak ditemukan.' }, { status: 404 })

  const ownerCount = await prisma.user.count({ where: { role: 'OWNER' } })
  if (!canDeleteAccount({ isSelf: id === session.sub, role: user.role, ownerCount })) {
    return NextResponse.json({ error: 'Akun sendiri dan owner terakhir tidak bisa dihapus.' }, { status: 409 })
  }

  await prisma.$transaction(async (tx) => {
    await tx.userSession.deleteMany({ where: { userId: user.id } })
    await tx.user.delete({ where: { id: user.id } })
    await tx.activityLog.create({
      data: {
        userId: session.sub,
        action: 'auth.account.delete',
        detail: { username: user.username, role: user.role, by: session.username },
      },
    })
  })

  logger.info('account deleted', { by: session.username, username: user.username, role: user.role })
  return NextResponse.json({ ok: true })
}
