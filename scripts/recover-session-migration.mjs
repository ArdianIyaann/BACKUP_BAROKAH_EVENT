import { execFileSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'

const MIGRATION_NAME = '20261122000000_allow_multiple_user_sessions'
const UNIQUE_INDEX = 'UserSession_userId_key'
const NEW_INDEX = 'UserSession_userId_idx'
const prisma = new PrismaClient()

async function main() {
  if (!(process.env.DATABASE_URL ?? '').startsWith('mysql')) return

  let failed
  try {
    failed = await prisma.$queryRawUnsafe(
      'SELECT migration_name FROM `_prisma_migrations` WHERE migration_name = ? AND finished_at IS NULL AND rolled_back_at IS NULL LIMIT 1',
      MIGRATION_NAME,
    )
  } catch (error) {
    console.log(`[migrate] tidak dapat memeriksa riwayat migrasi: ${error instanceof Error ? error.message : error}`)
    return
  }
  if (!failed.length) return

  const rows = await prisma.$queryRawUnsafe(
    "SELECT INDEX_NAME AS name FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'UserSession' AND INDEX_NAME IN (?, ?)",
    UNIQUE_INDEX,
    NEW_INDEX,
  )
  const indexes = new Set(rows.map((row) => row.name))
  if (!indexes.has(UNIQUE_INDEX) || indexes.has(NEW_INDEX)) {
    throw new Error(`[migrate] ${MIGRATION_NAME} gagal dalam keadaan DDL sebagian; butuh penanganan manual`)
  }

  console.log(`[migrate] ${MIGRATION_NAME} gagal sebelum mengubah schema; menandai rolled back`)
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'resolve', '--rolled-back', MIGRATION_NAME], {
    stdio: 'inherit',
  })
}

try {
  await main()
} finally {
  await prisma.$disconnect()
}
