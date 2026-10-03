import type { Corner, Wall } from './models'

export function getCorners(walls: Wall[], saved: Corner[]): Corner[] {
  if (walls.length < 2) return []
  return walls.map((wall, index) => {
    const next = walls[(index + 1) % walls.length]
    return saved.find(corner => corner.wallIds[0] === wall.id && corner.wallIds[1] === next.id)
      ?? { id: `${wall.id}/${next.id}`, wallIds: [wall.id, next.id], angleDegrees: 90, angleSource: 'assumed' }
  })
}

export function validAngle(angle: number | null): angle is number {
  return angle !== null && Number.isFinite(angle) && angle > 0 && angle < 360
}
