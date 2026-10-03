import { useRef, useState } from 'react'
import type { Project } from './models'
import type { WorkspaceData } from './storage'
import { downloadBlob } from './exporting'
import { ARCHIVE_EXTENSION, applyProjectArchive, createProjectArchive, readProjectArchive } from './projectArchive'
import type { ArchiveContents, ArchiveImportMode } from './projectArchive'
import { readPhotoFile, savePhotoFile } from './photoStorage'

type Message = { type: 'ok' | 'error'; text: string }
// Exportar/Importar o projeto completo, com fotos, num único arquivo .levantamento (ZIP).
export default function ProjectArchivePanel({ workspace, project, onImport }: { workspace: WorkspaceData; project: Project; onImport: (data: WorkspaceData) => void }) {
  const [message, setMessage] = useState<Message>()
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<{ contents: ArchiveContents; existing?: Project }>()
  const input = useRef<HTMLInputElement>(null)
  async function exportArchive() {
    setBusy(true); setMessage(undefined)
    try {
      const file = await createProjectArchive(workspace, project.id, async fileId => ({ original: await readPhotoFile(fileId), thumbnail: await readPhotoFile(fileId, true).catch(() => undefined) }))
      downloadBlob(file.fileName, new Blob([file.bytes as BlobPart], { type: 'application/zip' }))
      setMessage({ type: file.missingPhotos.length ? 'error' : 'ok', text: `Arquivo ${file.fileName} gerado com ${file.photoCount} foto${file.photoCount === 1 ? '' : 's'}.${file.missingPhotos.length ? ` Atenção: ${file.missingPhotos.length} foto(s) sem arquivo neste aparelho não foram incluídas (${file.missingPhotos.join(', ')}).` : ''}` })
    } catch (error) { setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Não foi possível exportar.' }) } finally { setBusy(false) }
  }
  async function readFile(file: File) {
    setMessage(undefined)
    try {
      const contents = readProjectArchive(new Uint8Array(await file.arrayBuffer()))
      setPending({ contents, existing: workspace.projects.find(item => item.id === contents.project.id) })
    } catch (error) { setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Não foi possível ler o arquivo. Nada foi alterado.' }) }
    finally { if (input.current) input.current.value = '' }
  }
  async function confirm(mode: ArchiveImportMode) {
    if (!pending) return
    if (mode === 'replace' && !window.confirm(`Substituir o projeto “${pending.existing?.name}” deste aparelho pela versão do arquivo? As alterações locais desse projeto que não estiverem no arquivo serão perdidas.`)) return
    setBusy(true)
    try {
      const result = applyProjectArchive(workspace, pending.contents, mode)
      // Fotos primeiro: se faltar espaço, nada nos projetos é alterado.
      for (const [fileId, files] of result.files) await savePhotoFile(fileId, files.original, files.thumbnail ?? files.original)
      onImport(result.data)
      const missing = pending.contents.missingFiles
      setMessage({ type: missing.length ? 'error' : 'ok', text: `${result.replaced ? 'Projeto substituído' : 'Projeto importado'}: ${result.project.name} (${result.files.size} foto${result.files.size === 1 ? '' : 's'}).${missing.length ? ` ${missing.length} foto(s) do arquivo estavam sem imagem: ${missing.join(', ')}.` : ''}` })
      setPending(undefined)
    } catch (error) { setMessage({ type: 'error', text: `${error instanceof Error ? error.message : 'Não foi possível importar.'} Nada foi alterado nos projetos.` }) } finally { setBusy(false) }
  }
  return <div className="archive-panel">
    <button disabled={busy} onClick={() => void exportArchive()}>Exportar projeto com fotos ({ARCHIVE_EXTENSION})</button>
    <label className="import-button">Importar projeto ({ARCHIVE_EXTENSION} / .zip)…<input ref={input} type="file" accept={`${ARCHIVE_EXTENSION},.zip,application/zip`} onChange={event => { const file = event.target.files?.[0]; if (file) void readFile(file) }}/></label>
    {pending && <div className="archive-choice" role="dialog" aria-label="Como importar o projeto">
      <p><b>{pending.contents.project.name}</b> — {pending.contents.files.size} foto(s), versão de dados {pending.contents.snapshot.schemaVersion}.{pending.existing ? ' Já existe um projeto com a mesma identificação neste aparelho.' : ''}</p>
      <div className="archive-actions">
        <button className="primary" disabled={busy} onClick={() => void confirm('new')}>{pending.existing ? 'Importar como novo' : 'Importar'}</button>
        {pending.existing && <button disabled={busy} onClick={() => void confirm('replace')}>Substituir existente…</button>}
        <button disabled={busy} onClick={() => setPending(undefined)}>Cancelar</button>
      </div>
    </div>}
    {message && <p className={message.type === 'error' ? 'export-error' : 'export-ok'} role={message.type === 'error' ? 'alert' : 'status'}>{message.text}</p>}
  </div>
}
