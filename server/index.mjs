// Servidor opcional do Campo: login, usuários e sincronização dos levantamentos no PostgreSQL.
// A aplicação (dist/) só é entregue a usuários autenticados. Ver server/README.md.
import './env.mjs'
import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { migrate, query } from './db.mjs'
import {
  MIN_PASSWORD, authenticate, clearFailures, createSession, destroySession, destroyUserSessions, generatePassword,
  hashPassword, loadSession, loginBlocked, passwordProblem, purgeExpiredSessions, registerFailure, verifyPassword,
} from './auth.mjs'
import { errorPage, esc, loginPage, passwordPage, usersPage } from './views.mjs'
import { workspaceRouter } from './workspace.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const PORT = Number(process.env.PORT || 3600)
const HOST = process.env.HOST || '127.0.0.1'
// Origens aceitas em formulários/API além do próprio host da requisição (separadas por vírgula).
const EXTRA_ORIGINS = (process.env.PUBLIC_ORIGIN || '').split(',').map(item => item.trim()).filter(Boolean)

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', 'loopback')

app.use((req, res, next) => {
  req.clientIp = String(req.get('cf-connecting-ip') || req.get('x-real-ip') || req.socket.remoteAddress || '')
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  })
  next()
})

app.get('/healthz', (_req, res) => res.type('text').send('ok'))
app.use(express.urlencoded({ extended: false, limit: '20kb' }))
app.use(loadSession)

// Proteção CSRF: Origin/Referer do próprio site em toda escrita + token da sessão (campo _csrf ou cabeçalho X-CSRF-Token).
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
app.use((req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next()
  const json = req.path.startsWith('/api/')
  const deny = message => json ? res.status(403).json({ error: message }) : res.status(403).send(errorPage({ status: 403, message, user: req.user, csrf: req.session?.csrf }))
  let origin = req.get('origin') || ''
  if (!origin && req.get('referer')) { try { origin = new URL(req.get('referer')).origin } catch { origin = 'invalida' } }
  const own = `${req.protocol}://${req.get('host')}`
  if (origin && origin !== own && !EXTRA_ORIGINS.includes(origin)) return deny('Origem da requisição não permitida.')
  if (req.session && req.path !== '/entrar') {
    const sent = String(req.get('x-csrf-token') || req.body?._csrf || '')
    const ok = sent.length === req.session.csrf.length && crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(req.session.csrf))
    if (!ok) return deny('Formulário expirado. Recarregue a página e tente novamente.')
  }
  next()
})
app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next() })

const safeNext = value => typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') ? value : '/'
const wantsHtml = req => req.method === 'GET' && (req.accepts(['html', 'json']) === 'html')

// ---------- Login ----------
app.get('/entrar', (req, res) => {
  if (req.user) return res.redirect(303, '/')
  res.send(loginPage({ next: safeNext(req.query.next) }))
})
app.post('/entrar', async (req, res, next) => {
  try {
    const username = String(req.body.username || '').trim().toLowerCase().slice(0, 64)
    const nextUrl = safeNext(req.body.next)
    const key = `${req.clientIp}|${username}`
    if (loginBlocked(key) || loginBlocked(req.clientIp + '|*', 40)) return res.status(429).send(loginPage({ error: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.', username, next: nextUrl }))
    const user = await authenticate(username, req.body.password)
    if (!user) {
      registerFailure(key); registerFailure(req.clientIp + '|*')
      return res.status(401).send(loginPage({ error: 'Usuário ou senha inválidos.', username, next: nextUrl }))
    }
    clearFailures(key)
    if (req.session) await destroySession(req, res)
    await createSession(res, user, req)
    res.redirect(303, user.must_change_password ? '/conta/senha' : nextUrl)
  } catch (error) { next(error) }
})
app.post('/sair', async (req, res, next) => {
  try { await destroySession(req, res); res.redirect(303, '/entrar') } catch (error) { next(error) }
})

// ---------- Daqui em diante, tudo exige login ----------
app.use((req, res, next) => {
  if (req.user) return next()
  if (wantsHtml(req)) return res.redirect(303, `/entrar${req.originalUrl && req.originalUrl !== '/' ? `?next=${encodeURIComponent(req.originalUrl)}` : ''}`)
  res.status(401).json({ error: 'Não autenticado.' })
})

app.get('/conta/senha', (req, res) => res.send(passwordPage({ user: req.user, csrf: req.session.csrf, min: MIN_PASSWORD })))
app.post('/conta/senha', async (req, res, next) => {
  try {
    const render = (status, props) => res.status(status).send(passwordPage({ user: req.user, csrf: req.session.csrf, min: MIN_PASSWORD, ...props }))
    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id])
    if (!rows[0] || !(await verifyPassword(String(req.body.current || ''), rows[0].password_hash))) return render(400, { error: 'A senha atual está incorreta.' })
    const problem = passwordProblem(req.body.password, req.body.confirm)
    if (problem) return render(400, { error: problem })
    if (req.body.password === req.body.current) return render(400, { error: 'A nova senha precisa ser diferente da atual.' })
    await query('UPDATE users SET password_hash = $2, must_change_password = FALSE, updated_at = now() WHERE id = $1', [req.user.id, await hashPassword(req.body.password)])
    await destroyUserSessions(req.user.id, req.session.hash)
    req.user.mustChangePassword = false
    render(200, { ok: 'Senha alterada com sucesso. <a href="/">Ir para os levantamentos</a>' })
  } catch (error) { next(error) }
})

// Troca obrigatória de senha no primeiro acesso / após redefinição.
app.use((req, res, next) => {
  if (!req.user.mustChangePassword) return next()
  if (wantsHtml(req)) return res.redirect(303, '/conta/senha')
  res.status(403).json({ error: 'Troca de senha obrigatória.' })
})

app.get('/api/me', (req, res) => res.json({ id: req.user.id, username: req.user.username, name: req.user.name, role: req.user.role, csrf: req.session.csrf }))
app.use('/api/workspace', workspaceRouter())

// ---------- Administração de usuários (somente admin) ----------
const admin = express.Router()
admin.use((req, res, next) => req.user.role === 'admin' ? next() : res.status(403).send(errorPage({ status: 403, message: 'Somente administradores podem gerenciar usuários.', user: req.user, csrf: req.session.csrf })))
const listUsers = async () => (await query('SELECT u.id, u.username, u.name, u.role, u.active, u.must_change_password, u.last_login_at, w.project_count, w.updated_at AS synced_at FROM users u LEFT JOIN workspaces w ON w.user_id = u.id ORDER BY u.active DESC, u.role, u.name')).rows
const renderUsers = async (req, res, status = 200, extra = {}) => res.status(status).send(usersPage({ user: req.user, csrf: req.session.csrf, users: await listUsers(), min: MIN_PASSWORD, ...extra }))
const target = async (req) => {
  const id = Number(req.params.id)
  if (!Number.isSafeInteger(id) || id === req.user.id) return null
  return (await query('SELECT * FROM users WHERE id = $1', [id])).rows[0] ?? null
}
const activeAdmins = async () => Number((await query("SELECT count(*) FROM users WHERE role = 'admin' AND active")).rows[0].count)

admin.get('/', (req, res, next) => renderUsers(req, res).catch(next))
admin.post('/', async (req, res, next) => {
  try {
    const form = { name: String(req.body.name || '').trim().slice(0, 80), username: String(req.body.username || '').trim().toLowerCase(), role: req.body.role === 'admin' ? 'admin' : 'usuario' }
    if (!form.name) return renderUsers(req, res, 400, { error: 'Informe o nome.', form })
    if (!/^[a-z0-9._-]{3,32}$/.test(form.username)) return renderUsers(req, res, 400, { error: 'Usuário inválido: use 3 a 32 letras minúsculas, números, ponto, hífen ou sublinhado.', form })
    const typed = String(req.body.password || '')
    const password = typed || generatePassword()
    const problem = passwordProblem(password)
    if (problem) return renderUsers(req, res, 400, { error: problem, form })
    const exists = await query('SELECT 1 FROM users WHERE username = $1', [form.username])
    if (exists.rowCount) return renderUsers(req, res, 400, { error: 'Já existe um usuário com esse nome de acesso.', form })
    await query('INSERT INTO users (username, name, password_hash, role, must_change_password) VALUES ($1, $2, $3, $4, TRUE)', [form.username, form.name, await hashPassword(password), form.role])
    renderUsers(req, res, 200, { ok: `Usuário <strong>${esc(form.username)}</strong> criado.${typed ? '' : ` Senha inicial: <span class="temp">${esc(password)}</span> — anote agora, ela não será exibida novamente.`}` })
  } catch (error) { next(error) }
})
admin.post('/:id/senha', async (req, res, next) => {
  try {
    const user = await target(req)
    if (!user) return renderUsers(req, res, 400, { error: 'Usuário inválido. Para trocar a sua própria senha use "Alterar senha".' })
    const password = generatePassword()
    await query('UPDATE users SET password_hash = $2, must_change_password = TRUE, updated_at = now() WHERE id = $1', [user.id, await hashPassword(password)])
    await destroyUserSessions(user.id)
    renderUsers(req, res, 200, { ok: `Senha de <strong>${esc(user.username)}</strong> redefinida. Senha temporária: <span class="temp">${esc(password)}</span> — anote agora; a troca será exigida no próximo acesso.` })
  } catch (error) { next(error) }
})
admin.post('/:id/papel', async (req, res, next) => {
  try {
    const user = await target(req)
    if (!user) return renderUsers(req, res, 400, { error: 'Você não pode alterar o próprio papel.' })
    const role = req.body.role === 'admin' ? 'admin' : 'usuario'
    if (user.role === 'admin' && role !== 'admin' && user.active && await activeAdmins() <= 1) return renderUsers(req, res, 400, { error: 'É preciso manter pelo menos um administrador ativo.' })
    await query('UPDATE users SET role = $2, updated_at = now() WHERE id = $1', [user.id, role])
    renderUsers(req, res, 200, { ok: `Papel de <strong>${esc(user.username)}</strong> atualizado para ${role === 'admin' ? 'Administrador' : 'Usuário'}.` })
  } catch (error) { next(error) }
})
for (const [action, active] of [['desativar', false], ['ativar', true]]) {
  admin.post(`/:id/${action}`, async (req, res, next) => {
    try {
      const user = await target(req)
      if (!user) return renderUsers(req, res, 400, { error: 'Você não pode desativar a própria conta.' })
      if (!active && user.role === 'admin' && user.active && await activeAdmins() <= 1) return renderUsers(req, res, 400, { error: 'É preciso manter pelo menos um administrador ativo.' })
      await query('UPDATE users SET active = $2, updated_at = now() WHERE id = $1', [user.id, active])
      if (!active) await destroyUserSessions(user.id)
      renderUsers(req, res, 200, { ok: `Usuário <strong>${esc(user.username)}</strong> ${active ? 'reativado' : 'desativado'}.` })
    } catch (error) { next(error) }
  })
}
app.use('/admin/usuarios', admin)

// ---------- Aplicação (SPA) ----------
let indexHtml = ''
const loadIndex = () => { try { indexHtml = readFileSync(path.join(dist, 'index.html'), 'utf8') } catch { indexHtml = '' } }
loadIndex()
const sendIndex = (req, res) => {
  if (!indexHtml) loadIndex()
  if (!indexHtml) return res.status(503).send(errorPage({ status: 503, message: 'A aplicação ainda não foi compilada.', user: req.user, csrf: req.session.csrf }))
  // Ativa no cliente o armazenamento local por usuário e a sincronização (src/sync.ts).
  const meta = `<meta name="campo-user" content="${esc(req.user.id)}"><meta name="campo-sync" content="api/workspace"><meta name="campo-csrf" content="${esc(req.session.csrf)}">`
  res.type('html').send(indexHtml.replace('<head>', `<head>${meta}`))
}
app.get(['/', '/index.html'], sendIndex)
app.use(express.static(dist, { index: false, maxAge: '1h', setHeaders: (res, file) => { if (file.includes(`${path.sep}assets${path.sep}`)) res.set('Cache-Control', 'private, max-age=31536000, immutable'); else res.set('Cache-Control', 'no-store') } }))
app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint não encontrado.' }))
app.use((req, res) => wantsHtml(req) && !path.extname(req.path) ? sendIndex(req, res) : res.status(404).send(errorPage({ status: 404, message: 'O endereço solicitado não existe.', user: req.user, csrf: req.session?.csrf })))

app.use((error, req, res, _next) => {
  if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'Levantamento grande demais para sincronizar.' })
  console.error(error)
  if (req.path.startsWith('/api/')) return res.status(500).json({ error: 'Erro interno do servidor.' })
  res.status(500).send(errorPage({ status: 500, message: 'Erro interno. Tente novamente em instantes.', user: req.user, csrf: req.session?.csrf }))
})

await migrate()
purgeExpiredSessions(); setInterval(purgeExpiredSessions, 3_600_000).unref()
app.listen(PORT, HOST, () => console.log(`Campo ouvindo em http://${HOST}:${PORT}`))
