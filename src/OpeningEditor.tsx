import { MeasurementInput, useMeasurements } from './Measurement'
import { ManualMarkers } from './ChecklistPanel'
import type { Opening, OpeningType, Room } from './models'
import { id } from './domain'
import { getWallReferences, openingLabel, openingNames } from './openings'
import type { OpeningCheck } from './openings'
import { OpeningConnection } from './RoomConnections'
import type { RoomOption } from './RoomConnections'

export default function OpeningEditor({ room, onChange, checks, relatedRooms = [] }: { room: Room; onChange: (room: Room) => void; checks: OpeningCheck[]; relatedRooms?: RoomOption[] }) {
  const { unit, format } = useMeasurements()
  const canAdd = room.walls.length >= 2
  function addOpening(type: OpeningType) {
    const wall = room.walls[0]
    const reference = getWallReferences(room.walls, room.corners, wall.id)[0]
    const sequence = room.openingCounters[type] + 1
    const opening: Opening = { id: id(), label: openingLabel(type, sequence), type, wallId: wall.id, referenceCornerId: reference.id, offsetM: null, widthM: null, heightM: null, sillHeightM: null }
    onChange({ ...room, openings: [...room.openings, opening], openingCounters: { ...room.openingCounters, [type]: sequence } })
  }
  return <section className="opening-editor" aria-label="Aberturas nas paredes">
    <h3>Portas, janelas e vãos</h3>
    <p className="angle-help">Medidas em {unit}. A distância parte do canto escolhido até a borda mais próxima da abertura. O croqui acompanha a unidade do projeto.</p>
    <div className="opening-actions">{(['door', 'window', 'gap'] as const).map(type => <button key={type} disabled={!canAdd} onClick={() => addOpening(type)}>＋ {openingNames[type]}</button>)}</div>
    {!canAdd && <p className="angle-help">Cadastre pelo menos duas paredes para identificar os cantos de referência.</p>}
    {room.openings.map(opening => {
      const references = getWallReferences(room.walls, room.corners, opening.wallId)
      const reference = references.find(item => item.id === opening.referenceCornerId)
      const wall = room.walls.find(item => item.id === opening.wallId)
      const check = checks.find(item => item.id === opening.id)
      const update = (changes: Partial<Opening>) => onChange({ ...room, openings: room.openings.map(item => item.id === opening.id ? { ...item, ...changes } : item) })
      const field = (key: 'widthM' | 'heightM' | 'sillHeightM' | 'offsetM', label: string) => <label htmlFor={`${opening.id}-${key}`}>{label}<MeasurementInput id={`${opening.id}-${key}`} value={opening[key]} onValue={value => update({ [key]: value })}/></label>
      return <section className="opening-card" data-pending-element={opening.id} key={opening.id} aria-label={`${openingNames[opening.type]} ${opening.label}`}>
        <div className="opening-heading"><h4>{opening.label} <span>· {openingNames[opening.type]}</span></h4><button onClick={() => onChange({ ...room, openings: room.openings.filter(item => item.id !== opening.id) })} aria-label={`Remover ${opening.label}`}>Remover</button></div>
        <ManualMarkers room={room} elementId={opening.id}/><div className="opening-fields">
          <label>Parede<select value={opening.wallId} onChange={event => { const wallId = event.target.value; update({ wallId, referenceCornerId: getWallReferences(room.walls, room.corners, wallId)[0]?.id ?? '' }) }}>{!wall && <option value={opening.wallId}>Parede fora do perímetro</option>}{room.walls.map(item => <option key={item.id} value={item.id}>Parede {item.label}</option>)}</select></label>
          <label>Canto de referência<select value={opening.referenceCornerId} onChange={event => update({ referenceCornerId: event.target.value })}>{!reference && <option value={opening.referenceCornerId}>Selecione um canto atual</option>}{references.map(item => <option key={item.id} value={item.id}>{item.label} — {item.endpoint === 'start' ? 'início' : 'final'} da parede {wall?.label}</option>)}</select></label>
          {field('widthM', `Largura (${unit})`)}{field('heightM', `Altura (${unit})`)}
          {opening.type === 'window' && field('sillHeightM', `Peitoril (${unit})`)}
          <div className="opening-offset">{field('offsetM', `Distância do canto até a borda da abertura (${unit})`)}</div>
        </div>
        <p className="opening-summary">{opening.label} · Parede {wall?.label ?? '?'} · {format(opening.widthM, false)} × {format(opening.heightM)}{opening.type === 'window' ? ` · P=${format(opening.sillHeightM)}` : ''}<br/>{format(opening.offsetM)} do canto {reference?.label ?? '?'} até a borda mais próxima.</p>
        {opening.type !== 'window' && <OpeningConnection opening={opening} rooms={relatedRooms} onChange={update}/>}
        {check && check.messages.length > 0 && <div className="opening-feedback" aria-live="polite">{check.messages.map(message => <p key={message}>{message}</p>)}</div>}
      </section>
    })}
  </section>
}
