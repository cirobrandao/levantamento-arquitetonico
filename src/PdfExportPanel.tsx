import { useMemo, useState } from 'react'
import type { Floor, Project, Room } from './models'
import { downloadBlob } from './exporting'
import { roomExtent, roomSheetPdf } from './pdf/roomSheet'
import { SCALES, fitMessage, fittingOptions, optionLabel, orientationNames } from './pdf/sheetLayout'
import type { Orientation, Scale, SheetOption, SheetSize } from './pdf/sheetLayout'

// PDF vetorial do ambiente atual, sempre em escala física real (sem ajustar à página).
export default function PdfExportPanel({ project, floor, room }: { project: Project; floor?: Floor; room?: Room }) {
  const [option, setOption] = useState<SheetOption>({ sheet: 'A3', orientation: 'landscape', scale: 50 })
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string }>()
  const extent = useMemo(() => room ? roomExtent(room) : undefined, [room])
  if (!room || !extent) return <p className="muted">Selecione um ambiente para gerar a prancha em PDF.</p>
  if (!extent.survey.perimeter.segments.length) return <p className="muted">Cadastre as paredes do ambiente para gerar a prancha em PDF.</p>
  const problem = fitMessage(extent, option)
  const suggestions = problem ? fittingOptions(extent).slice(0, 4) : []
  const generate = () => {
    try { const file = roomSheetPdf({ project, floor, room, option }); downloadBlob(file.fileName, new Blob([file.bytes as BlobPart], { type: 'application/pdf' })); setMessage({ type: 'ok', text: `${file.fileName} gerado em ${optionLabel(option)}. Imprima em 100% (tamanho real).` }) }
    catch (error) { setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Não foi possível gerar o PDF.' }) }
  }
  return <div className="pdf-panel">
    <h4>Prancha do ambiente em PDF (escala real)</h4>
    <div className="pdf-options">
      <label>Folha<select value={option.sheet} onChange={event => setOption({ ...option, sheet: event.target.value as SheetSize })}><option value="A3">A3 (297 × 420 mm)</option><option value="A2">A2 (420 × 594 mm)</option></select></label>
      <label>Orientação<select value={option.orientation} onChange={event => setOption({ ...option, orientation: event.target.value as Orientation })}>{(['portrait', 'landscape'] as const).map(value => <option key={value} value={value}>{orientationNames[value][0].toUpperCase() + orientationNames[value].slice(1)}</option>)}</select></label>
      <label>Escala<select value={option.scale} onChange={event => setOption({ ...option, scale: Number(event.target.value) as Scale })}>{SCALES.map(scale => <option key={scale} value={scale}>1:{scale}</option>)}</select></label>
    </div>
    {problem ? <div className="pdf-warning" role="alert"><p>⚠ {problem}</p>{suggestions.length ? <><p>Combinações que cabem:</p><div className="pdf-suggestions">{suggestions.map(item => <button key={optionLabel(item)} onClick={() => setOption(item)}>{optionLabel(item)}</button>)}</div></> : <p>Nenhuma combinação de A3/A2 nas escalas disponíveis comporta este ambiente.</p>}</div>
      : <p className="pdf-fit">✓ Cabe em {optionLabel(option)}.</p>}
    <button className="primary" disabled={!!problem} onClick={generate}>Gerar PDF ({optionLabel(option)})</button>
    {message && <p className={message.type === 'error' ? 'export-error' : 'export-ok'} role={message.type === 'error' ? 'alert' : 'status'}>{message.text}</p>}
  </div>
}
