import type { Room } from './models'
import type { RoomGeometry } from './roomGeometry'

// Quantitativos derivados das medidas originais. Nada aqui é gravado no Room.
export interface RoomMetrics {
  perimeterM: number | null
  floorAreaM2: number | null
  areaApproximate: boolean
  grossWallAreaM2: number | null
  openingsAreaM2: number | null
  netWallAreaM2: number | null
  volumeM3: number | null
  missing: string[]
}
const positive = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0

export function roomMetrics(room: Room, survey: RoomGeometry): RoomMetrics {
  const geometry = survey.perimeter
  const missing: string[] = []
  const lengths = room.walls.map(wall => wall.lengthM)
  const perimeterM = room.walls.length >= 3 && lengths.every(positive) ? lengths.reduce((sum, value) => sum + value, 0) : null
  if (room.walls.length < 3) missing.push('pelo menos três paredes')
  else if (perimeterM === null) missing.push('comprimento de todas as paredes')
  let floorAreaM2: number | null = null
  let areaApproximate = false
  if (perimeterM !== null && geometry.allAnglesDefined && geometry.segments.length >= 3) {
    // Fórmula de Gauss sobre o polígono desenhado; a diferença de fechamento fica implícita no último lado.
    const points = geometry.segments.map(segment => segment.start)
    const twice = points.reduce((sum, point, index) => { const next = points[(index + 1) % points.length]; return sum + point.x * next.y - next.x * point.y }, 0)
    floorAreaM2 = Math.abs(twice) / 2
    areaApproximate = !geometry.closed || geometry.calculations.length > 0
    if (geometry.closureSeverity === 'warning') { floorAreaM2 = null; missing.push('fechamento do perímetro dentro da tolerância') }
  } else if (perimeterM !== null) missing.push('ângulos de todos os cantos')
  const height = positive(room.ceilingHeightM) ? room.ceilingHeightM : null
  if (height === null) missing.push('pé-direito')
  const grossWallAreaM2 = perimeterM !== null && height !== null ? perimeterM * height : null
  const measuredOpenings = room.openings.filter(opening => positive(opening.widthM) && positive(opening.heightM))
  const openingsAreaM2 = room.openings.length === 0 ? 0 : measuredOpenings.length === room.openings.length ? measuredOpenings.reduce((sum, opening) => sum + opening.widthM! * opening.heightM!, 0) : null
  if (openingsAreaM2 === null) missing.push('largura e altura de todas as aberturas')
  const netWallAreaM2 = grossWallAreaM2 !== null && openingsAreaM2 !== null ? Math.max(0, grossWallAreaM2 - openingsAreaM2) : null
  const volumeM3 = floorAreaM2 !== null && height !== null ? floorAreaM2 * height : null
  return { perimeterM, floorAreaM2, areaApproximate, grossWallAreaM2, openingsAreaM2, netWallAreaM2, volumeM3, missing }
}

const number2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const formatMetric = (value: number | null, unit: string) => value === null ? '—' : `${number2.format(value)} ${unit}`
