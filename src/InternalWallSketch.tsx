import type { buildPerimeter } from './geometry'
import type { placeInternalWallLabels } from './internalWalls'
const meters = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function InternalWallSketch({ labels, geometry }: { labels: ReturnType<typeof placeInternalWallLabels>; geometry: ReturnType<typeof buildPerimeter> }) {
  return <g className="svg-internal-walls" pointerEvents="none">{labels.map(({ placement, x, y, middle }) => {
    const start = geometry.project(placement.start), end = geometry.project(placement.end)
    const wall = placement.internalWall
    const thickness = wall.thicknessM != null && Number.isFinite(wall.thicknessM) && wall.thicknessM > 0 ? Math.max(2, wall.thicknessM * geometry.scale) : 3
    return <g key={wall.id} className="svg-internal-wall" data-element-id={wall.id} role="img" aria-label={`Parede interna ${wall.label}, ${meters.format(wall.lengthM!)} metros, origem na parede ${placement.wall.label}, ${meters.format(wall.origin.type === 'perimeter_wall' ? wall.origin.distanceM! : 0)} metros do canto ${placement.reference.label}, orientação ${wall.orientationDegrees} graus`}>
      <title>{`${wall.label} · Origem: Parede ${placement.wall.label} · Canto ${placement.reference.label} · ${wall.orientationDegrees}°${wall.note ? ` · ${wall.note}` : ''}`}</title>
      <line className="internal-wall-line" x1={start.x} y1={start.y} x2={end.x} y2={end.y} strokeWidth={thickness}/>
      <circle className="internal-wall-origin" cx={start.x} cy={start.y} r="3"/>
      <line className="internal-wall-leader" x1={middle.x} y1={middle.y} x2={x} y2={y + 4}/>
      <text className="internal-wall-label" x={x} y={y} textAnchor="middle"><tspan x={x}>{wall.label}</tspan><tspan x={x} dy="14" className="internal-wall-length">{meters.format(wall.lengthM!)} m</tspan></text>
    </g>
  })}</g>
}
