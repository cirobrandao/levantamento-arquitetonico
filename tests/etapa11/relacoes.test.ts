import { describe, expect, it } from 'vitest'
import { reconcileRelationships, removeRoom } from '../../src/relationships'
import { opening, project, roomFrom } from './helpers'

function casa() {
  const sala = roomFrom('Sala', [4, 3, 4, 3]), cozinha = roomFrom('Cozinha', [3, 3, 3, 3])
  const p01 = opening(sala, { label: 'P01', type: 'door' })
  const p02 = opening(cozinha, { label: 'P02', type: 'door' })
  return { sala, cozinha, p01, p02, project: project([sala, cozinha]) }
}

describe('Etapa 11 — relações entre ambientes', () => {
  it('T14 "Leva para" guarda o ID do ambiente, não o nome', () => {
    const c = casa()
    c.p01.connectedRoomId = c.cozinha.id
    const result = reconcileRelationships(c.project)
    expect(result.relationships).toHaveLength(1)
    expect(result.relationships[0]).toMatchObject({ type: 'opening_connection', targetRoomId: c.cozinha.id })
  })

  it('T15 P01 da Sala ligada à P02 da Cozinha', () => {
    const c = casa()
    Object.assign(c.p01, { connectedRoomId: c.cozinha.id, connectedOpeningId: c.p02.id })
    const relation = reconcileRelationships(c.project).relationships[0]
    expect(relation).toMatchObject({ sourceElementId: c.p01.id, targetElementId: c.p02.id })
  })

  it('T16 parede compartilhada não altera medidas', () => {
    const c = casa()
    c.sala.walls[1].sharedWallReference = { roomId: c.cozinha.id, wallId: c.cozinha.walls[3].id }
    const lengths = JSON.stringify([c.sala.walls.map(w => w.lengthM), c.cozinha.walls.map(w => w.lengthM)])
    const result = reconcileRelationships(c.project)
    expect(result.relationships.map(item => item.type)).toEqual(['shared_wall'])
    const [sala, cozinha] = result.floors[0].rooms
    expect(JSON.stringify([sala.walls.map(w => w.lengthM), cozinha.walls.map(w => w.lengthM)])).toBe(lengths)
  })

  it('T17 renomear ambiente não quebra relação', () => {
    const c = casa()
    Object.assign(c.p01, { connectedRoomId: c.cozinha.id, connectedOpeningId: c.p02.id })
    let result = reconcileRelationships(c.project)
    const ids = result.relationships.map(item => item.id)
    result.floors[0].rooms[1].name = 'Copa'
    result = reconcileRelationships(result)
    expect(result.relationships.map(item => item.id)).toEqual(ids)
    expect(result.floors[0].rooms[0].openings[0].connectedRoomId).toBe(c.cozinha.id)
  })

  it('T18 renomear parede não quebra parede compartilhada', () => {
    const c = casa()
    c.sala.walls[1].sharedWallReference = { roomId: c.cozinha.id, wallId: c.cozinha.walls[3].id }
    let result = reconcileRelationships(c.project)
    result.floors[0].rooms[1].walls[3].label = 'X'
    result = reconcileRelationships(result)
    expect(result.relationships).toHaveLength(1)
    expect(result.floors[0].rooms[0].walls[1].sharedWallReference).toEqual({ roomId: c.cozinha.id, wallId: c.cozinha.walls[3].id })
  })

  it('T19 excluir ambiente relacionado limpa vínculos sem deixar órfãos', () => {
    const c = casa()
    Object.assign(c.p01, { connectedRoomId: c.cozinha.id, connectedOpeningId: c.p02.id })
    c.sala.walls[1].sharedWallReference = { roomId: c.cozinha.id, wallId: c.cozinha.walls[3].id }
    let result = reconcileRelationships(c.project)
    expect(result.relationships).toHaveLength(2)
    result = { ...result, floors: [{ ...result.floors[0], rooms: removeRoom(result.floors[0].rooms, c.cozinha.id) }] }
    result = reconcileRelationships(result)
    const sala = result.floors[0].rooms[0]
    expect(result.relationships).toHaveLength(0)
    expect(sala.openings[0].connectedRoomId).toBeUndefined()
    expect(sala.walls[1].sharedWallReference).toBeUndefined()
    expect(sala.walls.map(w => w.lengthM)).toEqual([4, 3, 4, 3])
  })
})
