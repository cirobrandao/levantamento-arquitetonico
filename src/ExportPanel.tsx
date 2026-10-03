import { useRef, useState } from 'react'
import type { Project } from './models'
import type { WorkspaceData } from './storage'
import { createBackup, downloadText, importProjects, parseBackup, projectCsv } from './exporting'

// Exportações (relatório, planilha, backup) e importação de backup.
export default function ExportPanel({ workspace, project, onImport, onReport }: { workspace: WorkspaceData; project: Project; onImport: (data: WorkspaceData) => void; onReport: () => void }) {
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string }>()
  const input = useRef<HTMLInputElement>(null)
  const run = (action: () => void) => { try { action() } catch (error) { setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Não foi possível exportar.' }) } }
  async function importFile(file: File) {
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('O arquivo é grande demais para um backup do Campo (máximo 20 MB).')
      const backup = parseBackup(await file.text())
      const result = importProjects(workspace, backup)
      if (result.replaced.length && !window.confirm(`O backup contém ${result.replaced.length === 1 ? 'o projeto' : 'os projetos'} “${result.replaced.join('”, “')}”, que já ${result.replaced.length === 1 ? 'existe' : 'existem'} aqui. Substituir pela versão do backup?`)) { setMessage({ type: 'ok', text: 'Importação cancelada. Nada foi alterado.' }); return }
      onImport(result.data)
      setMessage({ type: 'ok', text: [result.added.length ? `Adicionado(s): ${result.added.join(', ')}.` : '', result.replaced.length ? `Substituído(s): ${result.replaced.join(', ')}.` : ''].filter(Boolean).join(' ') || 'Backup importado.' })
    } catch (error) { setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Não foi possível importar o arquivo.' }) }
    finally { if (input.current) input.current.value = '' }
  }
  return <details className="export-panel"><summary>⇩ Exportar e importar</summary>
    <div className="export-actions">
      <button onClick={onReport}>Relatório (imprimir / PDF)</button>
      <button onClick={() => run(() => { const file = projectCsv(project); downloadText(file.fileName, file.text, 'text/csv;charset=utf-8'); setMessage({ type: 'ok', text: `Planilha ${file.fileName} gerada.` }) })}>Planilha do projeto (CSV)</button>
      <button onClick={() => run(() => { const file = createBackup(workspace, [project.id]); downloadText(file.fileName, file.text, 'application/json'); setMessage({ type: 'ok', text: `Backup ${file.fileName} gerado.` }) })}>Backup do projeto (JSON)</button>
      <button onClick={() => run(() => { const file = createBackup(workspace); downloadText(file.fileName, file.text, 'application/json'); setMessage({ type: 'ok', text: `Backup ${file.fileName} gerado.` }) })}>Backup de todos os projetos</button>
      <label className="import-button">Importar backup…<input ref={input} type="file" accept="application/json,.json" onChange={event => { const file = event.target.files?.[0]; if (file) void importFile(file) }}/></label>
    </div>
    <p className="muted">O backup guarda todas as medidas originais e pode ser importado em outro navegador ou aparelho.</p>
    {message && <p className={message.type === 'error' ? 'export-error' : 'export-ok'} role={message.type === 'error' ? 'alert' : 'status'}>{message.text}</p>}
  </details>
}
