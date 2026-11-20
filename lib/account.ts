export const USERNAME_MIN = 3
export const USERNAME_MAX = 191
export const PASSWORD_MIN = 6

export const ACCOUNT_ROLES = ['OWNER', 'ADMIN', 'CREW'] as const
export type AccountRole = (typeof ACCOUNT_ROLES)[number]

export function isAccountRole(value: string): value is AccountRole {
  return (ACCOUNT_ROLES as readonly string[]).includes(value)
}

export function canDeleteAccount(input: { isSelf: boolean; role: string; ownerCount: number }): boolean {
  if (input.isSelf) return false
  if (input.role === 'OWNER' && input.ownerCount <= 1) return false
  return true
}

export function validateUsername(value: string): string | null {
  const username = value.trim()
  if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) {
    return `Username minimal ${USERNAME_MIN} dan maksimal ${USERNAME_MAX} karakter.`
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
    return 'Username hanya boleh berisi huruf, angka, titik, garis bawah, dan tanda hubung.'
  }
  return null
}

export function validatePassword(value: string): string | null {
  if (value.length < PASSWORD_MIN) return `Password minimal ${PASSWORD_MIN} karakter.`
  return null
}
