// Cria o administrador padrão se ainda não existir nenhum administrador.
// Uso: npm run seed   (ADMIN_USERNAME / ADMIN_PASSWORD opcionais)
import './env.mjs'
import { migrate, pool, query } from './db.mjs'
import { generatePassword, hashPassword, passwordProblem } from './auth.mjs'

await migrate()
const { rows } = await query("SELECT username FROM users WHERE role = 'admin' LIMIT 1")
if (rows.length) {
  console.log(`Já existe administrador (${rows[0].username}); nada a fazer.`)
} else {
  const username = (process.env.ADMIN_USERNAME || 'admin').toLowerCase()
  const password = process.env.ADMIN_PASSWORD || generatePassword(18)
  const problem = passwordProblem(password)
  if (problem) { console.error(problem); process.exit(1) }
  await query("INSERT INTO users (username, name, password_hash, role, must_change_password) VALUES ($1, 'Administrador', $2, 'admin', TRUE)", [username, await hashPassword(password)])
  console.log(`Administrador criado.\n  usuário: ${username}\n  senha:   ${password}\n(troca obrigatória no primeiro acesso)`)
}
await pool.end()
