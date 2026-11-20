import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { requireAdminSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { AccountManager } from '@/components/admin/account-manager'
import { formatTanggalPendek } from '@/lib/dates'

export const metadata: Metadata = { title: 'Akun – Panel Admin', robots: { index: false } }
export const dynamic = 'force-dynamic'

export default async function AccountPage() {
  const session = await requireAdminSession()
  if (!session) redirect('/login?scope=ADMIN&next=/admin/akun')

  const [rows, ownerCount, events] = await Promise.all([
    prisma.user.findMany({
      where: session.role === 'OWNER' ? {} : { id: session.sub },
      orderBy: [{ role: 'asc' }, { username: 'asc' }],
      select: { id: true, username: true, role: true, name: true, phone: true },
    }),
    prisma.user.count({ where: { role: 'OWNER' } }),
    prisma.event.findMany({
      orderBy: { date: 'desc' },
      select: {
        id: true,
        title: true,
        date: true,
        buses: {
          orderBy: { name: 'asc' },
          select: { name: true, workers: { select: { userId: true } } },
        },
      },
    }),
  ])

  const crewAssignments = events.flatMap((event) =>
    event.buses.flatMap((bus) =>
      bus.workers.map((worker) => ({
        userId: worker.userId,
        eventId: event.id,
        eventTitle: event.title,
        eventDate: formatTanggalPendek(event.date),
        busName: bus.name,
      })),
    ),
  )

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-bold text-[#1b3555]">Akun &amp; Kredensial</h1>
      <p className="mt-0.5 text-sm text-[#657080]">Kelola username dan password akun panel.</p>
      <div className="mt-5">
        <AccountManager
          accounts={rows.map((row) => ({ ...row, role: String(row.role) }))}
          currentUserId={session.sub}
          canManageAll={session.role === 'OWNER'}
          ownerCount={ownerCount}
          crewAssignments={crewAssignments}
        />
      </div>
    </div>
  )
}
