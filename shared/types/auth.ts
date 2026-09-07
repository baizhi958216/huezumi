export type UserRole = 'user' | 'admin'
export type UserStatus = 'pending' | 'active' | 'disabled'

export interface PublicUser {
  id: string
  email: string
  displayName: string
  avatarUrl?: string
  role: UserRole
  status: UserStatus
  balanceCredits: number
  reservedCredits: number
  availableCredits: number
  storageUsedBytes: number
  storageLimitBytes: number
  createdAt: string
}

export interface AuthSessionResponse {
  user: PublicUser | null
  registrationMode: 'open' | 'invite' | 'disabled'
}
