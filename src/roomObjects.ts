import type { Room, RoomObject, RoomObjectCategory, RoomObjectShape } from './models'
import type { buildPerimeter, Point } from './geometry'
import { generateId } from './domain'
import { formatMeasurement } from './units'
import type { MeasurementUnit } from './units'

export const objectCategoryNames: Record<RoomObjectCategory, string> = { furniture: 'Móvel', equipment: 'Equipamento', object: 'Objeto', other: 'Outro' }
export const objectShapeNames: Record<RoomObjectShape, string> = { rectangle: 'Retângulo', circle: 'Círculo', line: 'Linha/segmento' }
export function nextObjectSequence(room: Room): number {
  return Math.max(room.objectCounter ?? 0, ...(room.objects ?? []).map(object => Number(/^OBJ-(\d+)$/.exec(object.displayId)?.[1] ?? 0))) + 1
}
export function createRoomObject(room: Room): RoomObject {
  return { id: generateId(), displayId: `OBJ-${String(nextObjectSequence(room)).padStart(3, '0')}`, roomId: room.id, name: 'Novo objeto', category: 'object', shape: 'rectangle', dimensions: { widthM: null, depthM: null }, position: { xM: 0, yM: 0 }, rotationDegrees: 0 }
}
export function removeRoomObject(room: Room, objectId: string): Room {
  return { ...room, objects: (room.objects ?? []).filter(object => object.id !== objectId), pendingItems: room.pendingItems.filter(item => item.elementId !== objectId) }
}
export function migrateRoomObjects(room: Room): Room {
  const objects = room.objects ?? []
  return { ...room, objects, objectCounter: nextObjectSequence({ ...room, objects }) - 1, subrooms: room.subrooms.map(migrateRoomObjects) }
}
const positive = (value: number | null | undefined): value is number => value != null && Number.isFinite(value) && value > 0
export function objectProblems(object: RoomObject): string[] {
  const errors: string[] = []
  if (!object.name.trim()) errors.push('Informe o nome do objeto.')
  if (object.position.xM == null || object.position.yM == null || ![object.position.xM, object.position.yM].every(Number.isFinite)) errors.push('Informe as duas coordenadas do centro.')
  if (object.rotationDegrees == null || !Number.isFinite(object.rotationDegrees)) errors.push('Informe uma rotação válida.')
  const dimensions = object.dimensions
  if (object.shape === 'rectangle' && (!positive(dimensions.widthM) || !positive(dimensions.depthM))) errors.push('Informe largura e profundidade positivas.')
  if (object.shape === 'circle' && !positive(dimensions.diameterM)) errors.push('Informe um diâmetro positivo.')
  if (object.shape === 'line' && !positive(dimensions.lengthM)) errors.push('Informe um comprimento positivo.')
  return errors
}
export function objectDimensionsLabel(object: RoomObject, unit: MeasurementUnit): string {
  const format = (value: number | null | undefined, suffix = true) => formatMeasurement(value, unit, suffix)
  return object.shape === 'rectangle' ? `${format(object.dimensions.widthM, false)} × ${format(object.dimensions.depthM)}`
    : object.shape === 'circle' ? `Ø ${format(object.dimensions.diameterM)}` : format(object.dimensions.lengthM)
}
export interface ObjectPlacement { object: RoomObject; center: Point; widthM: number; heightM: number; bounds: Point[] }
export function buildObjectPlacements(objects: RoomObject[]): ObjectPlacement[] {
  return objects.flatMap(object => {
    // Missing names do not prevent visualization; missing geometry does.
    if (objectProblems(object).some(message => message !== 'Informe o nome do objeto.')) return []
    const center = { x: object.position.xM!, y: object.position.yM! }
    const widthM = object.shape === 'rectangle' ? object.dimensions.widthM! : object.shape === 'circle' ? object.dimensions.diameterM! : object.dimensions.lengthM!
    const heightM = object.shape === 'rectangle' ? object.dimensions.depthM! : object.shape === 'circle' ? object.dimensions.diameterM! : 0
    const angle = object.rotationDegrees! * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle)
    const bounds = object.shape === 'circle'
      ? [{ x: center.x - widthM / 2, y: center.y - widthM / 2 }, { x: center.x + widthM / 2, y: center.y + widthM / 2 }]
      : [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y]) => ({ x: center.x + x * widthM / 2 * cos - y * heightM / 2 * sin, y: center.y + x * widthM / 2 * sin + y * heightM / 2 * cos }))
    if (!bounds.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))) return []
    return [{ object, center, widthM, heightM, bounds }]
  })
}
// Extend only the display projection; positions and dimensions are never rewritten.
export function fitObjectsSketch(geometry: ReturnType<typeof buildPerimeter>, placements: ObjectPlacement[], extraPoints: Point[] = []): ReturnType<typeof buildPerimeter> {
  const objectPoints = placements.flatMap(placement => placement.bounds)
  if (!objectPoints.length || objectPoints.every(point => { const screen = geometry.project(point); return screen.x >= 80 && screen.x <= 360 && screen.y >= 85 && screen.y <= 265 })) return geometry
  const points = [{ x: 0, y: 0 }, ...geometry.segments.flatMap(segment => [segment.start, segment.end]), ...extraPoints, ...objectPoints]
  const minX = Math.min(...points.map(point => point.x)), maxX = Math.max(...points.map(point => point.x))
  const minY = Math.min(...points.map(point => point.y)), maxY = Math.max(...points.map(point => point.y))
  if (![maxX - minX, maxY - minY].every(Number.isFinite)) return geometry
  const scale = Math.min(280 / Math.max(maxX - minX, .01), 180 / Math.max(maxY - minY, .01))
  return { ...geometry, scale, project: point => ({ x: 220 + (point.x - (minX / 2 + maxX / 2)) * scale, y: 175 + (point.y - (minY / 2 + maxY / 2)) * scale }) }
}
