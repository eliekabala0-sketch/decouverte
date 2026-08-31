import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import type { NextFunction, Request, Response } from 'express'
import type { RowDataPacket } from 'mysql2'
import { config } from './config.js'
import { one } from './db.js'

export type AuthUser = { id: string; email: string; role: string }
export type AuthedRequest = Request & { user?: AuthUser }

type UserRow = RowDataPacket & {
  id: string
  email: string
  password_hash: string
  role: string
  status: string
}

export async function verifyCredentials(email: string, password: string) {
  const user = await one<UserRow>(
    'SELECT id, email, password_hash, role, status FROM users WHERE email = ? LIMIT 1',
    [email.toLowerCase()],
  )
  if (!user || user.status !== 'active' || !(await bcrypt.compare(password, user.password_hash))) return null
  return { id: user.id, email: user.email, role: user.role } satisfies AuthUser
}

export function issueAccessToken(user: AuthUser) {
  return jwt.sign({ email: user.email, role: user.role }, config.JWT_SECRET, {
    subject: user.id,
    issuer: config.JWT_ISSUER,
    audience: 'decouverte-app',
    expiresIn: '15m',
  })
}

export function issueRefreshToken(user: AuthUser) {
  return jwt.sign({ type: 'refresh' }, config.JWT_SECRET, {
    subject: user.id,
    issuer: config.JWT_ISSUER,
    audience: 'decouverte-refresh',
    expiresIn: '30d',
  })
}

export async function refreshSession(token: string) {
  const payload = jwt.verify(token, config.JWT_SECRET, {
    issuer: config.JWT_ISSUER,
    audience: 'decouverte-refresh',
  }) as jwt.JwtPayload
  if (payload.type !== 'refresh' || !payload.sub) return null
  const user = await one<UserRow>('SELECT id, email, role, status, password_hash FROM users WHERE id = ? LIMIT 1', [payload.sub])
  if (!user || user.status !== 'active') return null
  return { id: user.id, email: user.email, role: user.role } satisfies AuthUser
}

export function requireAuth(request: AuthedRequest, response: Response, next: NextFunction) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '')
  if (!token) return response.status(401).json({ error: 'authentication_required' })
  try {
    const payload = jwt.verify(token, config.JWT_SECRET, {
      issuer: config.JWT_ISSUER,
      audience: 'decouverte-app',
    }) as jwt.JwtPayload
    request.user = { id: String(payload.sub), email: String(payload.email), role: String(payload.role ?? 'user') }
    next()
  } catch {
    response.status(401).json({ error: 'invalid_or_expired_token' })
  }
}

export function verifyAccessToken(token: string): AuthUser {
  const payload = jwt.verify(token, config.JWT_SECRET, {
    issuer: config.JWT_ISSUER,
    audience: 'decouverte-app',
  }) as jwt.JwtPayload
  return { id: String(payload.sub), email: String(payload.email), role: String(payload.role ?? 'user') }
}
