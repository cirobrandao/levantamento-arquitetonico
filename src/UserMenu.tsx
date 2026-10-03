import { useEffect, useState } from 'react'
import { readSyncConfig } from './sync'
import { clearOfflineCache } from './offline'
interface Me { name: string; role: 'admin' | 'usuario' }
// Menu da conta; aparece apenas quando a aplicação é servida pelo servidor opcional com login.
export default function UserMenu() {
  const [me, setMe] = useState<Me | null>(null)
  const config = readSyncConfig()
  useEffect(() => {
    if (!config) return
    fetch('api/me', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(response => response.ok ? response.json() as Promise<Me> : null).then(setMe).catch(() => setMe(null))
  }, [])
  if (!config || !me) return null
  return <nav className="user-menu" aria-label="Conta"><span className="user-name">{me.name}</span><a href="conta/senha">Alterar senha</a>{me.role === 'admin' && <a href="admin/usuarios">Usuários</a>}<form method="post" action="sair" onSubmit={event => { event.preventDefault(); const form = event.currentTarget; void clearOfflineCache().finally(() => form.submit()) }}><input type="hidden" name="_csrf" value={config.csrf}/><button type="submit">Sair</button></form></nav>
}
