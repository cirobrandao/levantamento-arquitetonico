import type { Room } from './models'
import { buildPerimeter } from './geometry'
import { buildOpeningLayout } from './openings'
import { buildInternalWallLayout } from './internalWalls'

// One immutable, derived result can be shared by form, sketch and checklist.
// No calculations are written back into the measured Room.
export function buildRoomGeometry(room: Room) {
  const perimeter = buildPerimeter(room.walls, room.corners, room.diagonals)
  return {
    perimeter,
    openings: buildOpeningLayout(perimeter, room.walls, room.corners, room.openings),
    internalWalls: buildInternalWallLayout(perimeter, room.walls, room.corners, room.internalWalls),
  }
}
export type RoomGeometry = ReturnType<typeof buildRoomGeometry>
