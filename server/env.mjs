// Carrega o .env da raiz do projeto, se existir (variáveis já definidas no ambiente têm prioridade).
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const file = fileURLToPath(new URL('../.env', import.meta.url))
if (existsSync(file) && typeof process.loadEnvFile === 'function') process.loadEnvFile(file)
if (!process.env.DATABASE_URL) { console.error('Defina DATABASE_URL (veja .env.example e server/README.md).'); process.exit(1) }
