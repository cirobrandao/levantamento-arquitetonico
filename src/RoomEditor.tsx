import RoomObjectEditor from './RoomObjectEditor'
import { MeasurementInput, useMeasurements } from './Measurement'
import type { WallType } from './models'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Room } from './models'
import { id, wallLabel } from './domain'
import { getCorners } from './corners'
import CornerEditor from './CornerEditor'
import DiagonalEditor from './DiagonalEditor'
import GeometryStatus from './GeometryStatus'
import OpeningEditor from './OpeningEditor'
import InternalWallEditor from './InternalWallEditor'
import { SharedWalls } from './RoomConnections'
import type { RoomOption } from './RoomConnections'
import type { Project } from './models'
import type { ChecklistIssue } from './checklist'
import { ManualMarkers, RoomChecklistPanel } from './ChecklistPanel'
import { nextWallIndex, removePerimeterWall } from './deletions'
import type { RoomGeometry } from './roomGeometry'
import RoomSummary from './RoomSummary'
import { roomMetrics } from './metrics'
import { roomChecklist } from './checklist'
export default function RoomEditor({ room, survey, onChange, relatedRooms, project, onNavigate, focusIssue, selectedObjectId, onSelectObject }: { room: Room; survey: RoomGeometry; onChange: (room: Room) => void; relatedRooms: RoomOption[]; project: Project; onNavigate: (issue: ChecklistIssue) => void; focusIssue?: ChecklistIssue; selectedObjectId?: string; onSelectObject?: (id: string) => void }) {
  const { unit } = useMeasurements()
  const editorRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!focusIssue || focusIssue.roomId !== room.id) return
    const root = editorRef.current
    const target = [...root?.querySelectorAll<HTMLElement>('[data-pending-element]') ?? []].find(element => element.dataset.pendingElement === (focusIssue.field === 'geometry' ? 'geometry' : focusIssue.elementId))
    const field = focusIssue.field
    const control = field && [...target?.querySelectorAll<HTMLElement>('input,select,textarea') ?? []].find(element => element.dataset.pendingField === field || element.id.endsWith(`-${field}`) || (field === 'lengthM' && element.id === focusIssue.elementId))
    let ancestor: HTMLElement | null | undefined = target; while (ancestor && ancestor !== root) { if (ancestor instanceof HTMLDetailsElement) ancestor.open = true; ancestor = ancestor.parentElement }
    const highlighted = control ?? target ?? root
    if (!highlighted) return
    highlighted.classList.add('pending-focus')
    highlighted.scrollIntoView({ behavior: 'smooth', block: 'center' })
    if (control) control.focus({ preventScroll: true })
    return () => highlighted.classList.remove('pending-focus')
  }, [focusIssue, room.id])
  const inputs = useRef<Record<string, HTMLInputElement | null>>({})
  const [message, setMessage] = useState('')
  const { perimeter: geometry, openings: openingLayout, internalWalls: internalWallLayout } = survey
  function addWall() {
    const wall = { id: id(), label: wallLabel(nextWallIndex(room)), lengthM: null }
    const walls = [...room.walls, wall]
    const activeCorners = getCorners(walls, room.corners)
    onChange({ ...room, walls, corners: [...room.corners, ...activeCorners.filter(corner => !room.corners.some(saved => saved.id === corner.id))] })
    setMessage(`Parede ${wall.label} adicionada.`)
    requestAnimationFrame(() => inputs.current[wall.id]?.focus())
  }
  const wallTypes: Record<WallType, string> = { masonry: 'Alvenaria', drywall: 'Drywall', concrete: 'Concreto', glass: 'Vidro', wood: 'Madeira', partition: 'Divisória', other: 'Outro' }
  const metrics = useMemo(() => roomMetrics(room, survey), [room, survey])
  const status = useMemo(() => roomChecklist(room, project, survey), [room, project, survey])
  return <section className="editor" ref={editorRef}>
    
    <div className="section-top"><div><span className="eyebrow">DADOS DO AMBIENTE</span><h2>Comece pelas medidas</h2></div><span className={`pill ${status.complete ? 'pill-complete' : ''}`}>{status.complete ? '✓ Completo' : `Em levantamento · ${status.completeness}%`}</span></div>
    <div className="fields" data-pending-element={room.id} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); const fields = [...event.currentTarget.querySelectorAll<HTMLInputElement>('input')]; const next = fields[fields.indexOf(event.target as HTMLInputElement) + 1]; if (next) next.focus(); else if (room.walls[0]) inputs.current[room.walls[0].id]?.focus(); else addWall() } }}><label>Nome do ambiente<input data-pending-field="name" value={room.name} onChange={e => onChange({ ...room, name: e.target.value })} placeholder="Ex.: Sala de estar"/></label><label>Pé-direito <span>({unit})</span><MeasurementInput data-pending-field="ceilingHeightM" value={room.ceilingHeightM} onValue={value => onChange({ ...room, ceilingHeightM: value })}/></label><ManualMarkers room={room} elementId={room.id}/></div>
    <div className="wall-heading"><div><h3>Paredes do perímetro</h3><p>Cadastre as paredes na ordem do levantamento.</p></div><span className="count">{room.walls.length}</span></div>
    <div className="guidance" data-pending-element="geometry">A primeira parede ({room.walls[0]?.label ?? 'A'}) corresponde, por padrão, à parede da entrada principal. Cadastre as paredes no sentido horário.</div>
    <div className="wall-list">{room.walls.length === 0 ? <div className="empty"><span>＋</span><h3>A primeira parede é a A</h3><p>Adicione uma parede e registre seu comprimento.</p></div> : room.walls.map(wall => <div className="wall-row" key={wall.id} data-pending-element={wall.id}><span className="wall-badge">{wall.label}</span><label htmlFor={wall.id}>Parede {wall.label}<span>Comprimento ({unit})</span></label><div className="measurement"><MeasurementInput id={wall.id} ref={el => { inputs.current[wall.id] = el }} enterKeyHint="next" onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); const next = room.walls[room.walls.findIndex(item => item.id === wall.id) + 1]; if (next) inputs.current[next.id]?.focus(); else addWall() } }} placeholder="0,00" value={wall.lengthM} onValue={value => onChange({ ...room, walls: room.walls.map(w => w.id === wall.id ? { ...w, lengthM: value } : w) })}/><span>{unit}</span></div><button className="remove-wall" aria-label={`Excluir parede ${wall.label}`} onClick={() => { if (window.confirm(`Excluir a parede ${wall.label}? As medidas de aberturas, PIs e diagonais serão mantidas, mas as referências afetadas precisarão ser reassociadas.`)) onChange(removePerimeterWall(room, wall.id)) }}>Remover</button><div className="wall-properties"><label>Espessura ({unit}, opcional)<MeasurementInput data-pending-field="thickness" value={wall.thickness} onValue={value => onChange({ ...room, walls: room.walls.map(item => item.id === wall.id ? { ...item, thickness: value } : item) })}/></label><label>Tipo de parede<select value={wall.wallType ?? ''} onChange={event => onChange({ ...room, walls: room.walls.map(item => item.id === wall.id ? { ...item, wallType: event.target.value as WallType || undefined } : item) })}><option value="">Não informado</option>{Object.entries(wallTypes).map(([type, name]) => <option key={type} value={type}>{name}</option>)}</select></label>{wall.wallType === 'other' && <label>Nome do tipo<input value={wall.customWallType ?? ''} onChange={event => onChange({ ...room, walls: room.walls.map(item => item.id === wall.id ? { ...item, customWallType: event.target.value } : item) })}/></label>}</div><ManualMarkers room={room} elementId={wall.id}/></div>)}</div>
    <div className="wall-actions"><button onClick={addWall}>＋ Adicionar parede</button><button className="primary" onClick={addWall}>Próxima parede →</button></div>
    <CornerEditor room={room} onChange={onChange} calculations={geometry.calculations}/>
    <DiagonalEditor room={room} onChange={onChange} checks={geometry.diagonalChecks}/>
    <OpeningEditor room={room} onChange={onChange} checks={openingLayout.checks} relatedRooms={relatedRooms}/>
    {room.walls.length > 0 && <SharedWalls room={room} rooms={relatedRooms} onChange={onChange}/>}
    <InternalWallEditor room={room} onChange={onChange} checks={internalWallLayout.checks}/>
    <RoomObjectEditor room={room} onChange={onChange} selectedId={selectedObjectId} onSelect={onSelectObject}/>
    <RoomSummary metrics={metrics}/>
    <RoomChecklistPanel room={room} survey={survey} project={project} onChange={onChange} onNavigate={onNavigate}/><div className="mobile-geometry-status"><GeometryStatus geometry={geometry}/></div>
    <p className="sr-only" role="status">{message}</p>
    <p className="memory-note">Salvamento automático neste navegador e dispositivo. Aguarde a indicação “Salvo” antes de encerrar.</p>
  </section>
}
