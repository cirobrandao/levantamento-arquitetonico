import { ManualMarkers } from './ChecklistPanel'
import type { AngleCalculation, Corner, Room } from './models'
import type { AutoAngleNote } from './geometry'
import { getCorners, validAngle } from './corners'
import { id } from './domain'

const focusLater = (elementId: string) => requestAnimationFrame(() => requestAnimationFrame(() => { const input = document.getElementById(elementId); input?.scrollIntoView({ behavior: 'smooth', block: 'center' }); input?.focus({ preventScroll: true }) }))

const degrees = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
type Mode = 'auto' | 'informed' | 'assumed' | 'undefined'
const modeOf = (corner: Corner): Mode => corner.angleSource === 'calculated' ? 'auto' : corner.angleSource === 'assumed' ? 'assumed' : corner.angleSource === null ? 'undefined' : 'informed'

// Modos: Automático (calculado pela geometria: diagonais ou fechamento do perímetro), Manual (informado),
// 90° presumido e Ainda não definido. O valor automático nunca é gravado como medida; só o manual é.
export default function CornerEditor({ room, onChange, calculations = [], autoNotes = [] }: { room: Room; onChange: (room: Room) => void; calculations?: AngleCalculation[]; autoNotes?: AutoAngleNote[] }) {
  const corners = getCorners(room.walls, room.corners)
  if (!corners.length) return null
  function changeCorners(next: Corner[]) {
    const ids = new Set(next.map(corner => corner.id))
    onChange({ ...room, corners: [...room.corners.filter(corner => !ids.has(corner.id)), ...next] })
  }
  const changeCorner = (next: Corner) => changeCorners([next])
  const convertible = corners.filter(corner => corner.angleSource === 'assumed' || corner.angleSource === null)
  const missing = corners.filter(corner => modeOf(corner) === 'auto' && !calculations.some(item => item.cornerId === corner.id))
  // Motivo igual para todos os cantos sem dados: aparece uma vez só, no aviso do topo.
  const reasons = [...new Set(missing.map(corner => autoNotes.find(item => item.cornerId === corner.id)?.message ?? 'Dados insuficientes para calcular.'))]
  const sharedReason = reasons.length === 1 ? reasons[0] : undefined
  // Atalho de um toque: cria (ou reaproveita) a diagonal que parte deste canto e leva o cursor ao campo da medida.
  function measureDiagonal(index: number) {
    const from = corners[index], to = corners[(index + Math.min(2, corners.length - 1)) % corners.length]
    const existing = room.diagonals.find(item => item.cornerIds.includes(from.id) && item.cornerIds.includes(to.id))
    const diagonal = existing ?? { id: id(), cornerIds: [from.id, to.id] as [string, string], lengthM: null, source: 'measured' as const }
    if (!existing) onChange({ ...room, diagonals: [...room.diagonals, diagonal] })
    focusLater(`${diagonal.id}-lengthM`)
  }
  return <section className="corner-editor" aria-label="Ângulos entre paredes">
    <h3>Encontros entre paredes</h3>
    <p className="angle-help">Ângulo interno do ambiente (canto reentrante em L = 270°). No modo <b>Automático</b>, o app calcula o ângulo pelas paredes medidas e diagonais; você pode sobrescrever com um valor <b>manual</b> a qualquer momento.</p>
    {convertible.length > 0 && room.walls.length >= 3 && <button className="auto-all" onClick={() => changeCorners(convertible.map(corner => ({ ...corner, angleSource: 'calculated', angleDegrees: null })))}>⚙ Calcular automaticamente os {convertible.length} encontro{convertible.length > 1 ? 's' : ''} sem ângulo medido</button>}
    {missing.length > 0 && <div className="angle-warning" role="status"><p><b>⚠ {missing.length === 1 ? '1 encontro ainda sem dados' : `${missing.length} encontros ainda sem dados`}</b> para o cálculo automático.{sharedReason && <> {sharedReason}</>} Até lá, o croqui usa 90° provisoriamente nesses cantos (sem alterar o que foi medido). Use os atalhos de cada canto: medir uma diagonal ou informar o ângulo.</p>
      <button onClick={() => changeCorners(missing.map(corner => ({ ...corner, angleSource: 'assumed', angleDegrees: 90 })))}>Presumir 90° {missing.length === 1 ? 'nesse encontro' : `nos ${missing.length}`}</button></div>}
    {corners.map((corner, index) => {
      const label = `${room.walls[index].label}${room.walls[(index + 1) % room.walls.length].label}`
      const mode = modeOf(corner)
      const invalid = mode === 'informed' && !validAngle(corner.angleDegrees)
      const calculated = calculations.find(item => item.cornerId === corner.id)
      const note = autoNotes.find(item => item.cornerId === corner.id)
      const method = calculated?.method === 'closure' ? 'pelo fechamento do perímetro (paredes medidas)' : 'pela diagonal medida'
      return <div className={`corner-row corner-${mode}`} data-pending-element={corner.id} key={corner.id}>
        <label htmlFor={`mode-${corner.id}`}>Canto {label}<select id={`mode-${corner.id}`} value={mode} onChange={event => {
          const value = event.target.value as Mode
          if (value === 'auto') changeCorner({ ...corner, angleSource: 'calculated', angleDegrees: null })
          else if (value === 'assumed') changeCorner({ ...corner, angleSource: 'assumed', angleDegrees: 90 })
          else if (value === 'undefined') changeCorner({ ...corner, angleSource: null, angleDegrees: null })
          else changeCorner({ ...corner, angleSource: 'informed', angleDegrees: validAngle(corner.angleDegrees) && corner.angleSource !== 'assumed' ? corner.angleDegrees : calculated ? Math.round(calculated.angleDegrees * 10) / 10 : corner.angleDegrees })
        }}><option value="auto">Automático (pela geometria)</option><option value="informed">Manual (ângulo informado)</option><option value="assumed">90° presumido</option><option value="undefined">Ainda não definido</option></select></label>
        {mode === 'informed' && <label htmlFor={`angle-${corner.id}`}>Ângulo (°)<input id={`angle-${corner.id}`} type="number" step="any" min="0.01" max="359.99" inputMode="decimal" value={corner.angleDegrees ?? ''} aria-invalid={invalid} aria-describedby={invalid ? `error-${corner.id}` : undefined} placeholder="Ex.: 82" onChange={event => changeCorner({ ...corner, angleDegrees: event.target.value === '' ? null : Number(event.target.value), angleSource: 'informed' })}/></label>}
        {mode === 'auto' && <div className="auto-angle" aria-live="polite">{calculated ? <><span className="angle-badge badge-auto">auto</span><strong>≈ {degrees.format(calculated.angleDegrees)}°</strong></> : <button className="angle-badge badge-missing" title="Ir para os atalhos deste canto" onClick={() => corners.length >= 4 ? measureDiagonal(index) : (changeCorner({ ...corner, angleSource: 'informed', angleDegrees: null }), focusLater(`angle-${corner.id}`))}>faltam dados ›</button>}</div>}
        <ManualMarkers room={room} elementId={corner.id}/>{invalid && <p id={`error-${corner.id}`} className="angle-error">Informe um ângulo maior que 0° e menor que 360°. O desenho usa 90° provisoriamente.</p>}
        {mode === 'auto' && calculated && <p className="calculated-note">Calculado {method}. <button className="link-button" onClick={() => changeCorner({ ...corner, angleSource: 'informed', angleDegrees: Math.round(calculated.angleDegrees * 10) / 10 })}>Sobrescrever manualmente</button></p>}
        {mode === 'auto' && !calculated && <div className="missing-shortcuts">{!sharedReason && <p className="angle-missing">{note?.message ?? 'Dados insuficientes para calcular.'}</p>}
          {corners.length >= 4 && <button onClick={() => measureDiagonal(index)}>📏 Medir diagonal</button>}<button onClick={() => { changeCorner({ ...corner, angleSource: 'informed', angleDegrees: null }); focusLater(`angle-${corner.id}`) }}>✎ Informar ângulo</button></div>}
        {mode === 'informed' && <p className="calculated-note"><span className="angle-badge badge-manual">manual</span> Valor informado por você; tem prioridade sobre o cálculo. <button className="link-button" onClick={() => changeCorner({ ...corner, angleSource: 'calculated', angleDegrees: null })}>Voltar ao automático</button></p>}
        {mode !== 'auto' && mode !== 'informed' && calculated && <p className="calculated-note">No croqui: ≈ {degrees.format(calculated.angleDegrees)}° — calculado por diagonal. O valor original acima foi preservado.</p>}
      </div>
    })}
  </section>
}
