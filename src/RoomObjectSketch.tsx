import { useMeasurements } from './Measurement'
import type { buildPerimeter } from './geometry'
import type { ObjectPlacement } from './roomObjects'
import { objectDimensionsLabel, objectCategoryNames } from './roomObjects'

export default function RoomObjectSketch({ placements, geometry, selectedId, onSelect }: { placements: ObjectPlacement[]; geometry: ReturnType<typeof buildPerimeter>; selectedId?: string; onSelect?: (id: string) => void }) {
  const { unit } = useMeasurements()
  return <g className="svg-room-objects">{placements.map(({ object, center, widthM, heightM }) => {
    const point = geometry.project(center), width = widthM * geometry.scale, height = heightM * geometry.scale
    if (![point.x, point.y, width, height].every(Number.isFinite)) return null
    const label = objectDimensionsLabel(object, unit)
    const codeFits = width >= object.displayId.length * 6 + 6 && (object.shape === 'line' || height >= 16)
    const dimensionsFit = codeFits && width >= label.length * 5 + 8 && height >= 36
    const select = () => onSelect?.(object.id)
    return <g key={object.id} data-object-id={object.id} className={`svg-room-object ${selectedId === object.id ? 'is-selected' : ''}`} role="button" tabIndex={0} aria-pressed={selectedId === object.id} aria-label={`${object.displayId} ${object.name}, ${objectCategoryNames[object.category]}, ${label}, rotação ${object.rotationDegrees}°`} onClick={select} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select() } }}>
      <title>{`${object.displayId} — ${object.name} · ${label} · ${object.rotationDegrees}°${object.note ? ` · ${object.note}` : ''}`}</title>
      <g transform={`translate(${point.x} ${point.y}) rotate(${object.rotationDegrees ?? 0})`}>
        {object.shape !== 'line' && <rect x={-Math.max(width, 16) / 2} y={-Math.max(height, 16) / 2} width={Math.max(width, 16)} height={Math.max(height, 16)} fill="transparent"/>}
        {object.shape === 'rectangle' && <rect className="object-shape" x={-width / 2} y={-height / 2} width={width} height={height} rx="2"/>}
        {object.shape === 'circle' && <circle className="object-shape" r={width / 2}/>}
        {object.shape === 'line' && <><line className="object-hit" x1={-width / 2} x2={width / 2} y1="0" y2="0"/><line className="object-shape" x1={-width / 2} x2={width / 2} y1="0" y2="0"/></>}
      </g>
      {(codeFits || selectedId === object.id) && <text className="object-label" x={point.x} y={point.y + (object.shape === 'line' ? -8 : dimensionsFit ? -3 : 3)} textAnchor="middle" pointerEvents="none">{object.displayId}{dimensionsFit && <tspan x={point.x} dy="13">{label}</tspan>}</text>}
    </g>
  })}</g>
}
