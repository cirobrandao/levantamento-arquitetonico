import type { Corner, InternalWall, Wall } from './models'
import type { buildPerimeter, Point } from './geometry'
import { getWallReferences } from './openings'
import { geometryTolerance } from './tolerances'
import type { LabelBox } from './openings'

type Perimeter = ReturnType<typeof buildPerimeter>
export const internalWallLabel = (sequence: number) => `PI${String(sequence).padStart(2, '0')}`
export interface InternalWallCheck { id: string; messages: string[]; drawable: boolean }
export interface InternalWallPlacement {
  internalWall: InternalWall; wall: Wall; start: Point; end: Point; direction: Point;
  reference: ReturnType<typeof getWallReferences>[number]
}
const positive = (value: number | null | undefined): value is number => value !== null && value !== undefined && Number.isFinite(value) && value > 0
export function buildInternalWallLayout(perimeter: Perimeter, walls: Wall[], corners: Corner[], internalWalls: InternalWall[]) {
  const placements: InternalWallPlacement[] = []
  const checks: InternalWallCheck[] = internalWalls.map(internalWall => {
    const check: InternalWallCheck = { id: internalWall.id, messages: [], drawable: false }
    const origin = internalWall.origin
    if (origin.type !== 'perimeter_wall') {
      check.messages.push('Esta origem está reservada para uma etapa futura. O registro foi preservado.')
      return check
    }
    const segment = perimeter.segments.find(segment => segment.wall.id === origin.wallId)
    const reference = getWallReferences(walls, corners, origin.wallId).find(reference => reference.id === origin.referenceCornerId)
    const distanceValid = origin.distanceM !== null && Number.isFinite(origin.distanceM) && origin.distanceM >= 0
    const orientationValid = internalWall.orientationDegrees !== null && Number.isFinite(internalWall.orientationDegrees) && internalWall.orientationDegrees >= 0 && internalWall.orientationDegrees <= 360
    if (!segment?.measured) check.messages.push('Informe uma parede de origem com comprimento válido.')
    if (!reference) check.messages.push('Selecione um canto da parede de origem atual. A referência original foi preservada.')
    if (!distanceValid) check.messages.push('Informe uma distância maior ou igual a zero, do canto até o início da PI.')
    if (!positive(internalWall.lengthM)) check.messages.push('Informe um comprimento positivo para representar a PI.')
    if (!orientationValid) check.messages.push('Informe uma orientação entre 0° e 360°.')
    if (internalWall.thicknessM != null && !positive(internalWall.thicknessM)) check.messages.push('A espessura opcional deve ser positiva.')
    if (internalWall.heightM != null && !positive(internalWall.heightM)) check.messages.push('A altura opcional deve ser positiva.')
    if (!segment?.measured || !reference || !distanceValid || !positive(internalWall.lengthM) || !orientationValid) return check
    const length = segment.wall.lengthM!
    if (origin.distanceM! - length > geometryTolerance.numericalEpsilon) {
      check.messages.push('A origem da PI ultrapassa o comprimento da parede. A distância foi preservada.')
      return check
    }
    const offset = reference.endpoint === 'start' ? origin.distanceM! : length - origin.distanceM!
    const start = { x: segment.start.x + segment.direction.x * offset, y: segment.start.y + segment.direction.y * offset }
    const angle = Math.atan2(segment.direction.y, segment.direction.x) + internalWall.orientationDegrees! * Math.PI / 180
    const snap = (value: number) => Math.abs(value) < 1e-12 ? 0 : value
    const direction = { x: snap(Math.cos(angle)), y: snap(Math.sin(angle)) }
    const end = { x: start.x + direction.x * internalWall.lengthM, y: start.y + direction.y * internalWall.lengthM }
    if (![start.x, start.y, end.x, end.y].every(Number.isFinite)) {
      check.messages.push('As dimensões excedem o intervalo numérico do croqui. Confira os valores; o registro foi preservado.')
      return check
    }
    placements.push({ internalWall, wall: segment.wall, start, end, direction, reference })
    check.drawable = true
    return check
  })
  return { placements, checks }
}

// Ajusta somente a projeção gráfica se uma PI ultrapassar o enquadramento do perímetro.
export function fitInternalWallsSketch(perimeter: Perimeter, placements: InternalWallPlacement[]): Perimeter {
  const extraPoints = placements.flatMap(placement => [placement.start, placement.end])
  if (extraPoints.every(point => {
    const screen = perimeter.project(point)
    return screen.x >= 80 && screen.x <= 360 && screen.y >= 85 && screen.y <= 265
  })) return perimeter
  const points = [...perimeter.segments.flatMap(segment => [segment.start, segment.end]), ...extraPoints]
  const minX = Math.min(...points.map(point => point.x)), maxX = Math.max(...points.map(point => point.x))
  const minY = Math.min(...points.map(point => point.y)), maxY = Math.max(...points.map(point => point.y))
  const scale = Math.min(280 / Math.max(maxX - minX, 0.01), 180 / Math.max(maxY - minY, 0.01))
  return { ...perimeter, scale, project: (point: Point) => ({ x: 220 + (point.x - (minX + maxX) / 2) * scale, y: 175 + (point.y - (minY + maxY) / 2) * scale }) }
}

const meters = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export function placeInternalWallLabels(placements: InternalWallPlacement[], project: (point: Point) => Point, reserved: LabelBox[]) {
  const occupied = [...reserved]
  return placements.map(placement => {
    const middle = project({ x: (placement.start.x + placement.end.x) / 2, y: (placement.start.y + placement.end.y) / 2 })
    const width = Math.max(46, placement.internalWall.label.length * 7 + 8, `${meters.format(placement.internalWall.lengthM!)} m`.length * 5.5 + 8)
    const candidates = [22, -22, 40, -40, 60, -60].flatMap(offset => [0, 25, -25, 45, -45].map(shift => {
      const x = Math.max(width / 2 + 8, Math.min(432 - width / 2, middle.x + placement.direction.y * offset + placement.direction.x * shift))
      const y = Math.max(56, Math.min(300, middle.y - placement.direction.x * offset + placement.direction.y * shift - 4))
      const box = { x: x - width / 2, y: y - 11, width, height: 30 }
      const collisions = occupied.filter(other => box.x < other.x + other.width + 4 && box.x + box.width + 4 > other.x && box.y < other.y + other.height + 4 && box.y + box.height + 4 > other.y).length
      return { placement, x, y, box, middle, collisions, distance: Math.hypot(x - middle.x, y - middle.y) }
    }))
    candidates.sort((a, b) => a.collisions - b.collisions || a.distance - b.distance)
    const chosen = candidates[0]
    occupied.push(chosen.box)
    return chosen
  })
}
