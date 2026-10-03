export const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])

const css = `
:root{font-family:'DM Sans',system-ui,sans-serif;color:#233e36;background:#f4f5f0}*{box-sizing:border-box}body{margin:0}
header{height:64px;background:#183d36;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 24px;gap:12px}
header a.brand{color:#fff;text-decoration:none;font-size:24px;font-weight:700;display:flex;gap:10px;align-items:center}
header a.brand span{color:#d4bd85;font-size:30px}header nav{display:flex;gap:14px;align-items:center;font-size:13px;flex-wrap:wrap}
header nav a{color:#d6e2d9}header nav button{background:transparent;color:#d6e2d9;border:1px solid #537167;padding:6px 10px}
main{max-width:980px;margin:0 auto;padding:32px 18px}.narrow{max-width:420px}
.card{background:#fff;border:1px solid #e0e5dc;border-radius:14px;padding:26px;margin-bottom:22px}
h1{font-size:26px;letter-spacing:-.5px;margin:0 0 6px}h2{font-size:18px;margin:0 0 14px}p.muted,.muted{color:#79877b;font-size:13px}
label{display:block;font-size:13px;font-weight:600;margin-top:14px}
input,select{font:inherit;width:100%;border:1px solid #d5ddd5;border-radius:8px;background:#fff;padding:11px;color:#233e36;margin-top:6px}
button{font:inherit;cursor:pointer;border:1px solid #d4ddd5;border-radius:8px;background:#fff;color:#34564b;padding:10px 14px;font-weight:600}
button.primary{background:#254f40;color:#fff;border-color:#254f40;margin-top:20px;width:100%}button.primary:hover{background:#183d36}
button.small{padding:6px 10px;font-size:12px}button.danger{color:#9b3b2e;border-color:#e7c9c3}
.alert{border-radius:8px;padding:12px 14px;font-size:14px;margin:0 0 16px}.alert.error{background:#fbeceb;color:#8a2f25}.alert.ok{background:#e8f1e6;color:#21503d}
.temp{font-family:ui-monospace,monospace;font-size:16px;background:#f3efdf;padding:3px 8px;border-radius:6px}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:10px 8px;border-bottom:1px solid #ecf0e8;vertical-align:middle}
th{font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#788a7d}
.badge{font-size:11px;border-radius:20px;padding:3px 8px;background:#eef2ea}.badge.admin{background:#f3efdf;color:#8c753e}.badge.off{background:#f1e3e1;color:#8a2f25}
.row-actions{display:flex;gap:6px;flex-wrap:wrap}.row-actions form{margin:0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}
details summary{cursor:pointer;font-size:13px;color:#34564b;font-weight:600}
.inline{display:flex;gap:6px;align-items:center}.inline select{margin:0;padding:6px;width:auto}
@media(max-width:700px){.grid{grid-template-columns:1fr}table,thead,tbody,tr,td{display:block}thead{display:none}tr{border-bottom:1px solid #ecf0e8;padding:8px 0}td{border:0;padding:4px 0}}
`

export function layout({ title, user, csrf, body, narrow = false }) {
  const nav = user ? `<nav>
      <span>${esc(user.name)}</span>
      ${user.mustChangePassword ? '' : '<a href="/">Levantamentos</a>'}
      <a href="/conta/senha">Alterar senha</a>
      ${user.role === 'admin' && !user.mustChangePassword ? '<a href="/admin/usuarios">Usuários</a>' : ''}
      <form method="post" action="/sair" style="margin:0"><input type="hidden" name="_csrf" value="${esc(csrf)}"><button type="submit">Sair</button></form>
    </nav>` : ''
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#183d36"><meta name="robots" content="noindex">
<title>${esc(title)} · Campo</title><link rel="icon" href="/favicon.svg" type="image/svg+xml"><style>${css}</style></head><body>
<header><a class="brand" href="/"><span>⌑</span>campo</a>${nav}</header>
<main class="${narrow ? 'narrow' : ''}">${body}</main></body></html>`
}

const alerts = ({ error, ok }) => `${error ? `<div class="alert error" role="alert">${esc(error)}</div>` : ''}${ok ? `<div class="alert ok" role="status">${ok}</div>` : ''}`

export function loginPage({ error, username = '', next = '/' }) {
  return layout({ title: 'Entrar', narrow: true, body: `<div class="card">
    <h1>Entrar</h1><p class="muted">Levantamento arquitetônico</p>
    ${alerts({ error })}
    <form method="post" action="/entrar" autocomplete="on">
      <input type="hidden" name="next" value="${esc(next)}">
      <label>Usuário<input name="username" value="${esc(username)}" autocomplete="username" autocapitalize="none" required autofocus></label>
      <label>Senha<input type="password" name="password" autocomplete="current-password" required></label>
      <button class="primary" type="submit">Entrar</button>
    </form></div>` })
}

export function passwordPage({ user, csrf, error, ok, min }) {
  const forced = user.mustChangePassword
  return layout({ title: 'Alterar senha', user, csrf, narrow: true, body: `<div class="card">
    <h1>Alterar senha</h1>
    ${forced ? '<p class="muted">Por segurança, defina uma nova senha antes de continuar.</p>' : '<p class="muted">As outras sessões abertas com a sua conta serão encerradas.</p>'}
    ${alerts({ error, ok })}
    <form method="post" action="/conta/senha">
      <input type="hidden" name="_csrf" value="${esc(csrf)}">
      <input type="text" name="username" value="${esc(user.username)}" autocomplete="username" hidden>
      <label>Senha atual<input type="password" name="current" autocomplete="current-password" required></label>
      <label>Nova senha <span class="muted">(mínimo ${min} caracteres)</span><input type="password" name="password" minlength="${min}" autocomplete="new-password" required></label>
      <label>Confirmar nova senha<input type="password" name="confirm" minlength="${min}" autocomplete="new-password" required></label>
      <button class="primary" type="submit">Salvar nova senha</button>
    </form></div>` })
}

const fmt = value => value ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—'

export function usersPage({ user, csrf, users, error, ok, min, form = {} }) {
  const rows = users.map(item => {
    const self = item.id === user.id
    const hidden = `<input type="hidden" name="_csrf" value="${esc(csrf)}">`
    return `<tr>
      <td><strong>${esc(item.name)}</strong><br><span class="muted">${esc(item.username)}</span></td>
      <td><span class="badge ${item.role === 'admin' ? 'admin' : ''}">${item.role === 'admin' ? 'Administrador' : 'Usuário'}</span>
          ${item.active ? '' : '<span class="badge off">Desativado</span>'}
          ${item.must_change_password ? '<br><span class="muted">troca de senha pendente</span>' : ''}</td>
      <td class="muted">${fmt(item.last_login_at)}</td>
      <td class="muted">${item.synced_at ? `${item.project_count} projeto(s)<br>${fmt(item.synced_at)}` : '—'}</td>
      <td>${self ? '<span class="muted">Sua conta</span>' : `<div class="row-actions">
        <form method="post" action="/admin/usuarios/${item.id}/papel" class="inline">${hidden}
          <select name="role" aria-label="Papel de ${esc(item.username)}"><option value="usuario" ${item.role === 'usuario' ? 'selected' : ''}>Usuário</option><option value="admin" ${item.role === 'admin' ? 'selected' : ''}>Administrador</option></select>
          <button class="small" type="submit">Salvar papel</button></form>
        <form method="post" action="/admin/usuarios/${item.id}/senha">${hidden}<button class="small" type="submit">Redefinir senha</button></form>
        <form method="post" action="/admin/usuarios/${item.id}/${item.active ? 'desativar' : 'ativar'}">${hidden}<button class="small ${item.active ? 'danger' : ''}" type="submit">${item.active ? 'Desativar' : 'Reativar'}</button></form>
      </div>`}</td></tr>`
  }).join('')
  return layout({ title: 'Usuários', user, csrf, body: `
    <h1>Usuários</h1><p class="muted">Somente administradores acessam esta página.</p>
    ${alerts({ error, ok })}
    <div class="card"><h2>Criar acesso</h2>
      <form method="post" action="/admin/usuarios">
        <input type="hidden" name="_csrf" value="${esc(csrf)}">
        <div class="grid">
          <label>Nome<input name="name" value="${esc(form.name)}" required maxlength="80"></label>
          <label>Usuário <span class="muted">(3–32: letras minúsculas, números, . _ -)</span><input name="username" value="${esc(form.username)}" pattern="[a-z0-9._\\-]{3,32}" autocapitalize="none" required></label>
          <label>Papel<select name="role"><option value="usuario">Usuário</option><option value="admin" ${form.role === 'admin' ? 'selected' : ''}>Administrador</option></select></label>
          <label>Senha inicial <span class="muted">(deixe em branco para gerar; mínimo ${min})</span><input name="password" type="text" autocomplete="off" minlength="${min}"></label>
        </div>
        <p class="muted">A pessoa precisará trocar a senha no primeiro acesso.</p>
        <button class="primary" type="submit" style="width:auto">Criar usuário</button>
      </form></div>
    <div class="card"><h2>Acessos</h2>
      <table><thead><tr><th>Nome</th><th>Papel</th><th>Último acesso</th><th>Levantamentos</th><th>Ações</th></tr></thead><tbody>${rows}</tbody></table></div>` })
}

export function errorPage({ status, message, user, csrf }) {
  return layout({ title: 'Erro', user, csrf, narrow: true, body: `<div class="card"><h1>${status === 403 ? 'Acesso negado' : status === 404 ? 'Página não encontrada' : 'Algo deu errado'}</h1><p class="muted">${esc(message)}</p><p><a href="/">Voltar ao início</a></p></div>` })
}
