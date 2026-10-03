import type { Project } from './models'
import type { SyncConflict } from './sync'

// Conflitos entre aparelhos: as duas versões já estão guardadas; aqui o usuário escolhe.
export default function SyncConflicts({ conflicts, projects, onResolve, onDismiss }: { conflicts: SyncConflict[]; projects: Project[]; onResolve: (conflict: SyncConflict, keep: 'local' | 'remote') => void; onDismiss: (id: string) => void }) {
  if (!conflicts.length) return null
  return <section className="sync-conflicts" role="alert" aria-label="Conflitos de sincronização">
    {conflicts.map(conflict => {
      const original = projects.find(item => item.id === conflict.projectId), copy = projects.find(item => item.id === conflict.copyId)
      const when = new Date(conflict.at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      if (conflict.kind === 'revived') return <div key={conflict.id} className="conflict-card"><p><b>⚠ “{conflict.name}”</b> foi excluído em um aparelho e alterado em outro ({when}). O projeto foi mantido para não perder as alterações.</p><div className="conflict-actions"><button onClick={() => onDismiss(conflict.id)}>Entendi</button></div></div>
      return <div key={conflict.id} className="conflict-card">
        <p><b>⚠ Conflito em “{conflict.name}”</b> ({when}): o projeto foi alterado neste e em outro aparelho. Nada foi sobrescrito — as duas versões estão guardadas: <i>{original?.name ?? 'versão do outro aparelho'}</i> e <i>{copy?.name ?? 'versão deste aparelho'}</i>.</p>
        <div className="conflict-actions">
          {original && copy && <button onClick={() => { if (window.confirm(`Ficar com a versão deste aparelho e descartar a do outro aparelho de “${conflict.name}”?`)) onResolve(conflict, 'local') }}>Ficar com a deste aparelho</button>}
          {original && copy && <button onClick={() => { if (window.confirm(`Ficar com a versão do outro aparelho e descartar a cópia deste aparelho?`)) onResolve(conflict, 'remote') }}>Ficar com a do outro aparelho</button>}
          <button onClick={() => onDismiss(conflict.id)}>{original && copy ? 'Manter as duas' : 'Fechar aviso'}</button>
        </div>
      </div>
    })}
  </section>
}
