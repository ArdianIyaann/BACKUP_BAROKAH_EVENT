import { describe, expect, it } from 'vitest'
import { canDeleteAccount, isAccountRole, validatePassword, validateUsername } from './account'

describe('validateUsername', () => {
  it('menerima username wajar', () => {
    expect(validateUsername('owner')).toBeNull()
    expect(validateUsername(' admin.2 ') ).toBeNull()
  })

  it('menolak username kosong, spasi, dan karakter aneh', () => {
    expect(validateUsername('ab')).toContain('minimal')
    expect(validateUsername('admin crew')).toContain('Username hanya')
    expect(validateUsername('admin!')).toContain('Username hanya')
  })
})

describe('isAccountRole', () => {
  it('hanya menerima role yang dikenal', () => {
    expect(isAccountRole('OWNER')).toBe(true)
    expect(isAccountRole('ADMIN')).toBe(true)
    expect(isAccountRole('CREW')).toBe(true)
    expect(isAccountRole('ROOT')).toBe(false)
  })
})

describe('canDeleteAccount', () => {
  it('akun sendiri tidak bisa dihapus', () => {
    expect(canDeleteAccount({ isSelf: true, role: 'ADMIN', ownerCount: 2 })).toBe(false)
  })

  it('owner terakhir tidak bisa dihapus', () => {
    expect(canDeleteAccount({ isSelf: false, role: 'OWNER', ownerCount: 1 })).toBe(false)
    expect(canDeleteAccount({ isSelf: false, role: 'OWNER', ownerCount: 2 })).toBe(true)
  })

  it('admin dan crew boleh dihapus', () => {
    expect(canDeleteAccount({ isSelf: false, role: 'ADMIN', ownerCount: 1 })).toBe(true)
    expect(canDeleteAccount({ isSelf: false, role: 'CREW', ownerCount: 1 })).toBe(true)
  })
})

describe('validatePassword', () => {
  it('menerima password minimal 6 karakter', () => {
    expect(validatePassword('rahasia')).toBeNull()
  })

  it('menolak password pendek', () => {
    expect(validatePassword('12345')).toContain('minimal 6')
  })
})
