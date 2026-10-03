import { useEffect, useRef, useState } from 'react'
import { Autosave } from './autosave'
import type { SaveStatus } from './autosave'
import { clearJournal, createSnapshot, loadWorkspace, restoreNavigation, saveWorkspace, writeJournal } from './storage'
import type { WorkspaceData } from './storage'
export function useLocalWorkspace(initial: WorkspaceData) {
  const [workspace, setWorkspace] = useState(initial)
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [status, setStatus] = useState<SaveStatus>('saving')
  const [saveError, setSaveError] = useState('')
  const saver = useRef<Autosave | undefined>(undefined)
  useEffect(() => {
    let canceled = false
    const controller = new Autosave({ save: saveWorkspace, journal: writeJournal, clearJournal, onStatus: (next, message) => { setStatus(next); setSaveError(message ?? '') } })
    saver.current = controller
    void loadWorkspace().then(saved => {
      if (canceled) return
      if (saved) setWorkspace(restoreNavigation(saved.data))
      try { void globalThis.navigator?.storage?.persist?.().catch(error => console.warn('Retenção persistente não concedida.', error)) } catch (error) { console.warn('Retenção persistente indisponível.', error) }
      setReady(true)
    }).catch(error => { if (!canceled) setLoadError(error instanceof Error ? error.message : 'Não foi possível abrir os projetos locais.') })
    const flush = () => { void controller.flush() }
    const visibility = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', visibility)
    return () => { canceled = true; window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', visibility); controller.dispose() }
  }, [])
  useEffect(() => { if (ready) saver.current?.schedule(createSnapshot(workspace)) }, [workspace, ready])
  return { workspace, setWorkspace, ready, loadError, status, saveError, retrySave: () => { void saver.current?.flush() } }
}
