import { ManualMarkers } from './ChecklistPanel'
import type { AngleCalculation, Corner, Room } from './models'
import { getCorners, validAngle } from './corners'

export default function CornerEditor({ room, onChange, calculations = [] }: { room: Room; onChange: (room: Room) => void; calculations?: AngleCalculation[] }) {
  const corners = getCorners(room.walls, room.corners)
  if (!corners.length) return null
  function changeCorner(next: Corner) {
    onChange({ ...room, corners: [...room.corners.filter(corner => corner.id !== next.id), next] })
  }
  return <section className="corner-editor" aria-label="Ângulos entre paredes">
    <h3>Encontros entre paredes</h3>
    <p className="angle-help">Informe o ângulo interno do ambiente. Para um canto reentrante em L, use 270°. O último encontro conecta a última parede à A.</p>
    {corners.map((corner, index) => {
      const label = `${room.walls[index].label}${room.walls[(index + 1) % room.walls.length].label}`
      const mode = corner.angleSource === 'assumed' ? 'assumed' : corner.angleSource === null ? 'undefined' : 'informed'
      const invalid = mode === 'informed' && !validAngle(corner.angleDegrees)
      const calculated = calculations.find(item => item.cornerId === corner.id)
      return <div className="corner-row" data-pending-element={corner.id} key={corner.id}>
        <label htmlFor={`mode-${corner.id}`}>Canto {label}<select id={`mode-${corner.id}`} value={mode} onChange={event => {
          const value = event.target.value
          changeCorner({ ...corner, angleSource: value === 'undefined' ? null : value === 'assumed' ? 'assumed' : 'informed', angleDegrees: value === 'undefined' ? null : value === 'assumed' ? 90 : corner.angleDegrees })
        }}><option value="assumed">90° presumido</option><option value="informed">Ângulo informado</option><option value="undefined">Ainda não definido</option></select></label>
        {mode === 'informed' && <label htmlFor={`angle-${corner.id}`}>Ângulo (°)<input id={`angle-${corner.id}`} type="number" step="any" min="0.01" max="359.99" inputMode="decimal" value={corner.angleDegrees ?? ''} aria-invalid={invalid} aria-describedby={invalid ? `error-${corner.id}` : undefined} placeholder="Ex.: 82" onChange={event => changeCorner({ ...corner, angleDegrees: event.target.value === '' ? null : Number(event.target.value), angleSource: 'informed' })}/></label>}
        <ManualMarkers room={room} elementId={corner.id}/>{invalid && <p id={`error-${corner.id}`} className="angle-error">Informe um ângulo maior que 0° e menor que 360°. O desenho usa 90° provisoriamente.</p>}
        {calculated && <p className="calculated-note">No croqui: ≈ {new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(calculated.angleDegrees)}° — calculado por diagonal. O valor original acima foi preservado.</p>}
      </div>
    })}
  </section>
}
