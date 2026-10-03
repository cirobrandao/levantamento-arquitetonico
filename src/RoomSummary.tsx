import type { RoomMetrics } from './metrics'
import { formatMetric } from './metrics'
import { useMeasurements } from './Measurement'
// Quadro de quantitativos do ambiente (área, perímetro, paredes e volume).
export default function RoomSummary({ metrics }: { metrics: RoomMetrics }) {
  const { format } = useMeasurements() // comprimentos seguem a unidade do projeto; áreas em m²
  const items: [string, string][] = [
    ['Área do piso', `${metrics.areaApproximate && metrics.floorAreaM2 !== null ? '≈ ' : ''}${formatMetric(metrics.floorAreaM2, 'm²')}`],
    ['Perímetro', metrics.perimeterM === null ? '—' : format(metrics.perimeterM)],
    ['Área de paredes (bruta)', formatMetric(metrics.grossWallAreaM2, 'm²')],
    ['Aberturas', formatMetric(metrics.openingsAreaM2, 'm²')],
    ['Área de paredes (líquida)', formatMetric(metrics.netWallAreaM2, 'm²')],
    ['Volume', `${metrics.areaApproximate && metrics.volumeM3 !== null ? '≈ ' : ''}${formatMetric(metrics.volumeM3, 'm³')}`],
  ]
  return <section className="room-summary" aria-label="Quantitativos do ambiente">
    <h3>Quantitativos</h3>
    <dl>{items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {metrics.missing.length > 0 && <p className="muted">Para calcular todos os valores, informe: {metrics.missing.join(', ')}.</p>}
    {metrics.areaApproximate && metrics.floorAreaM2 !== null && <p className="muted">Área aproximada: usa ângulos calculados ou um perímetro com pequena diferença de fechamento.</p>}
  </section>
}
