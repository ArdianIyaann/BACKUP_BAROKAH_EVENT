'use client'

import { useState } from 'react'
import { Check, KeyRound, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { canDeleteAccount, isAccountRole, type AccountRole } from '@/lib/account'

export type AccountRow = {
  id: string
  username: string
  role: string
  name: string | null
  phone: string | null
}

export type CrewAssignment = {
  userId: string
  eventId: string
  eventTitle: string
  eventDate: string
  busName: string
}

const inputCls =
  'w-full rounded-xl border border-[#dfe4e8] bg-[#f8fafc] px-3 py-2.5 text-sm font-semibold text-[#1b3555] outline-none placeholder:text-[#9aa3af] focus:border-[#1b4f9c] focus:bg-white focus:ring-2 focus:ring-[#1b4f9c]/15'

const ROLE_CLS: Record<string, string> = {
  OWNER: 'bg-[#f3ecfb] text-[#7b3fd4]',
  ADMIN: 'bg-[#eef3fb] text-[#1b4f9c]',
  CREW: 'bg-[#eff1f4] text-[#657080]',
}

const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  CREW: 'Crew',
}

export function AccountManager({
  accounts: initialAccounts,
  currentUserId,
  canManageAll,
  ownerCount,
  crewAssignments,
}: {
  accounts: AccountRow[]
  currentUserId: string
  canManageAll: boolean
  ownerCount: number
  crewAssignments: CrewAssignment[]
}) {
  const [accounts, setAccounts] = useState(initialAccounts)
  const [editing, setEditing] = useState<AccountRow | 'new' | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [role, setRole] = useState<AccountRole>('CREW')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [filter, setFilter] = useState<'ALL' | 'CREW' | 'OTHER'>('ALL')

  const isNew = editing === 'new'
  const isSelf = editing !== null && editing !== 'new' && editing.id === currentUserId

  const crewCount = accounts.filter((row) => row.role === 'CREW').length
  const otherCount = accounts.length - crewCount
  const visibleAccounts = accounts.filter((row) =>
    filter === 'ALL' ? true : filter === 'CREW' ? row.role === 'CREW' : row.role !== 'CREW',
  )
  const groups = (['OWNER', 'ADMIN', 'CREW'] as const)
    .map((level) => ({ level, rows: visibleAccounts.filter((row) => row.role === level) }))
    .filter((group) => group.rows.length > 0)

  const assignmentsByUser = new Map<string, CrewAssignment[]>()
  for (const assignment of crewAssignments) {
    const list = assignmentsByUser.get(assignment.userId) ?? []
    list.push(assignment)
    assignmentsByUser.set(assignment.userId, list)
  }
  const eventMeta = new Map<string, { eventId: string; eventTitle: string; eventDate: string }>()
  for (const assignment of crewAssignments) {
    if (!eventMeta.has(assignment.eventId)) {
      eventMeta.set(assignment.eventId, {
        eventId: assignment.eventId,
        eventTitle: assignment.eventTitle,
        eventDate: assignment.eventDate,
      })
    }
  }
  const crewRows = visibleAccounts.filter((row) => row.role === 'CREW')
  const eventGroups = [...eventMeta.values()]
    .map((meta) => ({
      ...meta,
      crews: crewRows.flatMap((row) => {
        const matches = (assignmentsByUser.get(row.id) ?? []).filter((item) => item.eventId === meta.eventId)
        if (matches.length === 0) return []
        return [{ row, buses: [...new Set(matches.map((item) => item.busName))] }]
      }),
    }))
    .filter((group) => group.crews.length > 0)
  const unassignedCrew = crewRows.filter((row) => !assignmentsByUser.has(row.id))

  function openCreate() {
    setEditing('new')
    setUsername('')
    setPassword('')
    setConfirmPassword('')
    setCurrentPassword('')
    setRole('CREW')
    setName('')
    setPhone('')
    setError(null)
    setNotice(null)
  }

  function openEdit(row: AccountRow) {
    setEditing(row)
    setUsername(row.username)
    setPassword('')
    setConfirmPassword('')
    setCurrentPassword('')
    setRole(isAccountRole(row.role) ? row.role : 'CREW')
    setName(row.name ?? '')
    setPhone(row.phone ?? '')
    setError(null)
    setNotice(null)
  }

  function close() {
    setEditing(null)
    setPassword('')
    setConfirmPassword('')
    setCurrentPassword('')
    setError(null)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!editing) return
    setError(null)
    if (password && password !== confirmPassword) {
      setError('Password baru dan ulangannya tidak sama.')
      return
    }
    setSaving(true)
    try {
      const body: Record<string, string> = { username }
      const url = isNew ? '/api/admin/accounts' : `/api/admin/accounts/${encodeURIComponent(editing.id)}`
      if (isNew) {
        body.password = password
        body.role = role
      } else {
        body.name = name
        body.phone = phone
        if (password) body.password = password
        if (canManageAll) body.role = role
        if (isSelf) body.currentPassword = currentPassword
      }
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? 'Gagal menyimpan akun.')

      if (isNew) {
        const created = data.user as AccountRow
        setAccounts((rows) => [...rows, created])
      } else {
        setAccounts((rows) =>
          rows.map((row) => (row.id === editing.id ? { ...row, username, role, name: name || null, phone: phone || null } : row)),
        )
        if (data.signedOut && isSelf) {
          await fetch('/api/auth/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scope: 'ADMIN' }),
          })
          window.location.assign('/login?scope=ADMIN&next=/admin/akun')
          return
        }
      }
      setFilter('ALL')
      setNotice(isNew ? 'Akun baru berhasil dibuat.' : 'Akun berhasil diperbarui.')
      close()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan akun.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(row: AccountRow) {
    if (!window.confirm(`Hapus akun @${row.username}? Tindakan ini tidak bisa dibatalkan.`)) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/accounts/${encodeURIComponent(row.id)}`, { method: 'DELETE' })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? 'Gagal menghapus akun.')
      setAccounts((rows) => rows.filter((item) => item.id !== row.id))
      setNotice(`Akun @${row.username} dihapus.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus akun.')
    } finally {
      setSaving(false)
    }
  }

  function renderAccountRow(row: AccountRow, buses?: string[]) {
    const deletable = canDeleteAccount({ isSelf: row.id === currentUserId, role: row.role, ownerCount })
    return (
      <tr key={row.id} className="text-[#1b3555]">
        <td className="py-2 pr-3 font-bold">
          @{row.username}
          {row.id === currentUserId && <span className="ml-1 text-[10px] text-[#9aa3af]">(Anda)</span>}
        </td>
        {buses && <td className="py-2 pr-3 text-[#657080]">{buses.join(', ') || '—'}</td>}
        <td className="py-2 pr-3 text-[#657080]">{row.name ?? '—'}</td>
        <td className="py-2 pr-3 text-[#657080]">{row.phone ?? '—'}</td>
        <td className="py-2 text-right">
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => openEdit(row)}
              className="inline-flex items-center gap-1 rounded-full border border-[#dfe4e8] px-3 py-1.5 text-[11px] font-bold text-[#1b4f9c] transition-colors hover:bg-[#eef4fb]"
            >
              <Pencil size={11} /> Ubah
            </button>
            {canManageAll && (
              <button
                type="button"
                onClick={() => remove(row)}
                disabled={!deletable || saving}
                title={deletable ? `Hapus ${row.username}` : 'Akun sendiri dan owner terakhir tidak bisa dihapus'}
                className="inline-flex items-center gap-1 rounded-full border border-[#f3d4d4] px-3 py-1.5 text-[11px] font-bold text-[#c0392b] transition-colors hover:bg-[#fdeaea] disabled:opacity-40"
              >
                <Trash2 size={11} /> Hapus
              </button>
            )}
          </div>
        </td>
      </tr>
    )
  }

  return (
    <div className="space-y-5">
      {notice && (
        <p className="flex items-center gap-2 rounded-xl bg-[#e6f4ea] px-3 py-2.5 text-xs font-bold text-[#2ca84a]">
          <Check size={14} /> {notice}
        </p>
      )}

      <div className="rounded-2xl border border-[#dfe4e8] bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-[#1b3555]">Daftar Akun</h2>
            <p className="mt-0.5 text-xs text-[#657080]">
              {canManageAll
                  ? 'Owner bisa menambah, mengubah, dan menghapus akun. Akun crew dikelompokkan per event dari penugasan unit.'
                : 'Ubah username dan password akun Anda sendiri.'}
            </p>
          </div>
          {canManageAll && (
            <button
              type="button"
              onClick={openCreate}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#1b4f9c] px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-[#143d79]"
            >
              <Plus size={13} /> Tambah Akun
            </button>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {([
            { key: 'ALL', label: 'Semua', count: accounts.length },
            { key: 'OTHER', label: 'Lainnya (Owner/Admin)', count: otherCount },
            { key: 'CREW', label: 'Crew', count: crewCount },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              type="button"
              aria-pressed={filter === tab.key}
              onClick={() => setFilter(tab.key)}
              className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors ${
                filter === tab.key
                  ? 'bg-[#1b4f9c] text-white'
                  : 'border border-[#dfe4e8] bg-white text-[#657080] hover:bg-[#f1f5fb]'
              }`}
            >
              {tab.label} <span className={filter === tab.key ? 'text-white/70' : 'text-[#9aa3af]'}>{tab.count}</span>
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-4">
          {groups.map((group) => (
            <div key={group.level}>
              <div className="mb-2 flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${ROLE_CLS[group.level]}`}>
                  {ROLE_LABEL[group.level]}
                </span>
                <span className="text-[11px] font-semibold text-[#9aa3af]">{group.rows.length} akun</span>
              </div>
              {group.level === 'CREW' ? (
                <div className="space-y-3">
                  {eventGroups.map((eventGroup) => (
                    <div key={eventGroup.eventId} className="overflow-hidden rounded-xl border border-[#eef0f3]">
                      <div className="flex flex-wrap items-center gap-2 bg-[#f8fafc] px-3 py-2">
                        <span className="text-xs font-bold text-[#1b3555]">{eventGroup.eventTitle}</span>
                        <span className="text-[11px] font-semibold text-[#9aa3af]">{eventGroup.eventDate}</span>
                        <span className="ml-auto rounded-full bg-[#eef3fb] px-2 py-0.5 text-[10px] font-bold text-[#1b4f9c]">
                          {eventGroup.crews.length} crew
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[560px] text-left text-xs">
                          <thead className="text-[11px] font-bold uppercase tracking-wide text-[#9aa3af]">
                            <tr className="border-b border-[#eef0f3]">
                              <th className="py-2 pr-3">Username</th>
                              <th className="py-2 pr-3">Unit</th>
                              <th className="py-2 pr-3">Nama</th>
                              <th className="py-2 pr-3">No. HP</th>
                              <th className="py-2 text-right">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#f4f6f8]">
                            {eventGroup.crews.map(({ row, buses }) => renderAccountRow(row, buses))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}

                  {unassignedCrew.length > 0 && (
                    <div className="overflow-hidden rounded-xl border border-dashed border-[#dfe4e8]">
                      <div className="flex flex-wrap items-center gap-2 bg-[#f8fafc] px-3 py-2">
                        <span className="text-xs font-bold text-[#657080]">Tanpa Event</span>
                        <span className="text-[11px] font-semibold text-[#9aa3af]">belum ditugaskan ke unit/event</span>
                        <span className="ml-auto rounded-full bg-[#f1f3f5] px-2 py-0.5 text-[10px] font-bold text-[#657080]">
                          {unassignedCrew.length} akun
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[560px] text-left text-xs">
                          <thead className="text-[11px] font-bold uppercase tracking-wide text-[#9aa3af]">
                            <tr className="border-b border-[#eef0f3]">
                              <th className="py-2 pr-3">Username</th>
                              <th className="py-2 pr-3">Unit</th>
                              <th className="py-2 pr-3">Nama</th>
                              <th className="py-2 pr-3">No. HP</th>
                              <th className="py-2 text-right">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#f4f6f8]">
                            {unassignedCrew.map((row) => renderAccountRow(row, []))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {eventGroups.length === 0 && unassignedCrew.length === 0 && (
                    <p className="rounded-xl border border-dashed border-[#dfe4e8] px-3 py-6 text-center text-xs font-semibold text-[#9aa3af]">
                      Belum ada akun crew.
                    </p>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-[#eef0f3]">
                  <table className="w-full min-w-[560px] text-left text-xs">
                    <thead className="text-[11px] font-bold uppercase tracking-wide text-[#9aa3af]">
                      <tr className="border-b border-[#eef0f3]">
                        <th className="py-2 pr-3">Username</th>
                        <th className="py-2 pr-3">Nama</th>
                        <th className="py-2 pr-3">No. HP</th>
                        <th className="py-2 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f4f6f8]">
                      {group.rows.map((row) => renderAccountRow(row))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
          {groups.length === 0 && (
            <p className="rounded-xl border border-dashed border-[#dfe4e8] px-3 py-6 text-center text-xs font-semibold text-[#9aa3af]">
              Tidak ada akun pada filter ini.
            </p>
          )}
        </div>
        <p className="mt-3 rounded-xl bg-[#f8fafc] px-3 py-2 text-[11px] font-semibold text-[#657080]">
          Satu akun hanya bisa aktif di satu perangkat. Login di perangkat lain ditolak sampai akun logout.
        </p>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={isNew ? 'Tambah akun' : `Ubah akun ${editing.username}`}
            className="animate-fade-up flex max-h-[90vh] w-full max-w-sm flex-col overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-[#1b3555]">
                {isNew ? 'Tambah Akun' : `Ubah Akun @${editing.username}`}
              </h3>
              <button
                type="button"
                onClick={close}
                aria-label="Tutup"
                className="rounded-full p-1 text-[#657080] hover:bg-[#f1f3f5]"
              >
                <X size={15} />
              </button>
            </div>

            <form onSubmit={submit} className="mt-4 space-y-3">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wide text-[#9aa3af]">Username</label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  minLength={3}
                  className={`mt-1 ${inputCls}`}
                />
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wide text-[#9aa3af]">Level</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as AccountRole)}
                  disabled={!canManageAll}
                  className={`mt-1 ${inputCls} disabled:opacity-60`}
                >
                  <option value="OWNER">Owner</option>
                  <option value="ADMIN">Admin</option>
                  <option value="CREW">Crew</option>
                </select>
              </div>
              {!isNew && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wide text-[#9aa3af]">Nama</label>
                    <input value={name} onChange={(e) => setName(e.target.value)} className={`mt-1 ${inputCls}`} />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wide text-[#9aa3af]">No. HP</label>
                    <input value={phone} onChange={(e) => setPhone(e.target.value)} className={`mt-1 ${inputCls}`} />
                  </div>
                </div>
              )}
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wide text-[#9aa3af]">
                  Password {isNew ? '' : <span className="normal-case text-[#b0b8c2]">(kosongkan bila tidak diubah)</span>}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required={isNew}
                  minLength={password ? 6 : undefined}
                  autoComplete="new-password"
                  className={`mt-1 ${inputCls}`}
                />
              </div>
              {password && (
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wide text-[#9aa3af]">
                    Ulangi password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    minLength={6}
                    autoComplete="new-password"
                    className={`mt-1 ${inputCls}`}
                  />
                </div>
              )}
              {isSelf && (
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wide text-[#9aa3af]">
                    Password saat ini
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className={`mt-1 ${inputCls}`}
                  />
                </div>
              )}

              {error && (
                <p className="rounded-xl bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-600">{error}</p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={close}
                  className="rounded-full border border-[#dfe4e8] px-4 py-2 text-xs font-bold text-[#657080] hover:bg-[#f1f3f5]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving || !username || (isNew && password.length < 6) || (isSelf && !currentPassword)}
                  className="flex items-center gap-1.5 rounded-full bg-[#1b4f9c] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[#143d79] active:scale-95 disabled:opacity-60"
                >
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />}{' '}
                  {isNew ? 'Buat Akun' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
