import { describe, expect, it } from 'vitest'
import { buildPerimeter } from '../../src/geometry'
import { buildRoomGeometry } from '../../src/roomGeometry'
import { roomChecklist } from '../../src/checklist'
import { diagonal, project, regular, roomFrom } from './helpers'

const perimeter = (room: ReturnType<typeof roomFrom>) => buildPerimeter(room.walls, room.corners, room.diagonals)

describe('Etapa 11 — geometria do perímetro', () => {
  it('T01 ambiente retangular fecha sem aviso', () => {
    const geometry = perimeter(roomFrom('Sala', [4.2, 3, 4.2, 3]))
    expect(geometry.closureSeverity).toBe('closed')
    expect(geometry.closed).toBe(true)
    expect(geometry.corners.map(corner => corner.label)).toEqual(['AB', 'BC', 'CD', 'DA'])
  })

  it('T02 ambiente com 5 paredes fecha', () => {
    expect(perimeter(regular(5, 3)).closureSeverity).toBe('closed')
  })

  it('T03 ambiente com 6 paredes fecha', () => {
    expect(perimeter(regular(6, 2.5)).closureSeverity).toBe('closed')
  })

  it('T04 ambiente em L (canto reentrante de 270°)', () => {
    const geometry = perimeter(roomFrom('L', [4, 2, 2, 2, 2, 4], [90, 90, 270, 90, 90, 90]))
    expect(geometry.closureSeverity).toBe('closed')
    expect(geometry.segments).toHaveLength(6)
  })

  it('T05 ambiente com canto de 45°', () => {
    const geometry = perimeter(roomFrom('Triângulo', [3, 3, 3 * Math.SQRT2], [90, 45, 45]))
    expect(geometry.closureSeverity).toBe('closed')
  })

  it('T06 ambiente com canto de 82°', () => {
    const geometry = perimeter(roomFrom('Paralelogramo', [4, 3, 4, 3], [98, 82, 98, 82]))
    expect(geometry.closureSeverity).toBe('closed')
  })

  it('T07 geometria parcialmente definida por diagonal', () => {
    const room = roomFrom('Diagonal', [4, 3, 4, 3], [null, null, null, null])
    diagonal(room, 3, 1, 5) // DA → BC
    const geometry = perimeter(room)
    expect(geometry.calculations.length).toBeGreaterThan(0)
    geometry.calculations.forEach(item => expect(item.angleDegrees).toBeCloseTo(90, 6))
    expect(geometry.closureM).toBeLessThan(0.01)
  })

  it('T08 inconsistência pequena (2–3 cm) gera apenas aviso de aproximação', () => {
    const room = roomFrom('Pequena', [4.2, 3, 4.175, 3])
    const before = JSON.stringify(room.walls)
    const geometry = perimeter(room)
    expect(geometry.closureSeverity).toBe('approximate')
    expect(geometry.closureM).toBeCloseTo(0.025, 6)
    expect(JSON.stringify(room.walls)).toBe(before)
    expect(roomChecklist(room, project([room])).issues.some(item => item.description.startsWith('Grande'))).toBe(false)
  })

  it('T09 inconsistência grande gera alerta e pendência, sem corrigir medidas', () => {
    const room = roomFrom('Grande', [4.2, 3, 3.8, 3])
    const before = JSON.stringify(room.walls)
    expect(perimeter(room).closureSeverity).toBe('warning')
    expect(roomChecklist(room, project([room]), buildRoomGeometry(room)).issues.some(item => item.description.startsWith('Grande'))).toBe(true)
    expect(JSON.stringify(room.walls)).toBe(before)
  })
})
