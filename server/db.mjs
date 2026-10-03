import pg from 'pg'

const { Pool } = pg
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
})

export const query = (text, params) => pool.query(text, params)

// Migrações idempotentes: rodam a cada inicialização.
export async function migrate() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id                   SERIAL PRIMARY KEY,
      username             TEXT NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9._-]{3,32}$'),
      name                 TEXT NOT NULL,
      password_hash        TEXT NOT NULL,
      role                 TEXT NOT NULL DEFAULT 'usuario' CHECK (role IN ('admin', 'usuario')),
      active               BOOLEAN NOT NULL DEFAULT TRUE,
      must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_login_at        TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash  TEXT PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      csrf_token  TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at  TIMESTAMPTZ NOT NULL,
      ip          TEXT,
      user_agent  TEXT
    );
    CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
    -- Levantamentos sincronizados: um documento por usuário, no envelope do armazenamento local.
    CREATE TABLE IF NOT EXISTS workspaces (
      user_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      revision       TEXT NOT NULL,
      schema_version INTEGER NOT NULL,
      saved_at       TEXT NOT NULL,
      snapshot       JSONB NOT NULL,
      project_count  INTEGER NOT NULL DEFAULT 0,
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    -- Versões substituídas (inclusive em conflitos entre aparelhos), para recuperação.
    CREATE TABLE IF NOT EXISTS workspace_versions (
      id             BIGSERIAL PRIMARY KEY,
      user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      revision       TEXT NOT NULL,
      saved_at       TEXT NOT NULL,
      snapshot       JSONB NOT NULL,
      project_count  INTEGER NOT NULL DEFAULT 0,
      reason         TEXT NOT NULL DEFAULT 'substituida',
      archived_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS workspace_versions_user_idx ON workspace_versions(user_id, archived_at DESC);
    -- Carimbos por projeto ({ id: { updatedAt, deleted? } }) para a união por projeto entre aparelhos.
    ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS project_meta JSONB NOT NULL DEFAULT '{}'::jsonb;
    -- Índice das fotos sincronizadas (os arquivos ficam em PHOTO_STORAGE_DIR/<usuário>/<fileId>).
    CREATE TABLE IF NOT EXISTS photo_files (
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      file_id       TEXT NOT NULL,
      mime          TEXT NOT NULL,
      size          BIGINT NOT NULL,
      has_thumbnail BOOLEAN NOT NULL DEFAULT FALSE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, file_id)
    );
  `)
}
