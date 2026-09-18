import type { PublicUser, UserRole } from '#shared/types/auth'
import { Buffer } from 'node:buffer'
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import process from 'node:process'
import { promisify } from 'node:util'
import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import { useDatabase } from '../database/client'
import { assets, sessions, users, wallets } from '../database/schema'
import { readSettings } from '../services/platform/connections'

const scrypt = promisify(scryptCallback)
const COOKIE_NAME = 'forkvdo_session'
const SESSION_DAYS = 30
export interface AuthUser {
  id: string
  email: string
  displayName: string
  avatarUrl: string | null
  role: UserRole
  status: 'pending' | 'active' | 'disabled'
  storageLimitBytes: number
  createdAt: Date
}
export function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}
export function hashToken(value: string) {
  return createHash('sha256').update(value).digest('hex')
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const derived = await scrypt(password, salt, 64) as Buffer
  return `scrypt:${salt.toString('base64')}:${derived.toString('base64')}`
}
export async function verifyPassword(password: string, stored: string) {
  const [algorithm, saltEncoded, hashEncoded] = stored.split(':')
  if (algorithm !== 'scrypt' || !saltEncoded || !hashEncoded)
    return false
  const expected = Buffer.from(hashEncoded, 'base64')
  const actual = await scrypt(password, Buffer.from(saltEncoded, 'base64'), expected.length) as Buffer
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
export async function registrationMode(): Promise<'open' | 'invite' | 'disabled'> {
  return (await readSettings()).registrationMode
}
export async function createSession(event: Parameters<typeof setCookie>[0], userId: string) {
  const rawToken = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  await useDatabase().insert(sessions).values({ userId, tokenHash: hashToken(rawToken), expiresAt })
  setCookie(event, COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  })
}
export async function destroySession(event: Parameters<typeof getCookie>[0]) {
  const token = getCookie(event, COOKIE_NAME)
  if (token)
    await useDatabase().delete(sessions).where(eq(sessions.tokenHash, hashToken(token)))
  deleteCookie(event, COOKIE_NAME, { path: '/' })
}
export async function optionalUser(event: Parameters<typeof getCookie>[0]): Promise<AuthUser | null> {
  const token = getCookie(event, COOKIE_NAME)
  if (!token)
    return null
  const [row] = await useDatabase()
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      role: users.role,
      status: users.status,
      storageLimitBytes: users.storageLimitBytes,
      createdAt: users.createdAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date()), eq(users.status, 'active')))
    .limit(1)
  return row ?? null
}
export async function requireUser(event: Parameters<typeof getCookie>[0]) {
  const user = await optionalUser(event)
  if (!user)
    throw createError({ statusCode: 401, statusMessage: '请先登录' })
  return user
}
export async function requireAdmin(event: Parameters<typeof getCookie>[0]) {
  const user = await requireUser(event)
  if (user.role !== 'admin')
    throw createError({ statusCode: 403, statusMessage: '需要管理员权限' })
  return user
}
export async function toPublicUser(user: AuthUser): Promise<PublicUser> {
  const db = useDatabase()
  const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, user.id)).limit(1)
  const [storage] = await db
    .select({ used: sql<number>`coalesce(sum(${assets.size}), 0)::bigint` })
    .from(assets)
    .where(and(eq(assets.ownerId, user.id), isNull(assets.deletedAt)))
  const balanceCredits = wallet?.balanceCredits ?? 0
  const reservedCredits = wallet?.reservedCredits ?? 0
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl || undefined,
    role: user.role,
    status: user.status,
    balanceCredits,
    reservedCredits,
    availableCredits: balanceCredits - reservedCredits,
    storageUsedBytes: Number(storage?.used ?? 0),
    storageLimitBytes: user.storageLimitBytes,
    createdAt: user.createdAt.toISOString(),
  }
}
export function assertSameOrigin(event: Parameters<typeof getHeader>[0]) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(event.method))
    return
  const origin = getHeader(event, 'origin')
  if (!origin)
    return
  const requestOrigin = getRequestURL(event).origin
  if (origin !== requestOrigin)
    throw createError({ statusCode: 403, statusMessage: '请求来源无效' })
}
