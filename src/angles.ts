import type { Wall } from './models'
import { validAngle } from './corners'
import { geometryTolerance as tolerance } from './tolerances'

// Cálculo automático de ângulos pelo fechamento do perímetro.
// Com todas as paredes medidas, o polígono fechado impõe 3 condições (x, y e direção final),
// então até 3 encontros desconhecidos ficam determinados pelos demais. As medidas nunca são alteradas.
export interface ClosureSolution { ok: true; angles: Map<number, number> }
export interface ClosureFailure { ok: false; reason: string }
const positive = (n: number | null | undefined): n is number => n != null && Number.isFinite(n) && n > 0
const rad = (deg: number) => deg * Math.PI / 180
const deg = (r: number) => r * 180 / Math.PI
// Giro em graus no intervalo (-180, 180].
function normalizeTurn(turn: number) { let t = ((turn % 360) + 360) % 360; if (t > 180) t -= 360; return t }
function triangleAngle(a: number, b: number, opposite: number) {
  if (!(a > 0 && b > 0 && opposite > 0)) return null
  const cos = (a * a + b * b - opposite * opposite) / (2 * a * b)
  if (cos > 1 + 1e-9 || cos < -1 - 1e-9) return null
  return deg(Math.acos(Math.max(-1, Math.min(1, cos))))
}
const label = (walls: Wall[], index: number) => `${walls[index].label}${walls[(index + 1) % walls.length].label}`

export function solveClosureAngles(walls: Wall[], angles: (number | null)[], unknown: number[]): ClosureSolution | ClosureFailure {
  const n = walls.length
  if (n < 3) return { ok: false, reason: 'Cadastre pelo menos 3 paredes para calcular ângulos.' }
  const missingWalls = walls.filter(wall => !positive(wall.lengthM)).map(wall => wall.label)
  if (missingWalls.length) return { ok: false, reason: `Falta o comprimento ${missingWalls.length > 1 ? 'das paredes' : 'da parede'} ${missingWalls.join(', ')}.` }
  const u = [...new Set(unknown)].sort((a, b) => a - b)
  if (!u.length) return { ok: true, angles: new Map() }
  if (u.length > 3) return { ok: false, reason: `Há ${u.length} encontros sem ângulo (${u.map(i => label(walls, i)).join(', ')}). Com as paredes medidas, o cálculo resolve até 3: informe mais ${u.length - 3} ângulo${u.length - 3 > 1 ? 's' : ''} ou meça uma diagonal.` }
  const undefinedCorners = angles.map((angle, index) => ({ angle, index })).filter(({ angle, index }) => !u.includes(index) && !validAngle(angle)).map(({ index }) => label(walls, index))
  if (undefinedCorners.length) return { ok: false, reason: `Defina o ângulo ${undefinedCorners.length > 1 ? 'dos encontros' : 'do encontro'} ${undefinedCorners.join(', ')} (manual, presumido ou automático) para calcular.` }
  const k = u.length
  // Trechos rígidos entre encontros desconhecidos: vetor (corda) e giro interno acumulado.
  const chains = u.map((corner, m) => {
    const endCorner = u[(m + 1) % k]
    const indices: number[] = []
    for (let wall = (corner + 1) % n; ; wall = (wall + 1) % n) { indices.push(wall); if (wall === endCorner) break }
    let heading = 0, x = 0, y = 0
    indices.forEach((wall, offset) => {
      if (offset > 0) heading += 180 - angles[(wall - 1 + n) % n]!
      x += walls[wall].lengthM! * Math.cos(rad(heading)); y += walls[wall].lengthM! * Math.sin(rad(heading))
    })
    return { x, y, turn: heading, length: Math.hypot(x, y), direction: deg(Math.atan2(y, x)) }
  })
  const totalTurn = chains.reduce((sum, chain) => sum + chain.turn, 0)
  // turns[m] = giro no encontro u[m], entre o trecho m-1 e o trecho m.
  function finish(theta: number[]): Map<number, number> | null {
    const turns = new Array<number>(k)
    for (let m = 1; m < k; m++) turns[m] = normalizeTurn(theta[m] - theta[m - 1] - chains[m - 1].turn)
    turns[0] = 360 - totalTurn - turns.slice(1).reduce((sum, t) => sum + t, 0)
    if (!(turns[0] > -180 && turns[0] < 180)) return null
    const result = new Map<number, number>()
    for (let m = 0; m < k; m++) { const angle = 180 - turns[m]; if (!(angle > 0 && angle < 360)) return null; result.set(u[m], angle) }
    // Verificação: o perímetro fecha com os ângulos encontrados.
    let heading = 0, x = 0, y = 0
    const all = angles.map((angle, index) => result.get(index) ?? angle!)
    walls.forEach((wall, index) => { if (index > 0) heading += 180 - all[index - 1]; x += wall.lengthM! * Math.cos(rad(heading)); y += wall.lengthM! * Math.sin(rad(heading)) })
    if (Math.hypot(x, y) > tolerance.closureWarningM) return null
    return result
  }
  const inconsistent = 'As medidas das paredes não fecham o perímetro com os ângulos já definidos. Confira os comprimentos ou meça uma diagonal.'
  if (k === 1) {
    const result = finish([0])
    return result ? { ok: true, angles: result } : { ok: false, reason: inconsistent }
  }
  if (k === 2) {
    if (Math.abs(chains[0].length - chains[1].length) > tolerance.closureWarningM) return { ok: false, reason: inconsistent }
    const theta1 = deg(Math.atan2(-chains[0].y, -chains[0].x)) - chains[1].direction
    const result = finish([0, theta1])
    return result ? { ok: true, angles: result } : { ok: false, reason: inconsistent }
  }
  const [L0, L1, L2] = chains.map(chain => chain.length)
  const at1 = triangleAngle(L0, L1, L2), at2 = triangleAngle(L1, L2, L0)
  if (at1 === null || at2 === null || Math.min(L0, L1, L2) < tolerance.numericalEpsilon) return { ok: false, reason: inconsistent }
  const solutions = [1, -1].map(orientation => {
    const phi = [0, orientation * (180 - at1)]; phi.push(phi[1] + orientation * (180 - at2))
    return finish(phi.map((value, m) => value - chains[m].direction))
  }).filter((item): item is Map<number, number> => item !== null)
  if (!solutions.length) return { ok: false, reason: inconsistent }
  if (solutions.length > 1) {
    const fmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
    const options = solutions.map(solution => [...solution].map(([index, angle]) => `${label(walls, index)} ≈ ${fmt.format(angle)}°`).join(', '))
    return { ok: false, reason: `Há duas soluções possíveis (${options.join(' ou ')}). Informe mais um ângulo ou meça uma diagonal.` }
  }
  return { ok: true, angles: solutions[0] }
}
