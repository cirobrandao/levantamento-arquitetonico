// Teste de integração do servidor opcional. Requer um banco PostgreSQL descartável:
//   TEST_DATABASE_URL=postgres://usuario:senha@127.0.0.1:5432/campo_test node tests/server.mjs
// Sem TEST_DATABASE_URL o teste é ignorado (o app estático não depende do servidor).
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const url = process.env.TEST_DATABASE_URL
if (!url) { console.log('Servidor: ignorado (defina TEST_DATABASE_URL para testar com PostgreSQL).'); process.exit(0) }
const pg = (await import('pg')).default
const db = new pg.Client({ connectionString: url }); await db.connect()
await db.query('DROP TABLE IF EXISTS photo_files, workspace_versions, workspaces, sessions, users CASCADE')
const port = 43000 + Math.floor(Math.random() * 1000), base = `http://127.0.0.1:${port}`
const photoDir = (await import('node:fs')).mkdtempSync((await import('node:path')).join((await import('node:os')).tmpdir(), 'campo-fotos-'))
const env = { ...process.env, PHOTO_STORAGE_DIR: photoDir, DATABASE_URL: url, PORT: String(port), HOST: '127.0.0.1', ADMIN_USERNAME: 'chefe', ADMIN_PASSWORD: 'Senha-inicial-123' }
const root = fileURLToPath(new URL('..', import.meta.url))
const seed = spawn(process.execPath, ['server/seed.mjs'], { cwd: root, env, stdio: 'pipe' })
await new Promise((resolve, reject) => seed.on('exit', code => code === 0 ? resolve() : reject(new Error('seed falhou'))))
const server = spawn(process.execPath, ['server/index.mjs'], { cwd: root, env, stdio: ['ignore', 'pipe', 'inherit'] })
await new Promise(resolve => server.stdout.on('data', chunk => { if (String(chunk).includes('ouvindo')) resolve() }))
try {
  const jar = () => { const cookies = {}; return { cookies, header: () => Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ') } }
  async function call(session, path, { method = 'GET', form, json, headers = {}, accept = 'text/html' } = {}) {
    const init = { method, redirect: 'manual', headers: { Accept: accept, Origin: base, Cookie: session.header(), ...headers } }
    if (form) { init.body = new URLSearchParams(form).toString(); init.headers['Content-Type'] = 'application/x-www-form-urlencoded' }
    if (json !== undefined) { init.body = typeof json === 'string' ? json : JSON.stringify(json); init.headers['Content-Type'] = 'application/json' }
    const response = await fetch(base + path, init)
    for (const line of response.headers.getSetCookie()) { const [pair] = line.split(';'); const [key, value] = pair.split('='); if (value) session.cookies[key] = value; else delete session.cookies[key] }
    return { status: response.status, location: response.headers.get('location'), text: await response.text() }
  }
  const csrfOf = text => text.match(/name="(?:_csrf|campo-csrf)" (?:value|content)="([^"]+)"/)?.[1]
  async function login(username, password) {
    const session = jar(); const result = await call(session, '/entrar', { method: 'POST', form: { username, password } }); return { session, result }
  }
  // Anônimo
  const anon = jar()
  assert.equal((await call(anon, '/')).status, 303)
  assert.equal((await call(anon, '/api/workspace', { accept: 'application/json' })).status, 401)
  assert.equal((await login('chefe', 'errada')).result.status, 401)
  // Primeiro acesso exige troca de senha
  const { session: admin, result } = await login('chefe', 'Senha-inicial-123')
  assert.equal(result.location, '/conta/senha')
  assert.equal((await call(admin, '/api/workspace', { accept: 'application/json' })).status, 403)
  let page = await call(admin, '/conta/senha')
  assert.equal((await call(admin, '/conta/senha', { method: 'POST', form: { _csrf: csrfOf(page.text), current: 'Senha-inicial-123', password: 'curta', confirm: 'curta' } })).status, 400)
  assert.equal((await call(admin, '/conta/senha', { method: 'POST', form: { current: 'Senha-inicial-123', password: 'Senha-nova-456', confirm: 'Senha-nova-456' } })).status, 403, 'sem CSRF')
  assert.equal((await call(admin, '/conta/senha', { method: 'POST', form: { _csrf: csrfOf(page.text), current: 'Senha-inicial-123', password: 'Senha-nova-456', confirm: 'Senha-nova-456' } })).status, 200)
  // A página do app recebe as metas de usuário/sincronização (requer dist/; ignora se não houver build)
  page = await call(admin, '/')
  const csrf = csrfOf(page.text) ?? csrfOf((await call(admin, '/conta/senha')).text)
  if (page.status === 200) assert.match(page.text, /<meta name="campo-sync" content="api\/workspace">/)
  // Sincronização com controle de revisão
  const api = (session, path, options = {}) => call(session, `/api/workspace${path}`, { accept: 'application/json', headers: { 'X-CSRF-Token': csrf, ...(options.headers ?? {}) }, ...options })
  const snapshot = (revision, names) => ({ schemaVersion: 4, revision, savedAt: new Date().toISOString(), data: { projects: names.map((name, i) => ({ id: `p${i}`, name, floors: [], relationships: [] })), projectId: 'p0', floorId: '', roomId: '' } })
  assert.equal((await api(admin, '')).status, 204)
  assert.equal((await api(admin, '', { method: 'PUT', json: { baseRevision: null, snapshot: { schemaVersion: 1 } } })).status, 422)
  assert.equal((await api(admin, '', { method: 'PUT', json: { baseRevision: null, snapshot: snapshot('r1', ['Casa']) }, headers: { 'X-CSRF-Token': 'x' } })).status, 403, 'CSRF na API')
  assert.equal((await api(admin, '', { method: 'PUT', json: { baseRevision: null, snapshot: snapshot('r1', ['Casa']) }, headers: { Origin: 'https://outro.example' } })).status, 403, 'origem estranha')
  assert.equal((await api(admin, '', { method: 'PUT', json: { baseRevision: null, snapshot: snapshot('r1', ['Casa']) } })).status, 200)
  assert.equal(JSON.parse((await api(admin, '/head')).text).revision, 'r1')
  assert.equal((await api(admin, '', { method: 'PUT', json: { baseRevision: 'r1', snapshot: snapshot('r2', ['Casa 2']) } })).status, 200)
  const conflict = await api(admin, '', { method: 'PUT', json: { baseRevision: 'r1', snapshot: snapshot('r3', ['Outro aparelho']) } })
  assert.equal(conflict.status, 409); assert.equal(JSON.parse(conflict.text).current.revision, 'r2')
  assert.equal((await api(admin, '', { method: 'PUT', json: { baseRevision: 'r1', snapshot: snapshot('r2', ['Casa 2']) } })).status, 200, 'reenvio da mesma revisão é idempotente')
  // Carimbos por projeto: gravados com o documento e devolvidos no GET ?with=meta e no 409
  const meta = { p0: { updatedAt: '2026-10-03T18:00:00.000Z' }, velho: { updatedAt: '2026-10-03T17:00:00.000Z', deleted: true } }
  assert.equal((await api(admin, '', { method: 'PUT', json: { baseRevision: 'r2', meta: { p0: { updatedAt: 5 } }, snapshot: snapshot('r2b', ['Casa 2']) } })).status, 422, 'carimbo inválido')
  assert.equal((await api(admin, '', { method: 'PUT', json: { baseRevision: 'r2', meta, snapshot: snapshot('r2b', ['Casa 2']) } })).status, 200)
  const withMeta = JSON.parse((await api(admin, '?with=meta')).text)
  assert.deepEqual(withMeta.meta, meta); assert.equal(withMeta.snapshot.revision, 'r2b')
  const conflict2 = JSON.parse((await api(admin, '', { method: 'PUT', json: { baseRevision: 'r1', meta: {}, snapshot: snapshot('r9', ['X']) } })).text)
  assert.deepEqual(conflict2.meta, meta)
  const special = snapshot('r4', ['Valores']); special.data.projects[0].floors = [{ id: 'f', name: 'T', rooms: [{ lengthM: { $campoNumber: 'NaN' }, x: 4.125 }] }]
  assert.equal((await api(admin, '', { method: 'PUT', json: { baseRevision: 'r2b', snapshot: special } })).status, 200)
  const stored = JSON.parse((await api(admin, '')).text)
  assert.deepEqual(stored.data.projects[0].floors[0].rooms[0], { lengthM: { $campoNumber: 'NaN' }, x: 4.125 }, 'valores especiais e decimais preservados')
  // Resolução de conflito: a versão substituída sempre vai para o histórico (mesmo com o limite de 10 minutos).
  assert.equal((await api(admin, '', { method: 'PUT', json: { baseRevision: 'r4', resolvesConflict: true, snapshot: snapshot('r5', ['União']) } })).status, 200)
  const versions = JSON.parse((await api(admin, '/versions')).text)
  assert.deepEqual(versions.map(v => [v.revision, v.reason]), [['r4', 'conflito'], ['r1', 'substituida']])
  assert.equal(JSON.parse((await api(admin, `/versions/${versions[1].id}`)).text).data.projects[0].name, 'Casa')
  assert.equal((await api(admin, '/versions/abc')).status, 404)
  // Gestão de usuários: admin cria; usuário comum não acessa; dados isolados por usuário
  page = await call(admin, '/admin/usuarios'); assert.equal(page.status, 200)
  page = await call(admin, '/admin/usuarios', { method: 'POST', form: { _csrf: csrf, name: 'Fulana', username: 'fulana', role: 'usuario', password: 'Fulana-inicial-1' } })
  assert.equal(page.status, 200); assert.match(page.text, /fulana/)
  assert.equal((await call(admin, '/admin/usuarios', { method: 'POST', form: { _csrf: csrf, name: 'Dup', username: 'fulana', role: 'usuario' } })).status, 400)
  const { session: user } = await login('fulana', 'Fulana-inicial-1')
  let userPage = await call(user, '/conta/senha')
  await call(user, '/conta/senha', { method: 'POST', form: { _csrf: csrfOf(userPage.text), current: 'Fulana-inicial-1', password: 'Fulana-nova-222', confirm: 'Fulana-nova-222' } })
  userPage = await call(user, '/conta/senha')
  const userCsrf = csrfOf(userPage.text)
  assert.equal((await call(user, '/admin/usuarios')).status, 403)
  assert.equal((await call(user, '/admin/usuarios', { method: 'POST', form: { _csrf: userCsrf, name: 'x', username: 'hacker', role: 'admin' } })).status, 403)
  assert.equal((await call(user, '/api/workspace', { accept: 'application/json' })).status, 204, 'cada usuário tem seu próprio levantamento')
  // Fotos sincronizadas: arquivos por usuário, CSRF exigido, isolamento entre usuários.
  const photo = (session, path, init = {}) => fetch(`${base}/api/photos${path}`, { ...init, headers: { Accept: 'application/json', Origin: base, Cookie: session.header(), ...(init.headers ?? {}) } })
  const bytes = new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9])
  assert.equal((await photo(user, '/foto-1', { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: bytes })).status, 403, 'sem CSRF')
  assert.equal((await photo(user, '/foto-1', { method: 'PUT', headers: { 'Content-Type': 'image/jpeg', 'X-CSRF-Token': userCsrf }, body: bytes })).status, 201)
  assert.equal((await photo(user, '/foto-1/thumbnail', { method: 'PUT', headers: { 'Content-Type': 'image/jpeg', 'X-CSRF-Token': userCsrf }, body: new Uint8Array([7]) })).status, 201)
  assert.equal((await photo(user, '/..%2Fsegredo', { method: 'PUT', headers: { 'Content-Type': 'image/jpeg', 'X-CSRF-Token': userCsrf }, body: bytes })).status, 422)
  assert.equal((await photo(user, '/foto-2', { method: 'PUT', headers: { 'Content-Type': 'text/html', 'X-CSRF-Token': userCsrf }, body: bytes })).status, 422)
  assert.deepEqual(await (await photo(user, '')).json(), [{ fileId: 'foto-1', mimeType: 'image/jpeg', size: 7, thumbnail: true }])
  const got = await photo(user, '/foto-1'); assert.equal(got.status, 200); assert.equal(got.headers.get('content-type'), 'image/jpeg'); assert.deepEqual(new Uint8Array(await got.arrayBuffer()), bytes)
  assert.deepEqual(new Uint8Array(await (await photo(user, '/foto-1?thumbnail=1')).arrayBuffer()), new Uint8Array([7]))
  assert.equal((await photo(admin, '/foto-1')).status, 404, 'fotos de outro usuário não são visíveis')
  assert.deepEqual(await (await photo(admin, '')).json(), [])
  // Desativar derruba a sessão; último admin não pode ser rebaixado
  const id = (await db.query("SELECT id FROM users WHERE username = 'fulana'")).rows[0].id
  assert.equal((await call(admin, `/admin/usuarios/${id}/desativar`, { method: 'POST', form: { _csrf: csrf } })).status, 200)
  assert.equal((await call(user, '/api/workspace', { accept: 'application/json' })).status, 401)
  const adminId = (await db.query("SELECT id FROM users WHERE username = 'chefe'")).rows[0].id
  assert.equal((await call(admin, `/admin/usuarios/${adminId}/papel`, { method: 'POST', form: { _csrf: csrf, role: 'usuario' } })).status, 400)
  page = await call(admin, `/admin/usuarios/${id}/senha`, { method: 'POST', form: { _csrf: csrf } }); assert.match(page.text, /Senha temporária/)
  assert.equal((await call(admin, '/sair', { method: 'POST', form: { _csrf: csrf } })).location, '/entrar')
  assert.equal((await call(admin, '/api/workspace', { accept: 'application/json' })).status, 401)
  console.log('Servidor: login, troca obrigatória de senha, CSRF/origem, papéis, isolamento por usuário, sincronização com revisão/409/histórico e fotos por usuário OK.')
} finally { server.kill(); await db.end() }
