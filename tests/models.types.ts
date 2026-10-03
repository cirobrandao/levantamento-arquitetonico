import type { InternalWall, InternalWallOrigin, Opening, Project, RoomRelationship, RoomRelationshipType, Wall } from '../src/models'

const types: RoomRelationshipType[] = ['opening_connection', 'shared_wall', 'adjacency', 'manual_reference']
const relationships: RoomRelationship[] = types.map((type, index) => ({ id: `relation-id-${index}`, type, sourceRoomId: 'room-id-1', sourceElementId: 'element-id-1', targetRoomId: 'room-id-2', targetElementId: 'element-id-2', note: 'Referência futura' }))
const adjacency: RoomRelationship = { id: 'relation-id-adjacency', type: 'adjacency', sourceRoomId: 'room-id-1', targetRoomId: 'room-id-2' }
const project: Project = { id: 'project-id', name: 'Projeto', floors: [], relationships: [...relationships, adjacency] }
const wall: Wall = { id: 'wall-id', label: 'A', lengthM: 4 }
const sharedWall: Wall = { ...wall, sharedWallReference: { roomId: 'room-id-2', wallId: 'other-wall-id' } }
const opening: Opening = { id: 'opening-id', label: 'P01', type: 'door', wallId: wall.id, referenceCornerId: 'corner-id', widthM: 0.8, heightM: 2.1, offsetM: 0.32, sillHeightM: null }
const connectedOpening: Opening = { ...opening, connectedRoomId: 'room-id-2', connectedOpeningId: 'other-opening-id' }
const perimeterOrigin: InternalWallOrigin = { type: 'perimeter_wall', wallId: wall.id, referenceCornerId: 'corner-id', distanceM: 2 }
const linkedOrigin: InternalWallOrigin = { type: 'internal_wall', internalWallId: 'other-internal-wall-id', referenceEndpoint: 'end', distanceM: 0 }
const freeOrigin: InternalWallOrigin = { type: 'free', position: { xM: 1, yM: 2 } }
const internalWall: InternalWall = { id: 'internal-wall-id', label: 'PI01', origin: perimeterOrigin, lengthM: 1, orientationDegrees: 90 }
const futureDivision: InternalWall = { ...internalWall, formalDivisionRelationshipId: relationships[1].id }

// @ts-expect-error Encaixe automático não é um tipo de relação desta etapa.
const invalidRelationship: RoomRelationship = { ...adjacency, type: 'automatic_snap' }
// @ts-expect-error Relações com paredes exigem os IDs do ambiente e da parede.
const invalidShared: Wall = { ...wall, sharedWallReference: { wallId: 'other-wall-id' } }
// @ts-expect-error Conexões guardam IDs textuais.
const invalidOpening: Opening = { ...opening, connectedRoomId: 42 }
// @ts-expect-error A origem no perímetro precisa identificar o canto de referência.
const invalidOrigin: InternalWallOrigin = { type: 'perimeter_wall', wallId: wall.id, distanceM: 2 }
void [project, sharedWall, connectedOpening, linkedOrigin, freeOrigin, futureDivision, invalidRelationship, invalidShared, invalidOpening, invalidOrigin]
