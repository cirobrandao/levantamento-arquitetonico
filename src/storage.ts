import type { Project, Room } from './models'
import { generateId } from './domain'

export const SCHEMA_VERSION = 1
export const DATABASE_NAME = 'campo-levantamentos'
export const JOURNAL_KEY = 'campo-autosave-journal-v1'
export interface WorkspaceData { projects: Project[]; projectId: string; floorId: string; roomId: string }
export interface StoredWorkspace { schemaVersion: number; revision: string; savedAt: string; data: WorkspaceData }
export function restoreNavigation(data: WorkspaceData): WorkspaceData {
  const project = data.projects.find(item => item.id === data.projectId) ?? data.projects[0]
  const floor = project.floors.find(item => item.id === data.floorId) ?? project.floors[0]
  const containsRoom = (rooms: Room[]): boolean => rooms.some(room => room.id === data.roomId || containsRoom(room.subrooms))
  return { ...data, projectId: project.id, floorId: floor?.id ?? '', roomId: floor && containsRoom(floor.rooms) ? data.roomId : floor?.rooms[0]?.id ?? '' }
}
export function createSnapshot(data: WorkspaceData): StoredWorkspace {
  return { schemaVersion: SCHEMA_VERSION, revision: generateId(), savedAt: new Date().toISOString(), data }
}
// Validation checks the container without rounding, recalculating or repairing original measurements.
export function readSnapshot(value: unknown): StoredWorkspace {
  if (!value || typeof value !== 'object') throw new Error('O arquivo local de projetos é inválido. Os dados existentes foram preservados.')
  const record = value as StoredWorkspace
  if (record.schemaVersion !== SCHEMA_VERSION) throw new Error('Esta versão dos dados locais não é compatível com a aplicação. Os projetos existentes foram preservados.')
  const number = (value: unknown) => value === null || typeof value === 'number'
  const strings = (value: unknown): value is string[] => Array.isArray(value) && value.length === 2 && value.every(item => typeof item === 'string')
  const entity = (value: unknown): value is { id: string } => !!value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string'
  const counter = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
  // Validate element shapes before the UI can dereference them. Invalid measured
  // numbers (NaN, negatives, etc.) remain valid stored input for the checklist.
  const roomValid = (room: Room): boolean => entity(room) && typeof room.name === 'string' && typeof room.floorId === 'string' && number(room.ceilingHeightM)
    && ['walls', 'corners', 'diagonals', 'openings', 'internalWalls', 'pendingItems', 'subrooms'].every(key => Array.isArray(room[key as keyof Room]))
    && !!room.openingCounters && ['door', 'window', 'gap'].every(key => counter(room.openingCounters[key as keyof typeof room.openingCounters]))
    && counter(room.internalWallCounter)
    && room.walls.every(wall => entity(wall) && typeof wall.label === 'string' && number(wall.lengthM) && (!wall.sharedWallReference || typeof wall.sharedWallReference.roomId === 'string' && typeof wall.sharedWallReference.wallId === 'string'))
    && room.corners.every(corner => entity(corner) && strings(corner.wallIds) && number(corner.angleDegrees) && [null, 'assumed', 'informed', 'calculated'].includes(corner.angleSource))
    && room.diagonals.every(diagonal => entity(diagonal) && strings(diagonal.cornerIds) && number(diagonal.lengthM))
    && room.openings.every(opening => entity(opening) && typeof opening.label === 'string' && ['door', 'window', 'gap'].includes(opening.type) && typeof opening.wallId === 'string' && typeof opening.referenceCornerId === 'string' && [opening.widthM, opening.heightM, opening.sillHeightM, opening.offsetM].every(number))
    && room.internalWalls.every(wall => entity(wall) && typeof wall.label === 'string' && number(wall.lengthM) && number(wall.orientationDegrees) && !!wall.origin && (
      wall.origin.type === 'perimeter_wall' ? typeof wall.origin.wallId === 'string' && typeof wall.origin.referenceCornerId === 'string' && number(wall.origin.distanceM)
      : wall.origin.type === 'internal_wall' ? typeof wall.origin.internalWallId === 'string' && ['start', 'end'].includes(wall.origin.referenceEndpoint) && number(wall.origin.distanceM)
      : wall.origin.type === 'free' && !!wall.origin.position && typeof wall.origin.position.xM === 'number' && typeof wall.origin.position.yM === 'number'))
    && room.pendingItems.every(item => entity(item) && typeof item.description === 'string' && typeof item.resolved === 'boolean')
    && room.subrooms.every(roomValid)
  const data = record.data
  if (typeof record.revision !== 'string' || typeof record.savedAt !== 'string' || !data || !Array.isArray(data.projects) || !data.projects.length || !['projectId', 'floorId', 'roomId'].every(key => typeof data[key as keyof WorkspaceData] === 'string') || !data.projects.every(project => project && typeof project.id === 'string' && typeof project.name === 'string' && Array.isArray(project.relationships) && Array.isArray(project.floors) && project.floors.every(floor => floor && typeof floor.id === 'string' && typeof floor.name === 'string' && Array.isArray(floor.rooms) && floor.rooms.every(roomValid)))) throw new Error('Os dados locais estão incompletos. Não foram sobrescritos.')
  if (!data.projects.every(project => project.relationships.every(relation => entity(relation) && typeof relation.sourceRoomId === 'string' && typeof relation.targetRoomId === 'string' && ['opening_connection', 'shared_wall', 'adjacency', 'manual_reference'].includes(relation.type)))) throw new Error('As relações locais estão incompletas. Os dados existentes foram preservados.')
  return record
}
// The synchronous journal protects edits made immediately before closing the page.
// Special numeric values are preserved as well, so incomplete/invalid original inputs are not normalized.
export function encodeSnapshot(snapshot: StoredWorkspace): string {
  return JSON.stringify(snapshot, (_, value) => typeof value === 'number' && (!Number.isFinite(value) || Object.is(value, -0)) ? { $campoNumber: Object.is(value, -0) ? '-0' : String(value) } : value)
}
export function decodeSnapshot(text: string): StoredWorkspace {
  return readSnapshot(JSON.parse(text, (_, value) => value && typeof value === 'object' && Object.keys(value).length === 1 && '$campoNumber' in value ? value.$campoNumber === 'NaN' ? NaN : value.$campoNumber === 'Infinity' ? Infinity : value.$campoNumber === '-Infinity' ? -Infinity : value.$campoNumber === '-0' ? -0 : value : value))
}
let database: Promise<IDBDatabase> | undefined
function openDatabase(): Promise<IDBDatabase> {
  if (!database) database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('workspace')) request.result.createObjectStore('workspace') }
    request.onerror = () => reject(request.error ?? new Error('Não foi possível abrir o armazenamento local.'))
    request.onblocked = () => reject(new Error('Feche outras abas antigas da aplicação e tente novamente.'))
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => { db.close(); database = undefined }
      resolve(db)
    }
  }).catch(error => { database = undefined; throw error })
  return database
}
export async function loadWorkspace(): Promise<StoredWorkspace | null> {
  if (!globalThis.indexedDB) {
    try {
      const local = localStorage.getItem('campo-local-workspace-v1'), journal = localStorage.getItem(JOURNAL_KEY)
      const record = local ? decodeSnapshot(local) : null
      const recent = journal ? decodeSnapshot(journal) : null
      return recent && (!record || recent.savedAt >= record.savedAt) ? recent : record
    } catch (error) {
      if (error instanceof DOMException) { console.warn('Armazenamento local indisponível.', error); return null }
      throw error
    }
  }
  const db = await openDatabase()
  const saved = await new Promise<unknown>((resolve, reject) => {
    const transaction = db.transaction('workspace', 'readonly')
    const request = transaction.objectStore('workspace').get('current')
    let result: unknown
    request.onsuccess = () => { result = request.result }
    transaction.oncomplete = () => resolve(result)
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error ?? new Error('Leitura local interrompida.'))
  })
  const record = saved === undefined ? null : readSnapshot(saved)
  let journal: string | null = null
  try { journal = localStorage.getItem(JOURNAL_KEY) } catch { /* IndexedDB remains usable if the auxiliary journal is unavailable. */ }
  if (!journal) return record
  const recent = decodeSnapshot(journal)
  return !record || recent.savedAt >= record.savedAt ? recent : record
}
export async function saveWorkspace(snapshot: StoredWorkspace): Promise<void> {
  readSnapshot(snapshot)
  if (!globalThis.indexedDB) { localStorage.setItem('campo-local-workspace-v1', encodeSnapshot(snapshot)); return }
  const db = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('workspace', 'readwrite', { durability: 'strict' })
    transaction.objectStore('workspace').put(snapshot, 'current')
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error ?? new Error('Gravação local interrompida.'))
  })
}
export function writeJournal(snapshot: StoredWorkspace) { localStorage.setItem(JOURNAL_KEY, encodeSnapshot(snapshot)) }
export function clearJournal(snapshot: StoredWorkspace) {
  try { const current = localStorage.getItem(JOURNAL_KEY); if (current && decodeSnapshot(current).revision === snapshot.revision) localStorage.removeItem(JOURNAL_KEY) } catch { /* Never remove an unreadable or newer journal. */ }
}
