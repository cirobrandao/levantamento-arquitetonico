import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import Sketch from '../../src/Sketch'
import { UnitContext } from '../../src/Measurement'
import { buildRoomGeometry } from '../../src/roomGeometry'
import { createRoom, id } from '../../src/domain'
import { opening, roomFrom, cornerAtStart } from './helpers'
import type { Room } from '../../src/models'

const svg = (room: Room, unit: 'm' | 'cm' = 'm') => renderToStaticMarkup(<UnitContext value={unit}><Sketch room={room} survey={buildRoomGeometry(room)}/></UnitContext>)

describe('Etapa 11 — aberturas, paredes internas e subambientes', () => {
  it('T10 porta a 2 cm do canto é posicionada pelo canto de referência', () => {
    const room = roomFrom('Sala', [4.2, 3, 4.2, 3])
    const door = opening(room, { label: 'P01', type: 'door', offsetM: .02 })
    const layout = buildRoomGeometry(room).openings
    const placement = layout.placements.find(item => item.opening.id === door.id)!
    expect(placement).toBeTruthy()
    expect(placement.fromM).toBeCloseTo(.02, 9)
    expect(placement.toM).toBeCloseTo(.82, 9)
    expect(layout.checks.find(item => item.id === door.id)?.drawable).not.toBe(false)
    expect(svg(room, 'cm')).toContain('80 × 210 cm')
  })

  it('T11 janela com peitoril mostra J01 120×100 P=110', () => {
    const room = roomFrom('Quarto', [4, 3, 4, 3])
    opening(room, { label: 'J01', type: 'window', offsetM: 1, widthM: 1.2, heightM: 1, sillHeightM: 1.1 }, 1)
    const markup = svg(room, 'cm')
    expect(markup).toContain('J01')
    expect(markup).toContain('120 × 100 cm')
    expect(markup).toContain('P=110 cm')
  })

  it('T12 parede interna PI01 não cria parede de perímetro', () => {
    const room = roomFrom('Sala', [4.2, 3, 4.2, 3])
    const closedBefore = buildRoomGeometry(room).perimeter.closureSeverity
    room.internalWalls.push({ id: id(), label: 'PI01', lengthM: 1, orientationDegrees: 90, origin: { type: 'perimeter_wall', wallId: room.walls[0].id, referenceCornerId: cornerAtStart(room, 0).id, distanceM: 2 } })
    const geometry = buildRoomGeometry(room)
    expect(room.walls).toHaveLength(4)
    expect(geometry.perimeter.segments).toHaveLength(4)
    expect(geometry.perimeter.closureSeverity).toBe(closedBefore)
    expect(geometry.internalWalls.placements).toHaveLength(1)
    const markup = svg(room)
    expect(markup).toContain('PI01')
    expect(markup).toContain('1,00 m')
    expect(markup).toContain('4,20 m')
  })

  it('T13 subambiente tem croqui próprio, separado do ambiente pai', () => {
    const sala = roomFrom('Sala', [5, 4, 5, 4])
    const banheiro = roomFrom('Banheiro', [1.5, 2, 1.5, 2])
    banheiro.parentRoomId = sala.id
    sala.subrooms.push(banheiro)
    const parent = svg(sala), child = svg(banheiro)
    expect(buildRoomGeometry(sala).perimeter.segments).toHaveLength(4)
    expect(parent).not.toContain('1,50 m')
    expect(child).toContain('1,50 m')
    expect(child).not.toContain('5,00 m')
    expect(createRoom('Outro', 'F1', sala.id).parentRoomId).toBe(sala.id)
  })
})
