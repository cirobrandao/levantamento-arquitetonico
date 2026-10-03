import { formatMeasurement } from './units'
import type { MeasurementUnit } from './units'
import type { Corner, Opening, OpeningType, Wall } from './models'
import type { buildPerimeter, Point } from './geometry'
import { getCorners } from './corners'
import { geometryTolerance } from './tolerances'

type Perimeter = ReturnType<typeof buildPerimeter>
export const openingNames: Record<OpeningType, string> = { door: 'Porta', window: 'Janela', gap: 'Vão' }
const prefixes: Record<OpeningType, string> = { door: 'P', window: 'J', gap: 'V' }
export const openingLabel = (type: OpeningType, sequence: number) => `${prefixes[type]}${String(sequence).padStart(2, '0')}`
export const formatCm = (value: number | null) => formatMeasurement(value, 'cm', false)
const positive = (value: number | null): value is number => value !== null && Number.isFinite(value) && value > 0
const nonnegative = (value: number | null): value is number => value !== null && Number.isFinite(value) && value >= 0

export function getWallReferences(walls: Wall[], corners: Corner[], wallId: string) {
  const index = walls.findIndex(wall => wall.id === wallId)
  if (index < 0 || walls.length < 2) return []
  const encounters = getCorners(walls, corners)
  const previous = (index + walls.length - 1) % walls.length
  return [
    { id: encounters[previous].id, label: `${walls[previous].label}${walls[index].label}`, endpoint: 'start' as const },
    { id: encounters[index].id, label: `${walls[index].label}${walls[(index + 1) % walls.length].label}`, endpoint: 'end' as const },
  ]
}

export interface OpeningCheck { id: string; messages: string[]; drawable: boolean }
export interface OpeningPlacement {
  opening: Opening; wall: Wall; fromM: number; toM: number; start: Point; end: Point; direction: Point;
  reference: ReturnType<typeof getWallReferences>[number]; referencePoint: Point; nearPoint: Point
}
export interface WallOpeningLayout { wallId: string; solidRanges: { start: Point; end: Point }[]; placements: OpeningPlacement[] }

export function buildOpeningLayout(perimeter: Perimeter, walls: Wall[], corners: Corner[], openings: Opening[]) {
  const checks: OpeningCheck[] = openings.map(opening => ({ id: opening.id, messages: [], drawable: false }))
  const wallLayouts: WallOpeningLayout[] = perimeter.segments.map(segment => {
    const placements: OpeningPlacement[] = []
    const pointAt = (distance: number): Point => ({ x: segment.start.x + segment.direction.x * distance, y: segment.start.y + segment.direction.y * distance })
    openings.filter(opening => opening.wallId === segment.wall.id).forEach(opening => {
      const check = checks.find(item => item.id === opening.id)!
      const reference = getWallReferences(walls, corners, opening.wallId).find(item => item.id === opening.referenceCornerId)
      if (!positive(opening.widthM)) check.messages.push('Informe uma largura positiva para representar a abertura.')
      if (!positive(opening.heightM)) check.messages.push('Altura ainda não informada ou inválida.')
      if (opening.type === 'window' && !nonnegative(opening.sillHeightM)) check.messages.push('Peitoril ainda não informado ou inválido.')
      if (!nonnegative(opening.offsetM)) check.messages.push('Informe uma distância maior ou igual a zero, do canto até a borda mais próxima da abertura.')
      if (!reference) check.messages.push('Selecione um canto que pertença à parede atual. A referência original foi preservada.')
      if (!segment.measured) check.messages.push('Informe o comprimento da parede para posicionar a abertura.')
      if (!reference || !segment.measured || !positive(opening.widthM) || !nonnegative(opening.offsetM)) return
      const length = segment.wall.lengthM!
      const fromM = reference.endpoint === 'start' ? opening.offsetM : length - opening.offsetM - opening.widthM
      const toM = fromM + opening.widthM
      if (fromM < -geometryTolerance.numericalEpsilon || toM - length > geometryTolerance.numericalEpsilon) {
        check.messages.push('A abertura ultrapassa os limites da parede. Verifique largura e distância; os valores foram preservados.')
        return
      }
      check.drawable = true
      placements.push({ opening, wall: segment.wall, fromM, toM, start: pointAt(fromM), end: pointAt(toM), direction: segment.direction, reference, referencePoint: reference.endpoint === 'start' ? segment.start : segment.end, nearPoint: pointAt(reference.endpoint === 'start' ? fromM : toM) })
    })
    const sorted = [...placements].sort((a, b) => a.fromM - b.fromM)
    sorted.forEach((a, index) => sorted.slice(index + 1).forEach(b => {
      if (Math.min(a.toM, b.toM) - Math.max(a.fromM, b.fromM) > geometryTolerance.numericalEpsilon) {
        checks.find(check => check.id === a.opening.id)!.messages.push(`Sobreposição com ${b.opening.label} nesta parede. Confira as posições.`)
        checks.find(check => check.id === b.opening.id)!.messages.push(`Sobreposição com ${a.opening.label} nesta parede. Confira as posições.`)
      }
    }))
    // Une somente intervalos gráficos para cortar o traço. Os registros originais não mudam.
    const solidRanges: { start: Point; end: Point }[] = []
    let cursor = 0
    for (const placement of sorted) {
      if (placement.fromM > cursor) solidRanges.push({ start: pointAt(cursor), end: pointAt(placement.fromM) })
      cursor = Math.max(cursor, placement.toM)
    }
    const length = segment.measured ? segment.wall.lengthM! : 1
    if (cursor < length) solidRanges.push({ start: pointAt(cursor), end: pointAt(length) })
    return { wallId: segment.wall.id, solidRanges, placements }
  })
  openings.filter(opening => !walls.some(wall => wall.id === opening.wallId)).forEach(opening => checks.find(check => check.id === opening.id)!.messages.push('A parede de referência não existe no perímetro atual.'))
  return { wallLayouts, placements: wallLayouts.flatMap(layout => layout.placements), checks }
}

export interface LabelBox { x: number; y: number; width: number; height: number }
function intersects(a: LabelBox, b: LabelBox) {
  return a.x < b.x + b.width + 4 && a.x + a.width + 4 > b.x && a.y < b.y + b.height + 4 && a.y + a.height + 4 > b.y
}
export function placeOpeningLabels(placements: OpeningPlacement[], project: (point: Point) => Point, reserved: LabelBox[], unit: MeasurementUnit = 'cm') {
  const occupied = [...reserved]
  return placements.map(placement => {
    const start = project(placement.start), end = project(placement.end)
    const anchor = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
    const normal = { x: -placement.direction.y, y: placement.direction.x }
    const height = placement.opening.type === 'window' ? 50 : 38
    const opening = placement.opening
    const lines = [opening.label, `${formatMeasurement(opening.widthM,unit,false)} × ${formatMeasurement(opening.heightM,unit)}`, `${formatMeasurement(opening.offsetM,unit)} de ${placement.reference.label}`]
    if (opening.type === 'window') lines.push(`P=${formatMeasurement(opening.sillHeightM,unit)}`)
    const width = Math.min(130, Math.max(64, ...lines.map(line => line.length * 5.3 + 8)))
    const candidates = [44, 90, 136, -44, -90].flatMap(distance => [0, -35, 35, -55, 55, -80, 80].map(shift => {
      const x = Math.max(width / 2 + 8, Math.min(432 - width / 2, anchor.x + normal.x * distance + placement.direction.x * shift))
      const y = Math.max(56, Math.min(330 - height, anchor.y + normal.y * distance + placement.direction.y * shift - 6))
      const box = { x: x - width / 2, y: y - 11, width, height }
      return { x, y, box, anchor, collisions: occupied.filter(other => intersects(box, other)).length, distance: Math.hypot(x - anchor.x, y - anchor.y) }
    }))
    candidates.sort((a, b) => a.collisions - b.collisions || a.distance - b.distance)
    const chosen = candidates[0]
    occupied.push(chosen.box)
    return { placement, ...chosen }
  })
}
