import { useState } from 'react'
import { readSyncConfig } from './sync'
import { downloadText } from './exporting'

interface Version { id: string; savedAt: string; archivedAt: string; projects: number; reason: string }
const when = (value: string) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) }
// Versões anteriores guardadas pelo servidor opcional; cada uma pode ser baixada como backup e importada.
export default function ServerHistory() {
  const config = readSyncConfig()
  const [versions, setVersions] = useState<Version[]>()
  const [error, setError] = useState('')
  if (!config) return null
  async function load() {
    setError('')
    try {
      const response = await fetch(`${config!.endpoint}/versions`, { credentials: 'same-origin', headers: { Accept: 'application/json' }, cache: 'no-store' })
      if (!response.ok) throw new Error(response.status === 401 ? 'Sessão expirada. Entre novamente.' : 'Não foi possível carregar o histórico.')
      setVersions(await response.json() as Version[])
    } catch (caught) { setError(caught instanceof Error && caught.message !== 'Failed to fetch' ? caught.message : 'Sem conexão com o servidor.') }
  }
  async function download(version: Version) {
    try {
      const response = await fetch(`${config!.endpoint}/versions/${version.id}`, { credentials: 'same-origin', cache: 'no-store' })
      if (!response.ok) throw new Error('Não foi possível baixar esta versão.')
      downloadText(`campo-versao-${version.archivedAt.slice(0, 16).replace(/[^0-9]/g, '')}.json`, await response.text(), 'application/json')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Não foi possível baixar esta versão.') }
  }
  return <details className="server-history" onToggle={event => { if ((event.currentTarget as HTMLDetailsElement).open && !versions) void load() }}>
    <summary>Histórico no servidor</summary>
    <p className="muted">Versões substituídas, inclusive edições simultâneas em outro aparelho. Baixe e use “Importar backup” para recuperar um projeto.</p>
    {error && <p className="export-error" role="alert">{error}</p>}
    {versions && !versions.length && <p className="muted">Nenhuma versão anterior.</p>}
    {versions && versions.length > 0 && <ul>{versions.slice(0, 20).map(version => <li key={version.id}><span>{when(version.archivedAt)} · {version.projects} projeto(s){version.reason === 'conflito' ? ' · conflito' : ''}</span><button onClick={() => void download(version)}>Baixar</button></li>)}</ul>}
  </details>
}
