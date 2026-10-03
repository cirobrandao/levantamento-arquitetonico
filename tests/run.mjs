import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
for (const name of ['geometry', 'openings', 'internal-walls', 'relationships', 'checklist', 'persistence', 'field-ux', 'stabilization', 'units', 'room-objects', 'photos', 'metrics', 'exporting', 'server']) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(`./${name}.mjs`, import.meta.url))], { stdio: 'inherit' })
  if (result.error) { console.error(result.error); process.exit(1) }
  if (result.status !== 0) process.exit(result.status ?? 1)
}
console.log('14 suítes aprovadas.')
