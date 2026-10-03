import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { query } from './db.mjs'

export const COOKIE = '__Host-campo_sid'
// Sessão longa e deslizante: quem passa dias em obra sem internet não perde o acesso.
const SESSION_DAYS = 30
const BCRYPT_ROUNDS = 12
export const MIN_PASSWORD = 10

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
export const hashPassword = password => bcrypt.hash(password, BCRYPT_ROUNDS)
export const verifyPassword = (password, hash) => bcrypt.compare(password, hash)
// Hash fixo para gastar o mesmo tempo quando o usuário não existe.
const DUMMY_HASH = bcrypt.hashSync('usuario-inexistente', BCRYPT_ROUNDS)

export function generatePassword(length = 16) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = crypto.randomBytes(length)
  let out = ''
  for (const byte of bytes) out += alphabet[byte % alphabet.length]
  return out
}

export function passwordProblem(password, confirm) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) return `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`
  if (password.length > 200) return 'A senha é longa demais.'
  if (confirm !== undefined && password !== confirm) return 'A confirmação não confere com a nova senha.'
  return ''
}

export function parseCookies(header = '') {
  const out = {}
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    const key = part.slice(0, index).trim()
    if (key) out[key] = decodeURIComponent(part.slice(index + 1).trim())
  }
  return out
}

export async function authenticate(username, password) {
  const { rows } = await query('SELECT * FROM users WHERE username = $1', [String(username || '').trim().toLowerCase()])
  const user = rows[0]
  const ok = await verifyPassword(String(password || ''), user?.password_hash ?? DUMMY_HASH)
  if (!user || !ok || !user.active) return null
  return user
}

export async function createSession(res, user, req) {
  const token = crypto.randomBytes(32).toString('base64url')
  const csrf = crypto.randomBytes(24).toString('base64url')
  await query(
    `INSERT INTO sessions (token_hash, user_id, csrf_token, expires_at, ip, user_agent)
     VALUES ($1, $2, $3, now() + make_interval(days => $4), $5, $6)`,
    [sha256(token), user.id, csrf, SESSION_DAYS, req.clientIp, String(req.get('user-agent') || '').slice(0, 300)],
  )
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id])
  res.cookie(COOKIE, token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: SESSION_DAYS * 86_400_000 })
}

export async function destroySession(req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE]
  if (token) await query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)])
  res.clearCookie(COOKIE, { httpOnly: true, secure: true, sameSite: 'lax', path: '/' })
}

export const destroyUserSessions = (userId, exceptHash) => exceptHash
  ? query('DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2', [userId, exceptHash])
  : query('DELETE FROM sessions WHERE user_id = $1', [userId])

// Carrega o usuário da sessão (se houver) em req.user / req.session.
export async function loadSession(req, res, next) {
  try {
    const token = parseCookies(req.headers.cookie)[COOKIE]
    if (token) {
      const hash = sha256(token)
      const { rows } = await query(
        `SELECT s.token_hash, s.csrf_token, s.last_seen, u.id, u.username, u.name, u.role, u.active, u.must_change_password
           FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.token_hash = $1 AND s.expires_at > now()`, [hash])
      const row = rows[0]
      if (row && row.active) {
        req.session = { hash: row.token_hash, csrf: row.csrf_token }
        req.user = { id: row.id, username: row.username, name: row.name, role: row.role, mustChangePassword: row.must_change_password }
        // Renovação deslizante, no máximo uma escrita a cada 10 minutos.
        if (Date.now() - new Date(row.last_seen).getTime() > 600_000) {
          await query(`UPDATE sessions SET last_seen = now(), expires_at = now() + make_interval(days => $2) WHERE token_hash = $1`, [hash, SESSION_DAYS])
          res.cookie(COOKIE, token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: SESSION_DAYS * 86_400_000 })
        }
      }
    }
    next()
  } catch (error) { next(error) }
}

export function purgeExpiredSessions() {
  return query('DELETE FROM sessions WHERE expires_at < now()').catch(error => console.error('Falha ao limpar sessões', error))
}

// Limite simples de tentativas de login (memória do processo).
const attempts = new Map()
const WINDOW_MS = 15 * 60_000, MAX_ATTEMPTS = 8
export function loginBlocked(key, max = MAX_ATTEMPTS) {
  const entry = attempts.get(key)
  if (!entry || Date.now() - entry.first > WINDOW_MS) return false
  return entry.count >= max
}
export function registerFailure(key) {
  const entry = attempts.get(key)
  if (!entry || Date.now() - entry.first > WINDOW_MS) attempts.set(key, { first: Date.now(), count: 1 })
  else entry.count++
}
export const clearFailures = key => attempts.delete(key)
setInterval(() => { const now = Date.now(); for (const [key, entry] of attempts) if (now - entry.first > WINDOW_MS) attempts.delete(key) }, 60_000).unref()
