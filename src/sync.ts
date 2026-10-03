import type { Project } from './models'
import type { StoredWorkspace, WorkspaceData } from './storage'
import { createSnapshot, decodeSnapshot, encodeSnapshot, restoreNavigation } from './storage'

// Sincronização opcional em segundo plano (ver server/README.md). Sem a configuração
// <meta name="campo-sync">, nada aqui é usado e a aplicação continua 100% local.
// O IndexedDB continua sendo a fonte de verdade no aparelho; o servidor é uma cópia.
export interface SyncConfig { endpoint: string; csrf: string; user: string }
export function readSyncConfig(doc: Document | undefined = globalThis.document): SyncConfig | null {
  const meta = (name: string) => doc?.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ?? ''
  const endpoint = meta('campo-sync'), user = meta('campo-user')
  return endpoint && user ? { endpoint, csrf: meta('campo-csrf'), user } : null
}

export type SyncStatus = 'off' | 'synced' | 'syncing' | 'offline' | 'auth' | 'error'
export const syncStatusShort: Record<SyncStatus, string> = { off: '', synced: 'Sincronizado', syncing: 'Pendente', offline: 'Pendente', auth: 'Pendente', error: 'Pendente' }
export function syncStatusLong(status: SyncStatus, pending: number): string {
  const what = pending === 1 ? '1 projeto aguardando envio' : pending > 1 ? `${pending} projetos aguardando envio` : 'alterações aguardando envio'
  switch (status) {
    case 'off': return ''
    case 'synced': return 'Sincronizado com o servidor'
    case 'syncing': return `Pendente: ${what} (enviando…)`
    case 'offline': return `Pendente: ${what}. Sem conexão; será enviado ao reconectar`
    case 'auth': return `Pendente: ${what}. Sessão expirada; entre novamente para enviar`
    case 'error': return `Pendente: ${what}. Falha no envio; nova tentativa automática`
  }
}

// ---------- Carimbos por projeto ----------
// Cada projeto tem um carimbo { updatedAt } que muda quando o conteúdo do projeto muda neste
// aparelho; exclusões viram "lápides" ({ deleted: true }) para não ressuscitarem em outro aparelho.
export interface ProjectStamp { updatedAt: string; deleted?: true }
export type ProjectMeta = Record<string, ProjectStamp>
const EPOCH = '1970-01-01T00:00:00.000Z'

export function hashProject(project: Project): string {
  const text = JSON.stringify(project)
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index++) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 0x01000193) }
  return `${(hash >>> 0).toString(36)}.${text.length.toString(36)}`
}

const later = (a: ProjectStamp | undefined, b: ProjectStamp | undefined) => (a?.updatedAt ?? '') > (b?.updatedAt ?? '')
const sameStamp = (a: ProjectStamp | undefined, b: ProjectStamp | undefined) => (a?.updatedAt ?? '') === (b?.updatedAt ?? '') && !!a?.deleted === !!b?.deleted

export interface MergeResult { data: WorkspaceData; meta: ProjectMeta; localChanged: boolean; remoteChanged: boolean }
// Resolução simples de conflito: para cada projeto vale a versão com o updatedAt mais recente
// (inclusive exclusões). Projetos diferentes editados em aparelhos diferentes são todos mantidos.
export function mergeByProject(local: { data: WorkspaceData; meta: ProjectMeta }, remote: { data: WorkspaceData; meta: ProjectMeta }): MergeResult {
  const localProjects = new Map(local.data.projects.map(project => [project.id, project]))
  const remoteProjects = new Map(remote.data.projects.map(project => [project.id, project]))
  const stamp = (side: typeof local, projects: Map<string, Project>, id: string): ProjectStamp | undefined => side.meta[id] ?? (projects.has(id) ? { updatedAt: EPOCH } : undefined)
  const ids = [...new Set([...localProjects.keys(), ...remoteProjects.keys(), ...Object.keys(local.meta), ...Object.keys(remote.meta)])]
  const meta: ProjectMeta = {}
  const kept = new Map<string, Project>()
  for (const id of ids) {
    const ls = stamp(local, localProjects, id), rs = stamp(remote, remoteProjects, id)
    const remoteWins = later(rs, ls)
    const winner = remoteWins ? rs! : ls ?? rs!
    meta[id] = winner
    if (winner.deleted) continue
    const project = (remoteWins ? remoteProjects.get(id) : localProjects.get(id)) ?? localProjects.get(id) ?? remoteProjects.get(id)
    if (project) kept.set(id, project)
  }
  const order = [...local.data.projects.map(project => project.id), ...remote.data.projects.map(project => project.id).filter(id => !localProjects.has(id))]
  let projects = order.filter(id => kept.has(id)).map(id => kept.get(id)!)
  if (!projects.length) projects = local.data.projects // nunca deixa o aparelho sem projeto
  const differs = (side: WorkspaceData) => side.projects.length !== projects.length || projects.some((project, index) => side.projects[index] !== project && (side.projects[index]?.id !== project.id || hashProject(side.projects[index]) !== hashProject(project)))
  const metaDiffers = (side: ProjectMeta) => Object.keys(meta).some(id => !sameStamp(side[id], meta[id]))
  const data = keepNavigation({ ...local.data, projects }, local.data)
  return { data, meta, localChanged: differs(local.data), remoteChanged: differs(remote.data) || metaDiffers(remote.meta) }
}

// Mantém a navegação atual do aparelho ao aplicar dados vindos de outro aparelho.
export function keepNavigation(incoming: WorkspaceData, current?: WorkspaceData): WorkspaceData {
  return restoreNavigation(current ? { ...incoming, projectId: current.projectId, floorId: current.floorId, roomId: current.roomId } : incoming)
}

// Registro local (localStorage, por usuário) dos carimbos, do conteúdo já carimbado e do
// último estado confirmado pelo servidor. É a "fila" offline: tudo cujo carimbo difere do
// confirmado está pendente e é enviado quando houver conexão, mesmo após fechar o app.
interface LedgerState { meta: ProjectMeta; hashes: Record<string, string>; synced: ProjectMeta; syncedRevision: string | null }
export class ProjectLedger {
  state: LedgerState = { meta: {}, hashes: {}, synced: {}, syncedRevision: null }
  constructor(private storageKey: string, private now: () => string = () => new Date().toISOString()) {
    try { const raw = localStorage.getItem(storageKey); if (raw) this.state = { ...this.state, ...JSON.parse(raw) } } catch { /* sem localStorage: memória só nesta sessão */ }
  }
  get meta() { return this.state.meta }
  get syncedRevision() { return this.state.syncedRevision }
  private persist() { try { localStorage.setItem(this.storageKey, JSON.stringify(this.state)) } catch { /* ignorado */ } }
  // Carimba projetos novos/alterados/excluídos neste aparelho. Retorna se algo mudou.
  observe(projects: Project[]): boolean {
    let changed = false
    const time = this.now(), seen = new Set<string>()
    for (const project of projects) {
      seen.add(project.id)
      const hash = hashProject(project)
      if (this.state.hashes[project.id] === hash && this.state.meta[project.id] && !this.state.meta[project.id].deleted) continue
      this.state.hashes[project.id] = hash
      this.state.meta[project.id] = { updatedAt: time }
      changed = true
    }
    for (const id of Object.keys(this.state.meta)) {
      if (seen.has(id) || this.state.meta[id].deleted) continue
      this.state.meta[id] = { updatedAt: time, deleted: true }
      delete this.state.hashes[id]
      changed = true
    }
    if (changed) this.persist()
    return changed
  }
  // Adota o resultado de uma união (dados e carimbos), sem gerar novos carimbos.
  adopt(projects: Project[], meta: ProjectMeta) {
    this.state.meta = { ...meta }
    this.state.hashes = Object.fromEntries(projects.map(project => [project.id, hashProject(project)]))
    this.persist()
  }
  markSynced(revision: string, meta: ProjectMeta) { this.state.syncedRevision = revision; this.state.synced = { ...meta }; this.persist() }
  pendingCount(): number { return Object.keys(this.state.meta).filter(id => !sameStamp(this.state.meta[id], this.state.synced[id])).length }
}

// ---------- Transporte HTTP ----------
export class HttpError extends Error { constructor(public status: number, message: string, public body?: unknown) { super(message) } }
export interface RemoteState { snapshot: StoredWorkspace; meta: ProjectMeta }
export interface SyncTransport {
  get(): Promise<RemoteState | null>
  head(): Promise<string | null>
  put(snapshot: StoredWorkspace, meta: ProjectMeta, baseRevision: string | null, resolvesConflict?: boolean): Promise<void>
}
function readMeta(value: unknown): ProjectMeta {
  const meta: ProjectMeta = {}
  if (!value || typeof value !== 'object') return meta
  for (const [id, stamp] of Object.entries(value as Record<string, unknown>)) {
    const item = stamp as { updatedAt?: unknown; deleted?: unknown } | null
    if (item && typeof item.updatedAt === 'string') meta[id] = item.deleted === true ? { updatedAt: item.updatedAt, deleted: true } : { updatedAt: item.updatedAt }
  }
  return meta
}
export function httpTransport(config: SyncConfig, fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis)): SyncTransport {
  const headers = { Accept: 'application/json', 'X-CSRF-Token': config.csrf }
  async function request(path: string, init: RequestInit = {}) {
    let response: Response
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 20_000)
    try { response = await fetchImpl(`${config.endpoint}${path}`, { credentials: 'same-origin', cache: 'no-store', ...init, headers: { ...headers, ...init.headers }, signal: controller.signal }) }
    catch { throw new HttpError(0, 'Sem conexão com o servidor.') }
    finally { clearTimeout(timer) }
    const text = await response.text()
    if (!response.ok) {
      let body: unknown; try { body = JSON.parse(text) } catch { body = undefined }
      throw new HttpError(response.status, (body as { error?: string } | undefined)?.error ?? `Erro ${response.status} no servidor.`, body)
    }
    return { status: response.status, text }
  }
  return {
    async get() {
      const { status, text } = await request('?with=meta')
      if (status === 204 || !text) return null
      const body = JSON.parse(text) as { snapshot: unknown; meta?: unknown }
      return { snapshot: decodeSnapshot(JSON.stringify(body.snapshot)), meta: readMeta(body.meta) }
    },
    async head() { const { status, text } = await request('/head'); return status === 204 || !text ? null : (JSON.parse(text) as { revision: string }).revision },
    async put(snapshot, meta, baseRevision, resolvesConflict = false) {
      await request('', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: `{"baseRevision":${JSON.stringify(baseRevision)},"resolvesConflict":${resolvesConflict},"meta":${JSON.stringify(meta)},"snapshot":${encodeSnapshot(snapshot)}}` })
    },
  }
}
// Resposta 409: o servidor envia a versão atual ("current") e seus carimbos ("meta").
export function conflictState(error: unknown): RemoteState | null {
  if (!(error instanceof HttpError) || error.status !== 409) return null
  const body = error.body as { current?: unknown; meta?: unknown } | undefined
  return body?.current ? { snapshot: decodeSnapshot(JSON.stringify(body.current)), meta: readMeta(body.meta) } : null
}

// ---------- Envio em segundo plano ----------
export interface RemoteSyncOptions {
  transport: SyncTransport
  ledger: ProjectLedger
  // Estado local mais recente (para unir com o servidor).
  local: () => WorkspaceData
  onStatus: (status: SyncStatus, pending: number, message?: string) => void
  // Aplica na interface (e grava no IndexedDB) o resultado de uma união com o servidor.
  onMerged: (data: WorkspaceData) => Promise<void> | void
  delayMs?: number
  pollMs?: number
}
export class RemoteSync {
  private timer?: ReturnType<typeof setTimeout>
  private poller?: ReturnType<typeof setInterval>
  private active?: Promise<void>
  private queued = false
  private retryMs = 5_000
  private disposed = false
  private lastStatus: SyncStatus = 'syncing'
  constructor(private options: RemoteSyncOptions) {}
  private report(status: SyncStatus, message?: string) { this.lastStatus = status; if (!this.disposed) this.options.onStatus(status, this.options.ledger.pendingCount(), message) }
  get pending() { return this.options.ledger.pendingCount() > 0 }
  // Chamado após cada gravação local: carimba e agenda o envio.
  noteLocal(data: WorkspaceData) {
    this.options.ledger.observe(data.projects)
    if (!this.pending) { if (this.lastStatus !== 'synced' && !this.active) this.report('synced'); return }
    this.schedule()
  }
  schedule(delay = this.options.delayMs ?? 1_500) {
    if (this.lastStatus !== 'auth') this.report(this.lastStatus === 'offline' || this.lastStatus === 'error' ? this.lastStatus : 'syncing')
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => { this.timer = undefined; void this.flush() }, delay)
  }
  async flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined }
    if (this.disposed) return
    if (this.active) { this.queued = true; return this.active }
    this.active = this.push().finally(() => { this.active = undefined })
    await this.active
    if (this.queued) { this.queued = false; if (this.pending) return this.flush() }
  }
  private async push(attempt = 0): Promise<void> {
    const ledger = this.options.ledger
    if (!this.pending && attempt === 0) { this.report('synced'); return }
    this.report('syncing')
    const data = this.options.local()
    ledger.observe(data.projects)
    const meta = { ...ledger.meta }
    const snapshot = createSnapshot(data)
    try {
      await this.options.transport.put(snapshot, meta, ledger.syncedRevision, attempt > 0)
      ledger.markSynced(snapshot.revision, meta); this.retryMs = 5_000
      this.report(this.pending ? 'syncing' : 'synced')
    } catch (error) {
      const remote = conflictState(error)
      if (remote && attempt < 3) {
        // Outro aparelho gravou antes: une por projeto (vale o updatedAt mais recente).
        const merged = mergeByProject({ data, meta }, { data: remote.snapshot.data, meta: remote.meta })
        ledger.markSynced(remote.snapshot.revision, remote.meta)
        ledger.adopt(merged.data.projects, merged.meta)
        if (merged.localChanged) await this.options.onMerged(merged.data)
        if (!merged.remoteChanged) { this.report(this.pending ? 'syncing' : 'synced'); return }
        return this.push(attempt + 1)
      }
      if (error instanceof HttpError && (error.status === 401 || error.status === 403)) { this.report('auth'); return }
      this.report(error instanceof HttpError && error.status === 0 ? 'offline' : 'error', error instanceof Error ? error.message : undefined)
      this.retryLater()
    }
  }
  private retryLater() {
    if (this.disposed || this.timer) return
    const delay = this.retryMs; this.retryMs = Math.min(this.retryMs * 2, 120_000)
    this.timer = setTimeout(() => { this.timer = undefined; void this.flush() }, delay)
  }
  retry() { this.retryMs = 5_000; void this.flush().then(() => this.pull()) }
  // Busca alterações de outros aparelhos e une por projeto. Com envio pendente, o envio
  // (que recebe 409 se houver novidade no servidor) faz a união.
  async pull(): Promise<void> {
    if (this.disposed || this.active) return
    if (this.pending) { void this.flush(); return }
    const ledger = this.options.ledger
    try {
      const head = await this.options.transport.head()
      if (!head) { if (this.options.local().projects.length) { ledger.observe(this.options.local().projects); if (this.pending) void this.flush() } return }
      if (head === ledger.syncedRevision) { this.report('synced'); return }
      const remote = await this.options.transport.get()
      if (!remote || this.disposed || this.active || this.pending) return
      const merged = mergeByProject({ data: this.options.local(), meta: { ...ledger.meta } }, { data: remote.snapshot.data, meta: remote.meta })
      ledger.markSynced(remote.snapshot.revision, remote.meta)
      ledger.adopt(merged.data.projects, merged.meta)
      if (merged.localChanged) await this.options.onMerged(merged.data)
      if (merged.remoteChanged) void this.flush()
      else this.report('synced')
    } catch (error) {
      if (error instanceof HttpError && (error.status === 401 || error.status === 403)) this.report('auth')
      else if (error instanceof HttpError && error.status === 0) this.report('offline')
      else this.report('error', error instanceof Error ? error.message : undefined)
    }
  }
  start() {
    const pullSoon = () => { if (document.visibilityState !== 'hidden') void this.pull() }
    const online = () => this.retry()
    this.poller = setInterval(pullSoon, this.options.pollMs ?? 30_000)
    globalThis.addEventListener?.('online', online)
    globalThis.addEventListener?.('focus', pullSoon)
    document.addEventListener('visibilitychange', pullSoon)
    void this.pull()
    return () => { if (this.poller) clearInterval(this.poller); globalThis.removeEventListener?.('online', online); globalThis.removeEventListener?.('focus', pullSoon); document.removeEventListener('visibilitychange', pullSoon) }
  }
  dispose() { this.disposed = true; if (this.timer) clearTimeout(this.timer); if (this.poller) clearInterval(this.poller) }
}
