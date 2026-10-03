import { createRoom, id } from '../../src/domain'
import { getCorners } from '../../src/corners'
import type { Diagonal, Opening, Project, Room } from '../../src/models'

/** Monta um ambiente a partir de comprimentos (m) e ângulos internos (graus) por canto. */
export function roomFrom(name: string, lengths: number[], angles?: (number | null)[], floorId = 'F1'): Room {
  const room = createRoom(name, floorId)
  room.walls = lengths.map((lengthM, index) => ({ id: id(), label: String.fromCharCode(65 + index), lengthM }))
  room.corners = getCorners(room.walls, []).map((corner, index) => {
    const angle = angles ? angles[index] : 90
    return { ...corner, angleDegrees: angle ?? null, angleSource: angle == null ? null : 'informed' }
  })
  room.ceilingHeightM = 2.8
  return room
}

export const cornerAtStart = (room: Room, wallIndex: number) => room.corners[(wallIndex - 1 + room.corners.length) % room.corners.length]

export function opening(room: Room, data: Partial<Opening> & Pick<Opening, 'label' | 'type'>, wallIndex = 0): Opening {
  const item: Opening = { id: id(), wallId: room.walls[wallIndex].id, referenceCornerId: cornerAtStart(room, wallIndex).id, offsetM: .5, widthM: .8, heightM: 2.1, sillHeightM: null, ...data }
  room.openings.push(item)
  return item
}

export function diagonal(room: Room, a: number, b: number, lengthM: number): Diagonal {
  const item: Diagonal = { id: id(), cornerIds: [room.corners[a].id, room.corners[b].id], lengthM, source: 'measured' }
  room.diagonals.push(item)
  return item
}

export function project(rooms: Room[], floorId = 'F1'): Project {
  return { id: id(), name: 'Casa teste', floors: [{ id: floorId, name: 'Térreo', rooms }], relationships: [] } as unknown as Project
}

export const regular = (sides: number, side: number) => roomFrom(`${sides} lados`, Array(sides).fill(side), Array(sides).fill(180 - 360 / sides))
