import { describe, expect, it } from 'vitest'
import { buildPerimeter } from '../../src/geometry'
import { solveClosureAngles } from '../../src/angles'
import { getCorners } from '../../src/corners'
import type { AngleSource, Corner, Wall } from '../../src/models'

type P = [number, number]
// Polígono com giros positivos (sentido usado pelo app). Devolve paredes medidas e ângulos internos reais.
function fromPoints(points: P[]) {
  const n = points.length
  const walls: Wall[] = points.map((p, i) => { const q = points[(i + 1) % n]; return { id: `w${i}`, label: String.fromCharCode(65 + i), lengthM: Math.hypot(q[0] - p[0], q[1] - p[1]) } })
  const dir = (i: number) => { const p = points[i % n], q = points[(i + 1) % n]; return [q[0] - p[0], q[1] - p[1]] }
  const angles = points.map((_, i) => { const a = dir(i), b = dir(i + 1); return 180 - Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]) * 180 / Math.PI })
  return { walls, angles }
}
function corners(walls: Wall[], spec: (number | 'auto' | 'assumed' | null)[]): Corner[] {
  return getCorners(walls, []).map((corner, i) => {
    const value = spec[i]
    const angleSource: AngleSource | null = value === 'auto' ? 'calculated' : value === 'assumed' ? 'assumed' : value === null ? null : 'informed'
    return { ...corner, angleSource, angleDegrees: value === 'auto' || value === null ? null : value === 'assumed' ? 90 : value }
  })
}
const close = (a: number | null, b: number, eps = 1e-6) => expect(Math.abs((a ?? NaN) - b)).toBeLessThan(eps)

describe('Encontros entre paredes — cálculo automático de ângulos', () => {
  it('retângulo: 1 ângulo informado e 3 automáticos fecham em 90°', () => {
    const { walls } = fromPoints([[0, 0], [4, 0], [4, 3], [0, 3]])
    const g = buildPerimeter(walls, corners(walls, [90, 'auto', 'auto', 'auto']))
    g.corners.slice(1).forEach(c => { close(c.angleDegrees, 90); expect(c.angleSource).toBe('calculated') })
    expect(g.calculations.every(c => c.method === 'closure')).toBe(true)
    expect(g.closed).toBe(true)
  })
  it('paralelogramo com 82° informado: calcula 98°, 82° e 98°', () => {
    const t = 82 * Math.PI / 180
    const pts: P[] = [[0, 0], [4, 0], [4 + 3 * Math.cos(Math.PI - t), 3 * Math.sin(Math.PI - t)], [3 * Math.cos(Math.PI - t), 3 * Math.sin(Math.PI - t)]]
    const { walls, angles } = fromPoints(pts)
    // A parede A termina no canto AB = ponto 1.
    const g = buildPerimeter(walls, corners(walls, [angles[0], 'auto', 'auto', 'auto']))
    g.corners.forEach((c, i) => close(c.angleDegrees, angles[i]))
    expect(g.closureM).toBeLessThan(1e-6)
  })
  it('quadrilátero irregular (trapézio) com 3 automáticos', () => {
    const { walls, angles } = fromPoints([[0, 0], [5, 0], [4.2, 3.1], [0.6, 3.4]])
    const g = buildPerimeter(walls, corners(walls, ['auto', angles[1], 'auto', 'auto']))
    g.corners.forEach((c, i) => close(c.angleDegrees, angles[i]))
  })
  it('pentágono com 2 automáticos e ambiente em L com canto reentrante (270°)', () => {
    const penta = fromPoints([[0, 0], [4, 0], [5, 2.5], [2, 4], [-0.8, 2]])
    const gp = buildPerimeter(penta.walls, corners(penta.walls, [penta.angles[0], 'auto', penta.angles[2], 'auto', penta.angles[4]]))
    gp.corners.forEach((c, i) => close(c.angleDegrees, penta.angles[i]))
    const L = fromPoints([[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]])
    expect(Math.round(L.angles[2])).toBe(270)
    const gl = buildPerimeter(L.walls, corners(L.walls, ['assumed', 'assumed', 'auto', 'auto', 'assumed', 'assumed']))
    close(gl.corners[2].angleDegrees, 270); close(gl.corners[3].angleDegrees, 90)
    // Com 3 automáticos em volta do canto reentrante existem duas formas válidas: o app avisa em vez de escolher.
    const ambiguous = buildPerimeter(L.walls, corners(L.walls, ['assumed', 'auto', 'auto', 'auto', 'assumed', 'assumed']))
    expect(ambiguous.autoNotes[0].message).toMatch(/duas soluções possíveis.*CD ≈ 270°/)
    expect(gl.closed).toBe(true)
  })
  it('um único automático usa a soma dos ângulos internos', () => {
    const { walls, angles } = fromPoints([[0, 0], [5, 0], [4.2, 3.1], [0.6, 3.4]])
    const g = buildPerimeter(walls, corners(walls, [angles[0], angles[1], angles[2], 'auto']))
    close(g.corners[3].angleDegrees, angles[3])
  })
  it('diz o que falta: comprimento ausente, encontros demais, ângulo indefinido e medidas incompatíveis', () => {
    const { walls } = fromPoints([[0, 0], [4, 0], [4, 3], [0, 3]])
    const missing = walls.map((w, i) => i === 2 ? { ...w, lengthM: null } : w)
    const g1 = buildPerimeter(missing, corners(missing, [90, 'auto', 'auto', 'auto']))
    expect(g1.autoNotes[0].message).toMatch(/comprimento da parede C/)
    expect(g1.corners[1].angleDegrees).toBeNull()
    const g2 = buildPerimeter(walls, corners(walls, ['auto', 'auto', 'auto', 'auto']))
    expect(g2.autoNotes).toHaveLength(4)
    expect(g2.autoNotes[0].message).toMatch(/até 3.*mais 1 ângulo ou meça uma diagonal/)
    const g3 = buildPerimeter(walls, corners(walls, [null, 'auto', 'auto', 90]))
    expect(g3.autoNotes[0].message).toMatch(/Defina o ângulo do encontro DA|Defina o ângulo do encontro AB/)
    const wrong = walls.map((w, i) => i === 1 ? { ...w, lengthM: 9 } : w)
    const g4 = buildPerimeter(wrong, corners(wrong, [90, 90, 'auto', 'auto']))
    expect(g4.autoNotes[0].message).toMatch(/não fecham/)
    expect(solveClosureAngles(walls.slice(0, 2), [90, 90], [0]).ok).toBe(false)
  })
  it('manual tem prioridade, medidas não mudam e diagonal é usada primeiro', () => {
    const { walls } = fromPoints([[0, 0], [4, 0], [4, 3], [0, 3]])
    const before = JSON.stringify(walls)
    const spec = corners(walls, [85, 'auto', 'auto', 'auto'])
    const g = buildPerimeter(walls, spec)
    expect(g.corners[0].angleDegrees).toBe(85)
    expect(g.corners[0].angleSource).toBe('informed')
    expect(JSON.stringify(walls)).toBe(before)
    expect(spec.slice(1).every(c => c.angleDegrees === null)).toBe(true)
    const withDiagonal = buildPerimeter(walls, corners(walls, ['auto', 'auto', 'auto', 'auto']), [{ id: 'd', cornerIds: [`w0/w1`, `w2/w3`], lengthM: 5, source: 'measured' }])
    withDiagonal.corners.forEach(c => close(c.angleDegrees, 90, 1e-6))
    expect(withDiagonal.calculations.some(c => c.method === 'diagonal')).toBe(true)
    expect(withDiagonal.autoNotes).toHaveLength(0)
  })
})
