import { useEffect, useRef, useState } from 'react'
import { Autosave } from './autosave'
import type { SaveStatus } from './autosave'
import { clearJournal, createSnapshot, loadLegacyWorkspace, loadWorkspace, restoreNavigation, saveWorkspace, writeJournal } from './storage'
import type { StoredWorkspace, WorkspaceData } from './storage'
import { ensureProjectMetadata } from './projectMetadata'
import { ProjectLedger, RemoteSync, httpTransport, keepNavigation, readSyncConfig } from './sync'
import type { SyncStatus } from './sync'

const withMetadata = (data: WorkspaceData): WorkspaceData => ({ ...data, projects: data.projects.map(ensureProjectMetadata) })

// Local-first: o IndexedDB é a fonte de verdade. A sincronização com servidor é opcional,
// roda em segundo plano e só existe quando a página traz <meta name="campo-sync">.
export function useLocalWorkspace(initial: WorkspaceData) {
  const [workspace, setWorkspace] = useState(initial)
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [status, setStatus] = useState<SaveStatus>('saving')
  const [saveError, setSaveError] = useState('')
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('off')
  const [syncPending, setSyncPending] = useState(0)
  const [syncMessage, setSyncMessage] = useState('')
  const saver = useRef<Autosave | undefined>(undefined)
  const remote = useRef<RemoteSync | undefined>(undefined)
  const current = useRef(workspace)
  current.current = workspace
  useEffect(() => {
    let canceled = false
    const config = readSyncConfig()
    const ledger = config ? new ProjectLedger(`campo-sync-ledger-v2-u${config.user}`) : undefined
    const controller = new Autosave({
      save: async snapshot => { await saveWorkspace(snapshot); remote.current?.noteLocal(snapshot.data) },
      journal: writeJournal, clearJournal, onStatus: (next, message) => { setStatus(next); setSaveError(message ?? '') },
    })
    saver.current = controller
    if (config && ledger) {
      remote.current = new RemoteSync({
        transport: httpTransport(config), ledger, local: () => current.current,
        onStatus: (next, pending, message) => { if (!canceled) { setSyncStatus(next); setSyncPending(pending); setSyncMessage(message ?? '') } },
        // União com o servidor: aplica na tela; o autosave grava no IndexedDB normalmente.
        onMerged: data => { const next = withMetadata(keepNavigation(data, current.current)); current.current = next; setWorkspace(next) },
      })
    }
    async function open(): Promise<StoredWorkspace | null> {
      let saved = await loadWorkspace()
      if (!config || !ledger) return saved
      const legacyKey = 'campo-legacy-migrated-v1'
      if (!saved && !localStorage.getItem(legacyKey)) {
        // Primeiro acesso com login neste navegador: aproveita os projetos gravados antes do login (uma vez).
        saved = await loadLegacyWorkspace()
        try { localStorage.setItem(legacyKey, config.user) } catch { /* ignorado */ }
      }
      if (saved || ledger.syncedRevision) return saved
      // Aparelho novo, sem dados locais: abre a cópia do servidor (se houver conexão) em vez
      // de criar um projeto vazio que seria enviado junto. Sem conexão, segue local.
      try {
        const state = await httpTransport(config).get()
        if (!state) return null
        ledger.adopt(state.snapshot.data.projects, state.meta)
        ledger.markSynced(state.snapshot.revision, state.meta)
        return state.snapshot
      } catch { return null }
    }
    void open().then(saved => {
      if (canceled) return
      if (saved) setWorkspace(restoreNavigation(withMetadata(saved.data)))
      try { void globalThis.navigator?.storage?.persist?.().catch(error => console.warn('Retenção persistente não concedida.', error)) } catch (error) { console.warn('Retenção persistente indisponível.', error) }
      setReady(true)
    }).catch(error => { if (!canceled) setLoadError(error instanceof Error ? error.message : 'Não foi possível abrir os projetos locais.') })
    let stopSync: (() => void) | undefined
    const startSync = setTimeout(() => { if (!canceled) stopSync = remote.current?.start() }, 1_000)
    const flush = () => { void controller.flush().then(() => remote.current?.flush()) }
    const visibility = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', visibility)
    return () => { canceled = true; clearTimeout(startSync); window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', visibility); stopSync?.(); controller.dispose(); remote.current?.dispose() }
  }, [])
  useEffect(() => { if (ready) saver.current?.schedule(createSnapshot(workspace)) }, [workspace, ready])
  return {
    workspace, setWorkspace, ready, loadError, status, saveError, retrySave: () => { void saver.current?.flush() },
    syncStatus, syncPending, syncMessage, retrySync: () => remote.current?.retry(),
  }
}
