import type { Room } from './models'
let idCounter = 0
const idSession = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
export function generateId(): string {
  const cryptoApi = globalThis.crypto
  if (typeof cryptoApi?.randomUUID === 'function') {
    try { return cryptoApi.randomUUID() } catch (error) { console.warn('UUID indisponível; usando geração alternativa.', error) }
  }
  if (typeof cryptoApi?.getRandomValues === 'function') {
    try {
      const bytes = cryptoApi.getRandomValues(new Uint8Array(16))
      bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128
      const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
      return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`
    } catch (error) { console.warn('Entropia criptográfica indisponível.', error) }
  }
  // Last-resort compatibility: independent session entropy, timestamp and monotonic counter.
  return `local-${idSession}-${Date.now().toString(36)}-${(++idCounter).toString(36)}-${Math.random().toString(36).slice(2)}`
}
export const id = generateId
export const createRoom = (name: string, floorId = '', parentRoomId?: string): Room => ({ id: id(), name, floorId, parentRoomId, ceilingHeightM: null, walls: [], corners: [], diagonals: [], openings: [], openingCounters: { door: 0, window: 0, gap: 0 }, internalWalls: [], internalWallCounter: 0, objects: [], objectCounter: 0, photos: [], pendingItems: [], subrooms: [] })
export function wallLabel(index: number): string {
  let label = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) label = String.fromCharCode(65 + (n - 1) % 26) + label
  return label
}
export function updateRoom(rooms: Room[], roomId: string, change: (room: Room) => Room): Room[] {
  let changed = false
  const next = rooms.map(room => {
    if (room.id === roomId) { const updated = change(room); changed ||= updated !== room; return updated }
    const subrooms = updateRoom(room.subrooms, roomId, change)
    if (subrooms === room.subrooms) return room
    changed = true
    return { ...room, subrooms }
  })
  return changed ? next : rooms
}
export function findRoom(rooms: Room[], roomId: string): Room | undefined {
  for (const room of rooms) { if (room.id === roomId) return room; const found = findRoom(room.subrooms, roomId); if (found) return found }
}
