import { beforeEach, describe, expect, it } from 'vitest'
import { HttpError, ProjectLedger, RemoteSync, mergeByProject } from '../../src/sync'
import type { ProjectMeta, RemoteState, SyncStatus, SyncTransport } from '../../src/sync'
import { SCHEMA_VERSION, createSnapshot } from '../../src/storage'
import type { StoredWorkspace, WorkspaceData } from '../../src/storage'
import type { Project } from '../../src/models'

const store = new Map<string, string>()
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => void store.set(k, String(v)), removeItem: k => void store.delete(k), clear: () => store.clear(), key: () => null, length: 0 } as Storage
beforeEach(() => store.clear())

const project = (id: string, name = id): Project => ({ id, name, floors: [{ id: `${id}-f`, name: 'Térreo', rooms: [] }], relationships: [] }) as unknown as Project
const ws = (...projects: Project[]): WorkspaceData => ({ projects, projectId: projects[0]?.id ?? '', floorId: '', roomId: '' })
const stamp = (updatedAt: string, deleted = false) => deleted ? { updatedAt, deleted: true as const } : { updatedAt }

describe('união por projeto (updatedAt)', () => {
  it('mantém projetos diferentes editados em aparelhos diferentes', () => {
    const r = mergeByProject({ data: ws(project('a')), meta: { a: stamp('2026-10-03T10:00:00Z') } }, { data: ws(project('b')), meta: { b: stamp('2026-10-03T11:00:00Z') } })
    expect(r.data.projects.map(p => p.id)).toEqual(['a', 'b'])
    expect(r.localChanged && r.remoteChanged).toBe(true)
  })
  it('no mesmo projeto vale o updatedAt mais recente', () => {
    const local = { data: ws(project('a', 'Local')), meta: { a: stamp('2026-10-03T10:00:00Z') } }
    const remote = { data: ws(project('a', 'Remoto')), meta: { a: stamp('2026-10-03T12:00:00Z') } }
    expect(mergeByProject(local, remote).data.projects[0].name).toBe('Remoto')
    expect(mergeByProject({ ...local, meta: { a: stamp('2026-10-03T13:00:00Z') } }, remote).data.projects[0].name).toBe('Local')
  })
  it('exclusão mais recente vence (lápide) e edição posterior à exclusão ressuscita', () => {
    const remote = { data: ws(project('a'), project('b')), meta: { a: stamp('2026-10-03T10:00:00Z'), b: stamp('2026-10-03T10:00:00Z') } }
    const deleted = mergeByProject({ data: ws(project('b')), meta: { a: stamp('2026-10-03T11:00:00Z', true), b: stamp('2026-10-03T10:00:00Z') } }, remote)
    expect(deleted.data.projects.map(p => p.id)).toEqual(['b'])
    expect(deleted.meta.a.deleted).toBe(true)
    const revived = mergeByProject({ data: ws(project('b')), meta: { a: stamp('2026-10-03T09:00:00Z', true), b: stamp('2026-10-03T10:00:00Z') } }, remote)
    expect(revived.data.projects.map(p => p.id)).toEqual(['b', 'a'])
  })
  it('nunca deixa o aparelho sem projeto', () => {
    const r = mergeByProject({ data: ws(project('a')), meta: { a: stamp('2026-10-03T10:00:00Z') } }, { data: ws(project('x')), meta: { a: stamp('2026-10-03T11:00:00Z', true), x: stamp('2026-10-03T09:00:00Z', true) } })
    expect(r.data.projects.length).toBe(1)
  })
})

describe('registro local (fila offline)', () => {
  it('carimba só o que mudou e conta pendências até confirmar', () => {
    let now = '2026-10-03T10:00:00Z'
    const ledger = new ProjectLedger('k', () => now)
    expect(ledger.observe([project('a'), project('b')])).toBe(true)
    expect(ledger.pendingCount()).toBe(2)
    ledger.markSynced('r1', ledger.meta)
    expect(ledger.pendingCount()).toBe(0)
    now = '2026-10-03T10:05:00Z'
    expect(ledger.observe([project('a'), project('b')])).toBe(false)
    expect(ledger.observe([project('a', 'Renomeado'), project('b')])).toBe(true)
    expect(ledger.meta.a.updatedAt).toBe(now)
    expect(ledger.pendingCount()).toBe(1)
    ledger.observe([project('a', 'Renomeado')])
    expect(ledger.meta.b).toEqual({ updatedAt: now, deleted: true })
    // Persistência: um novo registro (app reaberto) lembra das pendências.
    expect(new ProjectLedger('k').pendingCount()).toBe(2)
  })
})

class FakeServer implements SyncTransport {
  state: RemoteState | null = null
  online = true
  puts = 0
  async get() { if (!this.online) throw new HttpError(0, 'offline'); return this.state && structuredClone(this.state) }
  async head() { if (!this.online) throw new HttpError(0, 'offline'); return this.state?.snapshot.revision ?? null }
  async put(snapshot: StoredWorkspace, meta: ProjectMeta, base: string | null) {
    if (!this.online) throw new HttpError(0, 'offline')
    this.puts++
    if (this.state && this.state.snapshot.revision !== base) throw new HttpError(409, 'conflito', { current: this.state.snapshot, meta: this.state.meta })
    this.state = structuredClone({ snapshot, meta })
  }
}
function device(server: FakeServer, key: string, data: WorkspaceData, clock: () => string) {
  const ref = { data, statuses: [] as SyncStatus[] }
  const ledger = new ProjectLedger(key, clock)
  const sync = new RemoteSync({ transport: server, ledger, local: () => ref.data, delayMs: 0, onStatus: s => ref.statuses.push(s), onMerged: d => { ref.data = d } })
  return { ref, ledger, sync, edit(next: WorkspaceData) { ref.data = next; sync.noteLocal(next) } }
}

describe('envio em segundo plano', () => {
  it('sem conexão fica Pendente e envia ao reconectar', async () => {
    const server = new FakeServer(); server.online = false
    const a = device(server, 'A', ws(project('p1')), () => '2026-10-03T10:00:00Z')
    a.edit(ws(project('p1', 'Casa')))
    await a.sync.flush()
    expect(a.ref.statuses.at(-1)).toBe('offline')
    expect(a.ledger.pendingCount()).toBe(1)
    server.online = true
    await a.sync.flush()
    expect(a.ref.statuses.at(-1)).toBe('synced')
    expect(server.state?.snapshot.data.projects[0].name).toBe('Casa')
    expect(server.state?.meta.p1.updatedAt).toBe('2026-10-03T10:00:00Z')
  })

  it('dois aparelhos: conflito resolvido por projeto, sem perder nada', async () => {
    const server = new FakeServer()
    let t = 0; const clock = () => new Date(Date.UTC(2026, 9, 3, 10, t++)).toISOString()
    const a = device(server, 'A', ws(project('casa', 'Casa A0')), clock)
    a.edit(a.ref.data); await a.sync.flush()
    const b = device(server, 'B', ws(project('outro')), clock)
    await b.sync.pull() // B recebe "casa" e envia "outro"
    await b.sync.flush()
    expect(b.ref.data.projects.map(p => p.id).sort()).toEqual(['casa', 'outro'])
    // Ambos editam offline o mesmo projeto; B por último.
    a.edit(ws(project('casa', 'Casa A1'), ...a.ref.data.projects.slice(1)))
    b.edit({ ...b.ref.data, projects: b.ref.data.projects.map(p => p.id === 'casa' ? project('casa', 'Casa B1') : p) })
    await b.sync.flush(); await a.sync.flush()
    expect(server.state!.snapshot.data.projects.find(p => p.id === 'casa')!.name).toBe('Casa B1')
    expect(a.ref.data.projects.find(p => p.id === 'casa')!.name).toBe('Casa B1')
    expect(server.state!.snapshot.data.projects.map(p => p.id).sort()).toEqual(['casa', 'outro'])
    expect(a.ref.statuses.at(-1)).toBe('synced')
  })

  it('sessão expirada mantém pendente e não descarta dados', async () => {
    const server = new FakeServer()
    server.put = async () => { throw new HttpError(401, 'login') }
    const a = device(server, 'A', ws(project('p')), () => '2026-10-03T10:00:00Z')
    a.edit(a.ref.data); await a.sync.flush()
    expect(a.ref.statuses.at(-1)).toBe('auth')
    expect(a.ledger.pendingCount()).toBe(1)
  })
})

it('createSnapshot continua válido para o envio', () => { expect(createSnapshot(ws(project('x'))).schemaVersion).toBe(SCHEMA_VERSION) })
