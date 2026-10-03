import { describe, expect, it } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { roomFrom, opening, project as makeProject } from '../etapa11/helpers'
import { applyProjectArchive, createProjectArchive, readProjectArchive } from '../../src/projectArchive'
import { encodeSnapshot, SCHEMA_VERSION } from '../../src/storage'
import type { Project } from '../../src/models'
import type { WorkspaceData } from '../../src/storage'

function sample() {
  const sala = roomFrom('Sala', [5, 4, 5, 4]); sala.displayId = 'AMB-001'
  const cozinha = roomFrom('Cozinha', [3, 3, 3, 3]); cozinha.displayId = 'AMB-002'
  const p01 = opening(sala, { label: 'P01', type: 'door', doorKind: 'hinged', swing: 'inward', hinge: 'left' })
  const p02 = opening(cozinha, { label: 'P02', type: 'door' })
  p01.connectedRoomId = cozinha.id; p01.connectedOpeningId = p02.id
  sala.walls[0].thickness = 0.15; sala.walls[0].wallType = 'masonry'
  sala.diagonals.push({ id: 'diag-1', cornerIds: [sala.corners[0].id, sala.corners[2].id], lengthM: 6.4031, source: 'measured' })
  sala.objects = [{ id: 'obj-1', displayId: 'MOV-001', roomId: sala.id, name: 'Mesa', category: 'furniture', shape: 'rectangle', dimensions: { widthM: 1.2, depthM: .7 }, position: { xM: 2, yM: 1.5 }, rotationDegrees: 0 }]
  sala.photos = [{ id: 'ph-1', fileId: 'file-1', originalFileName: 'porta.jpg', createdAt: '2026-10-03T12:00:00.000Z', roomId: sala.id, linkedEntityType: 'door', linkedEntityId: p01.id, tags: ['batente'], mimeType: 'image/jpeg', size: 4 }]
  sala.labelOffsets = { [`wall:${sala.walls[0].id}`]: { dx: 4, dy: -3 } }
  sala.pendingItems = [{ id: 'pend-1', description: 'Conferir rodapé', resolved: false, kind: 'manual', elementId: sala.walls[1].id }]
  sala.ceilingHeightM = NaN // valor inválido digitado em campo precisa sobreviver
  const p = makeProject([sala, cozinha]) as Project
  p.measurementUnit = 'cm'; p.roomDisplayCounter = 2
  p.relationships = [{ id: 'rel-1', type: 'opening_connection', sourceRoomId: sala.id, sourceElementId: p01.id, targetRoomId: cozinha.id, targetElementId: p02.id }]
  const data: WorkspaceData = { projects: [p], projectId: p.id, floorId: 'F1', roomId: sala.id }
  return { data, p, sala, cozinha, p01 }
}
const reader = async (fileId: string) => fileId === 'file-1' ? { original: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/jpeg' }), thumbnail: new Blob([new Uint8Array([9])]) } : undefined

describe('Etapa 15 — arquivo .levantamento (ZIP)', () => {
  it('exporta e reimporta o projeto inteiro, com fotos, sem alterar nada', async () => {
    const { data, p } = sample()
    const file = await createProjectArchive(data, p.id, reader, new Date(2026, 9, 3))
    expect(file.fileName).toBe('campo-casa-teste-2026-10-03.levantamento')
    expect(file.photoCount).toBe(1)
    const contents = readProjectArchive(file.bytes)
    expect(contents.snapshot.schemaVersion).toBe(SCHEMA_VERSION)
    const restored = contents.project
    expect(Number.isNaN(restored.floors[0].rooms[0].ceilingHeightM)).toBe(true)
    expect({ ...restored, floors: restored.floors.map(f => ({ ...f, rooms: f.rooms.map(r => ({ ...r, ceilingHeightM: 0 })) })) })
      .toEqual({ ...p, floors: p.floors.map(f => ({ ...f, rooms: f.rooms.map(r => ({ ...r, ceilingHeightM: 0 })) })) })
    const photo = contents.files.get('file-1')!
    expect([...new Uint8Array(await photo.original.arrayBuffer())]).toEqual([1, 2, 3, 4])
    expect(photo.thumbnail).toBeDefined()
  })
  it('arquivo inválido ou de versão futura é recusado com mensagem, sem tocar nos dados', async () => {
    expect(() => readProjectArchive(new Uint8Array([1, 2, 3]))).toThrow(/Nada foi alterado/)
    expect(() => readProjectArchive(zipSync({ 'outro.txt': strToU8('x') }))).toThrow(/project.json/)
    const { data } = sample()
    const future = encodeSnapshot({ schemaVersion: SCHEMA_VERSION + 1, revision: 'r', savedAt: '', data, format: 'campo-levantamento-projeto' } as never)
    expect(() => readProjectArchive(zipSync({ 'project.json': strToU8(future) }))).toThrow(/versão mais nova/)
  })
  it('"Importar como novo" gera IDs novos consistentes e mantém displayIds, medidas e vínculos', async () => {
    const { data, p, sala, cozinha, p01 } = sample()
    const contents = readProjectArchive((await createProjectArchive(data, p.id, reader)).bytes)
    const result = applyProjectArchive(data, contents, 'new')
    expect(result.data.projects).toHaveLength(2)
    expect(data.projects).toHaveLength(1) // original intocado
    const copy = result.project
    expect(copy.id).not.toBe(p.id); expect(copy.name).toBe('Casa teste (importado)')
    const [s2, c2] = copy.floors[0].rooms
    expect(s2.id).not.toBe(sala.id); expect(s2.displayId).toBe('AMB-001'); expect(c2.displayId).toBe('AMB-002')
    expect(s2.walls.map(w => w.lengthM)).toEqual(sala.walls.map(w => w.lengthM))
    expect(s2.corners[0].id).toBe(`${s2.walls[0].id}/${s2.walls[1].id}`)
    expect(s2.diagonals[0].cornerIds[0]).toBe(s2.corners[0].id)
    const door = s2.openings[0]
    expect(door.id).not.toBe(p01.id); expect(door.connectedRoomId).toBe(c2.id); expect(door.connectedOpeningId).toBe(c2.openings[0].id)
    expect(copy.relationships[0]).toMatchObject({ sourceRoomId: s2.id, sourceElementId: door.id, targetRoomId: c2.id, targetElementId: c2.openings[0].id })
    expect(s2.photos![0]).toMatchObject({ roomId: s2.id, linkedEntityId: door.id, originalFileName: 'porta.jpg', tags: ['batente'] })
    expect(result.files.has(s2.photos![0].fileId)).toBe(true)
    expect(Object.keys(s2.labelOffsets!)).toEqual([`wall:${s2.walls[0].id}`])
    expect(s2.objects![0]).toMatchObject({ roomId: s2.id, displayId: 'MOV-001' })
    expect(s2.pendingItems[0].elementId).toBe(s2.walls[1].id)
    expect(cozinha.id).not.toBe(c2.id)
  })
  it('"Substituir existente" troca só aquele projeto', async () => {
    const { data, p } = sample()
    const other = { ...p, id: 'outro', name: 'Outro' }
    const contents = readProjectArchive((await createProjectArchive(data, p.id, reader)).bytes)
    const result = applyProjectArchive({ ...data, projects: [{ ...p, name: 'Editado aqui' }, other] }, contents, 'replace')
    expect(result.replaced).toBe(true)
    expect(result.data.projects.map(item => item.name)).toEqual(['Casa teste', 'Outro'])
  })
})
