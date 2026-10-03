import type { Opening, Room } from './models'
export interface RoomOption { room: Room; path: string }
export function OpeningConnection({ opening, rooms, onChange }: { opening: Opening; rooms: RoomOption[]; onChange: (change: Partial<Opening>) => void }) {
  const target = rooms.find(item => item.room.id === opening.connectedRoomId)?.room
  return <details className="optional-connections"><summary>Vínculo opcional entre ambientes{target ? ` · ${target.name}` : ''}</summary><div className="connection-fields">
    <label>Leva para<select value={opening.connectedRoomId ?? ''} onChange={event => onChange({ connectedRoomId: event.target.value || undefined, connectedOpeningId: undefined })}><option value="">Sem vínculo</option>{rooms.map(item => <option key={item.room.id} value={item.room.id}>{item.path}</option>)}</select></label>
    {target && <label>Abertura correspondente (opcional)<select value={opening.connectedOpeningId ?? ''} onChange={event => onChange({ connectedOpeningId: event.target.value || undefined })}><option value="">Não definida</option>{target.openings.filter(item => item.type !== 'window').map(item => <option key={item.id} value={item.id}>{item.label} · Parede {target.walls.find(wall => wall.id === item.wallId)?.label ?? '?'}</option>)}</select></label>}
    <p className="angle-help">Vínculo informativo. Cada ambiente mantém seu próprio croqui.</p>
  </div></details>
}
export function SharedWalls({ room, rooms, onChange }: { room: Room; rooms: RoomOption[]; onChange: (room: Room) => void }) {
  return <details className="connection-editor" aria-label="Paredes compartilhadas"><summary>Paredes compartilhadas (opcional)</summary><p className="angle-help">Registre a parede correspondente em outro ambiente. As medidas permanecem independentes.</p>{room.walls.map(wall => {
    const target = rooms.find(item => item.room.id === wall.sharedWallReference?.roomId)?.room
    const update = (reference: typeof wall.sharedWallReference) => onChange({ ...room, walls: room.walls.map(item => item.id === wall.id ? { ...item, sharedWallReference: reference } : item) })
    return <div className="connection-fields" key={wall.id} role="group" aria-label={`Vínculo da parede ${wall.label}`}><label>Parede {wall.label} — compartilhada com<select value={target?.id ?? ''} onChange={event => { const next = rooms.find(item => item.room.id === event.target.value)?.room; update(next?.walls[0] ? { roomId: next.id, wallId: next.walls[0].id } : undefined) }}><option value="">Sem vínculo</option>{rooms.map(item => <option key={item.room.id} value={item.room.id} disabled={!item.room.walls.length}>{item.path}{!item.room.walls.length ? ' (sem paredes)' : ''}</option>)}</select></label>{target && <label>Parede correspondente<select value={wall.sharedWallReference?.wallId ?? ''} onChange={event => update({ roomId: target.id, wallId: event.target.value })}>{target.walls.map(item => <option key={item.id} value={item.id}>Parede {item.label}</option>)}</select></label>}</div>
  })}</details>
}
