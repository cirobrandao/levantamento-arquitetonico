import type { buildPerimeter } from './geometry'
import { useMemo } from 'react'
import { formatCm, openingNames, placeOpeningLabels } from './openings'
import type { buildOpeningLayout, LabelBox } from './openings'

export default function OpeningSketch({ layout, geometry, extraReservations = [] }: { layout: ReturnType<typeof buildOpeningLayout>; geometry: ReturnType<typeof buildPerimeter>; extraReservations?: LabelBox[] }) {
  const labels = useMemo(() => placeOpeningLabels(layout.placements, geometry.project, extraReservations), [layout, geometry, extraReservations])
  return <g className="svg-openings" pointerEvents="none">{labels.map(({ placement, x, y, anchor }) => {
    const { opening, direction, reference } = placement
    const start = geometry.project(placement.start), end = geometry.project(placement.end)
    const normal = { x: -direction.y, y: direction.x }
    const dimensions = `${formatCm(opening.widthM)} × ${formatCm(opening.heightM)} cm`
    const referenceText = `${formatCm(opening.offsetM)} cm de ${reference.label}`
    const jamb = (point: { x: number; y: number }) => <line x1={point.x - normal.x * 5} y1={point.y - normal.y * 5} x2={point.x + normal.x * 5} y2={point.y + normal.y * 5}/>
    return <g key={opening.id} className={`svg-opening opening-${opening.type}`} role="img" aria-label={`${openingNames[opening.type]} ${opening.label}, parede ${placement.wall.label}, ${dimensions}${opening.type === 'window' ? `, peitoril ${formatCm(opening.sillHeightM)} cm` : ''}, ${referenceText} até a borda mais próxima`}>
      <title>{`${opening.label} · Parede ${placement.wall.label} · ${referenceText} até a borda mais próxima`}</title>
      <g className="opening-jambs">{jamb(start)}{jamb(end)}</g>
      {opening.type === 'window' && <g className="window-pane">{[-2, 2].map(offset => <line key={offset} x1={start.x + normal.x * offset} y1={start.y + normal.y * offset} x2={end.x + normal.x * offset} y2={end.y + normal.y * offset}/>)}</g>}
      <line className="opening-leader" x1={anchor.x} y1={anchor.y} x2={x} y2={y + 4}/>
      <circle className="opening-anchor" cx={anchor.x} cy={anchor.y} r="2"/>
      <text x={x} y={y} textAnchor="middle" className="opening-label"><tspan x={x} className="opening-code">{opening.label}</tspan><tspan x={x} dy="12">{dimensions}</tspan>{opening.type === 'window' && <tspan x={x} dy="12">P={formatCm(opening.sillHeightM)} cm</tspan>}<tspan x={x} dy="12" className="opening-reference">{referenceText}</tspan></text>
    </g>
  })}</g>
}
