import { useMemo, useState } from 'react'
import type { Project, Room } from './models'
import { createRoom, findRoom, id, updateRoom } from './domain'
import RoomEditor from './RoomEditor'
import Sketch from './Sketch'
import { flattenRooms, reconcileRelationships, removeRoom } from './relationships'
import type { RoomOption } from './RoomConnections'
import { ProjectChecklistPanel } from './ChecklistPanel'
import type { ChecklistIssue } from './checklist'
import { useLocalWorkspace } from './useLocalWorkspace'
import { buildRoomGeometry } from './roomGeometry'

function RoomTree({ rooms, selected, onSelect, onAdd, onDelete }: { rooms: Room[]; selected: string; onSelect: (id: string) => void; onAdd: (parent: string) => void; onDelete: (room: Room) => void }) {
  return <ul className="room-tree">{rooms.map(room => <li key={room.id}><div className="tree-row"><button className={selected === room.id ? 'selected' : ''} onClick={() => onSelect(room.id)}>▧ <span>{room.name || 'Sem nome'}</span></button><button className="add-child" onClick={() => onAdd(room.id)} aria-label={`Adicionar subambiente em ${room.name}`} title="Adicionar subambiente">＋</button><button className="delete-tree" onClick={() => onDelete(room)} aria-label={`Excluir ambiente ${room.name}`}>×</button></div>{room.subrooms.length > 0 && <RoomTree rooms={room.subrooms} selected={selected} onSelect={onSelect} onAdd={onAdd} onDelete={onDelete}/>}</li>)}</ul>
}
const initialFloorId = id()
const initialRoom = createRoom('Sala', initialFloorId)
const initialFloor = { id: initialFloorId, name: 'Térreo', rooms: [initialRoom] }
const initialProject: Project = { id: id(), name: 'Meu levantamento', floors: [initialFloor], relationships: [] }

export default function App() {
  const { workspace, setWorkspace, ready, loadError, status, saveError, retrySave } = useLocalWorkspace({ projects: [initialProject], projectId: initialProject.id, floorId: initialFloor.id, roomId: initialRoom.id })
  const { projects, projectId, floorId, roomId } = workspace
  function setProjects(action: Project[] | ((projects: Project[]) => Project[])) { setWorkspace(current => ({ ...current, projects: typeof action === 'function' ? action(current.projects) : action })) }
  function setProjectId(value: string) { setWorkspace(current => ({ ...current, projectId: value })) }
  function setFloorId(value: string) { setWorkspace(current => ({ ...current, floorId: value })) }
  function setRoomId(value: string) { setWorkspace(current => ({ ...current, roomId: value })) }
  const [showProjectChecklist, setShowProjectChecklist] = useState(false)
  const [navigationOpen, setNavigationOpen] = useState(false)
  const [focusIssue, setFocusIssue] = useState<ChecklistIssue>()
  const project = projects.find(p => p.id === projectId)!
  const floor = project.floors.find(f => f.id === floorId)
  const room = floor && findRoom(floor.rooms, roomId)
  const survey = useMemo(() => room ? buildRoomGeometry(room) : undefined, [room?.walls, room?.corners, room?.diagonals, room?.openings, room?.internalWalls])
  function navigateIssue(issue: ChecklistIssue) {
    const targetFloor = project.floors.find(item => findRoom(item.rooms, issue.roomId))
    if (!targetFloor) return
    setFloorId(targetFloor.id); setRoomId(issue.roomId); setShowProjectChecklist(false); setFocusIssue({ ...issue })
  }
  const relatedRooms: RoomOption[] = project.floors.flatMap(f => {
    function options(rooms: Room[], path: string): RoomOption[] { return rooms.flatMap(r => [{ room: r, path: `${path} / ${r.name || 'Sem nome'}` }, ...options(r.subrooms, `${path} / ${r.name || 'Sem nome'}`)]) }
    return options(f.rooms, f.name || 'Sem nome')
  }).filter(item => item.room.id !== roomId)
  function changeProject(change: (p: Project) => Project) { setProjects(items => items.map(p => p.id === projectId ? reconcileRelationships(change(p)) : p)) }
  function deleteRoom(target: Room) {
    if (!window.confirm(`Excluir “${target.name}” e seus subambientes? As medidas e os vínculos serão removidos.`)) return
    changeProject(p => ({ ...p, floors: p.floors.map(f => ({ ...f, rooms: removeRoom(f.rooms, target.id) })) }))
    if (flattenRooms([target]).some(item => item.id === roomId)) setRoomId(target.parentRoomId ?? '')
  }
  function deleteFloor(targetId: string) {
    const target = project.floors.find(item => item.id === targetId)!
    if (!window.confirm(`Excluir o pavimento “${target.name}” e todos os seus ambientes?`)) return
    changeProject(p => ({ ...p, floors: p.floors.filter(item => item.id !== targetId) }))
    if (floorId === targetId) { const next = project.floors.find(item => item.id !== targetId); setFloorId(next?.id ?? ''); setRoomId(next?.rooms[0]?.id ?? '') }
  }
  function deleteProject() {
    if (!window.confirm(`Excluir o projeto “${project.name}” e todos os seus dados?`)) return
    const remaining = projects.filter(item => item.id !== projectId)
    const next = remaining[0] ?? { id: id(), name: 'Novo projeto', floors: [], relationships: [] }
    setProjects(remaining.length ? remaining : [next]); setProjectId(next.id); setFloorId(next.floors[0]?.id ?? ''); setRoomId(next.floors[0]?.rooms[0]?.id ?? '')
  }
  function addProject() { const next: Project = { id: id(), name: `Projeto ${projects.length + 1}`, floors: [], relationships: [] }; setProjects([...projects, next]); setProjectId(next.id); setFloorId(''); setRoomId('') }
  function addFloor() { const next = { id: id(), name: `Pavimento ${project.floors.length + 1}`, rooms: [] }; changeProject(p => ({ ...p, floors: [...p.floors, next] })); setFloorId(next.id); setRoomId('') }
  function addRoom(parent?: string) {
    if (!floor) return
    const next = createRoom(parent ? 'Novo subambiente' : 'Novo ambiente', floor.id, parent)
    changeProject(p => ({ ...p, floors: p.floors.map(f => f.id === floorId ? { ...f, rooms: parent ? updateRoom(f.rooms, parent, r => ({ ...r, subrooms: [...r.subrooms, next] })) : [...f.rooms, next] } : f) }))
    setRoomId(next.id)
    setNavigationOpen(false)
  }
  function changeRoom(next: Room) { changeProject(p => ({ ...p, floors: p.floors.map(f => f.id === floorId ? { ...f, rooms: updateRoom(f.rooms, next.id, () => next) } : f) })) }
  if (!ready) return <main className="loading-workspace"><h1>Campo</h1>{loadError ? <><p role="alert">{loadError}</p><button onClick={() => window.location.reload()}>Tentar novamente</button></> : <p role="status">Abrindo seus projetos…</p>}</main>
  return <><header className="app-header"><a className="brand" href="./"><span className="brand-icon">⌑</span>campo<span className="brand-sub">LEVANTAMENTO ARQUITETÔNICO</span></a><div className="save-indicator"><span className="session" role="status" aria-live="polite">{status === 'saving' ? 'Salvando...' : status === 'saved' ? '✓ Salvo' : 'Não foi possível salvar'}</span>{status === 'error' && <button onClick={retrySave}>Tentar salvar novamente</button>}</div></header>
    {saveError && <div className="save-error" role="alert">{saveError} Os dados continuam abertos para edição. Tente salvar novamente antes de fechar.</div>}
    <button className="mobile-navigation" aria-expanded={navigationOpen} aria-controls="project-navigation" onClick={() => setNavigationOpen(value => !value)}>{navigationOpen ? 'Recolher projeto' : '☰ Projeto e ambientes'}</button><div className="app-shell"><nav id="project-navigation" className={`sidebar ${navigationOpen ? 'navigation-open' : ''}`} aria-label="Organização do levantamento"><div className="sidebar-title"><span className="eyebrow">SEU LEVANTAMENTO</span><button onClick={addProject} aria-label="Criar projeto" title="Criar projeto">＋</button></div>
      <label>Projeto<select value={projectId} onChange={e => { const next = projects.find(p => p.id === e.target.value)!; setProjectId(next.id); setFloorId(next.floors[0]?.id || ''); setRoomId(next.floors[0]?.rooms[0]?.id || '') }}>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>Nome do projeto<input value={project.name} onChange={e => changeProject(p => ({ ...p, name: e.target.value }))}/></label>
      <button className="delete-organizer" onClick={deleteProject}>Excluir projeto</button>
      <div className="nav-heading"><h3>Pavimentos</h3><button onClick={addFloor} aria-label="Adicionar pavimento">＋</button></div>
      {project.floors.map(f => <div key={f.id} className="floor-block"><button className={`floor-button ${floorId === f.id ? 'active' : ''}`} onClick={() => { setFloorId(f.id); setRoomId(f.rooms[0]?.id || '') }}>▱ {f.name || 'Sem nome'}</button>{floorId === f.id && <><label className="floor-name">Nome do pavimento<input value={f.name} onChange={e => changeProject(p => ({ ...p, floors: p.floors.map(item => item.id === f.id ? { ...item, name: e.target.value } : item) }))}/></label><button className="delete-organizer" onClick={() => deleteFloor(f.id)}>Excluir pavimento</button><RoomTree rooms={f.rooms} selected={roomId} onSelect={value => { setRoomId(value); setNavigationOpen(false) }} onAdd={addRoom} onDelete={deleteRoom}/><button className="new-room" onClick={() => addRoom()}>＋ Novo ambiente</button></>}</div>)}
      {!project.floors.length && <p className="muted">Adicione um pavimento para começar.</p>}<button onClick={() => setShowProjectChecklist(value => !value)} aria-expanded={showProjectChecklist}>⚑ Pendências do projeto</button><div className="sidebar-foot">Projeto → Pavimento → Ambiente → Subambiente</div>
    </nav><main><div className="page-heading"><p className="breadcrumb">{project.name} <span>/</span> {floor?.name || 'Sem pavimento'}</p><h1>{room?.name || 'Organize seu levantamento'}</h1><p>Meça, registre e mantenha as informações do ambiente em um só lugar.</p></div><div className="workspace"><div className="editor-column">{showProjectChecklist && <ProjectChecklistPanel project={project} onNavigate={navigateIssue}/>} {room ? <RoomEditor key={room.id} room={room} survey={survey!} onChange={changeRoom} relatedRooms={relatedRooms} project={project} onNavigate={navigateIssue} focusIssue={focusIssue?.roomId === room.id ? focusIssue : undefined}/> : <section className="editor empty"><h2>{floor ? 'Crie seu primeiro ambiente' : 'Crie um pavimento'}</h2><p>Cada ambiente terá suas próprias medidas e seu próprio croqui.</p><button className="primary" onClick={() => floor ? addRoom() : addFloor()}>{floor ? '＋ Novo ambiente' : '＋ Novo pavimento'}</button></section>}</div><Sketch key={'sketch-' + (room?.id ?? 'empty')} room={room} survey={survey} focusElementId={focusIssue?.roomId === room?.id ? focusIssue?.elementId : undefined}/></div></main></div></>
}
