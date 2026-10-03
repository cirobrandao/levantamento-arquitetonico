import type { StoredWorkspace } from './storage'
export const AUTOSAVE_DELAY_MS = 600
export type SaveStatus = 'saving' | 'saved' | 'error'
export interface AutosaveDependencies {
  save: (snapshot: StoredWorkspace) => Promise<void>;
  journal: (snapshot: StoredWorkspace) => void;
  clearJournal: (snapshot: StoredWorkspace) => void;
  onStatus: (status: SaveStatus, message?: string) => void;
}
export class Autosave {
  private pending?: StoredWorkspace
  private timer?: ReturnType<typeof setTimeout>
  private active?: Promise<boolean>
  private disposed = false
  constructor(private dependencies: AutosaveDependencies) {}
  schedule(snapshot: StoredWorkspace) {
    this.pending = snapshot
    try { this.dependencies.journal(snapshot) } catch { /* Main storage will report its own success or error. */ }
    this.report('saving')
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => { this.timer = undefined; void this.flush() }, AUTOSAVE_DELAY_MS)
  }
  private report(status: SaveStatus, message?: string) { if (!this.disposed) this.dependencies.onStatus(status, message) }
  async flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined }
    // Concurrent lifecycle/retry calls join the current attempt. A failure must
    // remain pending for an explicit retry, rather than recursively retry forever.
    if (this.active) { const succeeded = await this.active; if (succeeded && this.pending) return this.flush(); return }
    const snapshot = this.pending
    if (!snapshot) return
    this.pending = undefined
    this.report('saving')
    this.active = (async () => {
      try {
        await this.dependencies.save(snapshot)
        this.dependencies.clearJournal(snapshot)
        if (!this.pending) this.report('saved')
        return true
      } catch (error) {
        if (!this.pending) this.pending = snapshot
        this.report('error', error instanceof Error ? error.message : 'Não foi possível salvar neste dispositivo.')
        return false
      }
    })()
    await this.active
    this.active = undefined
  }
  dispose() { this.disposed = true; void this.flush() }
}
