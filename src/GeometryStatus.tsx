import type { buildPerimeter } from './geometry'
import { geometryTolerance } from './tolerances'
const centimeters = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
export default function GeometryStatus({ geometry }: { geometry: ReturnType<typeof buildPerimeter> }) {
  if (geometry.segments.length < 3) return null
  const angleWarning = geometry.allAnglesDefined && geometry.orientationMismatch > geometryTolerance.angleDifferenceWarningDegrees
  return <div className="geometry-status" aria-live="polite">
    {(geometry.calculations.length > 0 || !geometry.closed) && <p>Geometria aproximada.</p>}
    {geometry.allMeasured && <p>Diferença de fechamento: {centimeters.format(geometry.closureM * 100)} cm.</p>}
    {geometry.allMeasured && (geometry.closureSeverity === 'warning' || angleWarning) && <p className="closure-warning">Verifique as medidas informadas.</p>}
    {angleWarning && <p>Diferença de orientação no último encontro: {centimeters.format(geometry.orientationMismatch)}°.</p>}
    {geometry.allMeasured && !geometry.endpointsMeet && <p>O traçado permanece aberto. O trecho tracejado de fechamento é apenas indicativo.</p>}
    {geometry.closed && <p>Perímetro fechado.</p>}
    {geometry.diagonalSegments.length > 0 && <p>Os valores das diagonais são os medidos; sua representação pode diferir quando houver inconsistências.</p>}
  </div>
}
