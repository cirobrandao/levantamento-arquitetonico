# Servidor opcional: login, usuários e sincronização

O Campo continua funcionando como aplicação estática (GitHub Pages, `npm run preview`), com os dados só no navegador. Este servidor é **opcional**. Use-o para:

- exigir login para abrir a aplicação;
- separar os levantamentos por usuário no mesmo navegador;
- sincronizar os levantamentos entre aparelhos (celular em campo ↔ computador no escritório);
- manter um histórico de versões no PostgreSQL.

Sem o servidor nada muda: a sincronização só é ativada quando a página é entregue por ele, com as metas `campo-user`, `campo-sync` e `campo-csrf`.

## Requisitos

- Node.js 20.6 ou superior
- PostgreSQL 13 ou superior, com um banco e um usuário dedicados

```sql
CREATE ROLE campo_user LOGIN PASSWORD 'senha-forte';
CREATE DATABASE campo_db OWNER campo_user;
```

## Instalação

```sh
npm ci
npm run build                 # gera dist/, servido apenas a usuários logados
cp .env.example .env          # ajuste DATABASE_URL (o .env não é versionado)
chmod 600 .env
npm run seed                  # cria o primeiro administrador e mostra a senha gerada
npm start                     # escuta em HOST:PORT (padrão 127.0.0.1:3600)
```

As tabelas (`users`, `sessions`, `workspaces`, `workspace_versions`) são criadas ou atualizadas automaticamente a cada inicialização.

Para produção, coloque um proxy HTTPS na frente (nginx, Caddy etc.) repassando `Host` e `X-Forwarded-Proto`. O cookie de sessão é `Secure` e só funciona em HTTPS ou em `localhost`. Se o site for acessado por outro domínio além do próprio host, informe-o em `PUBLIC_ORIGIN`. Com o PM2, por exemplo: `pm2 start server/index.mjs --name campo`.

## Contas e papéis

- **Login:** senhas com bcrypt (custo 12) e sessão em cookie `__Host-` HttpOnly, SameSite=Lax, válida por 30 dias e renovada com o uso (quem fica dias em obra sem internet não perde o acesso; depois do primeiro acesso a aplicação abre offline mesmo sem sessão). O login é bloqueado temporariamente após repetidas tentativas inválidas.
- **Proteção de formulários e API:** toda escrita exige origem do próprio site e token CSRF da sessão. O servidor envia CSP, `X-Frame-Options` e `nosniff`.
- **Senha inicial ou redefinida:** a troca é obrigatória no próximo acesso. "Alterar senha" pede a senha atual, exige no mínimo 10 caracteres e encerra as outras sessões.
- **Administrador:** em "Usuários" (`/admin/usuarios`), cria acessos (com senha digitada ou gerada), define o papel, redefine senhas (gera uma senha temporária) e desativa ou reativa contas. Desativar ou redefinir encerra as sessões da pessoa. O administrador não altera a própria conta por ali, e o sistema sempre mantém um administrador ativo.
- **Usuário:** usa a aplicação e altera a própria senha; não acessa a gestão de usuários.

## Sincronização

- **Local-first:** cada aparelho grava primeiro no IndexedDB, como sem servidor; a sincronização roda em segundo plano e nunca bloqueia a edição.
- **Carimbos por projeto:** quando o conteúdo de um projeto muda no aparelho, ele recebe `updatedAt`; projetos excluídos viram lápides (`deleted: true`) para não reaparecerem por outro aparelho. Os carimbos ficam num registro local por usuário (localStorage) e são enviados com o levantamento (`project_meta`).
- **Fila offline:** tudo cujo carimbo ainda não foi confirmado pelo servidor está pendente e é enviado quando houver conexão (evento `online`, foco, a cada 30 s ou ao reabrir o app), com novas tentativas automáticas.
- **Indicador:** o cabeçalho mostra "✓ Salvo localmente" (gravação no aparelho) e "☁ Sincronizando..." / "☁ Sincronizado" / "☁ Salvo localmente (n)" (pendente de envio); o detalhe (sem conexão, sessão expirada, falha) aparece ao passar o mouse e para leitores de tela.
- **Conflitos (nunca sobrescreve em silêncio):** se outro aparelho gravou antes, o servidor responde 409 com a versão atual e seus carimbos. O cliente une **por projeto** comparando com o último estado confirmado pelo servidor: projetos alterados só de um lado entram normalmente; se o **mesmo projeto** mudou nos dois aparelhos, as duas versões são mantidas — a do outro aparelho no projeto original e a deste aparelho numa cópia "(versão deste aparelho, dd/mm hh:mm)", com IDs novos e as mesmas fotos — e um aviso no topo deixa escolher "Ficar com a deste aparelho", "Ficar com a do outro aparelho" ou "Manter as duas". Projeto excluído num aparelho e alterado no outro é mantido (com aviso). A versão substituída vai para o histórico.
- **Fotos:** os metadados viajam com o projeto; os arquivos (original + miniatura) vão para `PHOTO_STORAGE_DIR/<id do usuário>/` (padrão `./data/photos`), com índice na tabela `photo_files`. Depois de cada sincronização (e a cada 60 s) o aparelho envia as fotos que o servidor ainda não tem e baixa as que faltam nele. Nada é apagado no servidor automaticamente. Inclua essa pasta no backup do servidor.
- **Outros aparelhos:** alterações remotas chegam ao focar a página e a cada 30 s (sem envio pendente), com a mesma união; a navegação atual é mantida.
- **Aparelho novo:** sem dados locais, abre a cópia do servidor em vez de criar um projeto vazio.
- **Histórico:** "Exportar e importar › Histórico no servidor" lista as versões substituídas (uma a cada 10 minutos, além das de conflitos; as 50 mais recentes). Cada uma pode ser baixada como backup e recuperada com "Importar backup".
- **Primeiro acesso:** os projetos gravados neste navegador antes do login são enviados para a conta, uma única vez.
- **Sair:** remove do navegador a cópia da aplicação guardada para uso sem conexão.

### API (JSON, exige sessão)

| Método | Caminho | Descrição |
| --- | --- | --- |
| GET | `/api/me` | usuário atual |
| GET | `/api/workspace` | levantamento (204 se vazio); com `?with=meta`, `{ snapshot, meta }` |
| GET | `/api/workspace/head` | revisão atual |
| PUT | `/api/workspace` | `{ baseRevision, resolvesConflict?, meta, snapshot }`; 409 com `current` e `meta` se a base estiver desatualizada |
| GET | `/api/workspace/versions` | histórico |
| GET | `/api/workspace/versions/:id` | uma versão |
| GET | `/api/photos` | índice das fotos do usuário `[{ fileId, mimeType, size, thumbnail }]` |
| PUT | `/api/photos/:fileId` | arquivo original (corpo binário, `Content-Type: image/*`, até 30 MB) |
| PUT | `/api/photos/:fileId/thumbnail` | miniatura JPEG |
| GET | `/api/photos/:fileId` | arquivo original; `?thumbnail=1` para a miniatura |

Escritas exigem o cabeçalho `X-CSRF-Token`. O valor vem na meta `campo-csrf` da página.

## Testes

```sh
TEST_DATABASE_URL=postgres://usuario:senha@127.0.0.1:5432/campo_test npm run test:server
```

O teste **apaga e recria** as tabelas do banco informado; use um banco descartável. Sem `TEST_DATABASE_URL`, `npm test` ignora esta suíte.
