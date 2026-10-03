export type MeasurementSource = 'measured' | 'informed' | 'assumed' | 'calculated'
// Todos os comprimentos são armazenados em metros.
export interface Wall { id: string; label: string; lengthM: number | null; sharedWallReference?: { roomId: string; wallId: string } }
export type AngleSource = 'assumed' | 'informed' | 'calculated'
export interface Corner { id: string; wallIds: [string, string]; angleDegrees: number | null; angleSource: AngleSource | null }
export interface Diagonal { id: string; cornerIds: [string, string]; lengthM: number | null; source: 'measured' }
export interface AngleCalculation { cornerId: string; angleDegrees: number; angleSource: 'calculated'; diagonalIds: string[] }
export type OpeningType = 'door' | 'window' | 'gap'
export interface Opening { id: string; label: string; wallId: string; type: OpeningType; referenceCornerId: string; offsetM: number | null; widthM: number | null; heightM: number | null; sillHeightM: number | null; connectedRoomId?: string; connectedOpeningId?: string }
export type InternalWallOrigin =
  | { type: 'perimeter_wall'; wallId: string; referenceCornerId: string; distanceM: number | null }
  | { type: 'internal_wall'; internalWallId: string; referenceEndpoint: 'start' | 'end'; distanceM: number | null }
  | { type: 'free'; position: { xM: number; yM: number } }
export interface InternalWall {
  id: string; label: string; origin: InternalWallOrigin; lengthM: number | null;
  // Ângulo horário relativo ao sentido da origem; origens livres usarão o eixo x local.
  orientationDegrees: number | null; thicknessM?: number | null; heightM?: number | null; note?: string;
  formalDivisionRelationshipId?: string
}
export type RoomRelationshipType = 'opening_connection' | 'shared_wall' | 'adjacency' | 'manual_reference'
export interface RoomRelationship {
  id: string; type: RoomRelationshipType; sourceRoomId: string; sourceElementId?: string;
  targetRoomId: string; targetElementId?: string; note?: string
}
export interface PendingItem { id: string; description: string; resolved: boolean; kind?: 'manual' | 'technical'; reason?: 'check_on_site' | 'doubtful'; elementId?: string; field?: string; note?: string; issueKey?: string }
export interface Room { id: string; name: string; floorId: string; parentRoomId?: string; ceilingHeightM: number | null; walls: Wall[]; corners: Corner[]; diagonals: Diagonal[]; openings: Opening[]; openingCounters: Record<OpeningType, number>; internalWalls: InternalWall[]; internalWallCounter: number; pendingItems: PendingItem[]; subrooms: Room[] }
export interface Floor { id: string; name: string; rooms: Room[] }
export interface Project { id: string; name: string; floors: Floor[]; relationships: RoomRelationship[] }
