import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { project, roomFrom } from './helpers'

describe('Etapa 11 — persistência local (IndexedDB)', () => {
  it('T20 dados permanecem após fechar e reabrir o app', async () => {
    const storage = await import('../../src/storage')
    const room = roomFrom('Sala', [4.123456, 3, 4.123456, 3])
    room.ceilingHeightM = null // campo vazio continua vazio
    const data = { projects: [project([room])], projectId: '', floorId: '', roomId: room.id }
    data.projectId = data.projects[0].id
    data.floorId = data.projects[0].floors[0].id
    const snapshot = storage.createSnapshot(data)
    await storage.saveWorkspace(snapshot)

    vi.resetModules() // simula nova abertura da página (IndexedDB continua)
    const reopened = await import('../../src/storage')
    const loaded = await reopened.loadWorkspace()
    expect(loaded?.schemaVersion).toBe(reopened.SCHEMA_VERSION)
    const loadedRoom = loaded!.data.projects[0].floors[0].rooms[0]
    expect(loadedRoom.walls.map(w => w.lengthM)).toEqual([4.123456, 3, 4.123456, 3])
    expect(loadedRoom.ceilingHeightM).toBeNull()
    expect(loaded!.data.roomId).toBe(room.id)
  })
})
