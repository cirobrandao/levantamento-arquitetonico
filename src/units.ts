export type MeasurementUnit = 'mm' | 'cm' | 'm'
// Canonical lengths remain in meters to preserve the existing geometry and data.
const factors: Record<MeasurementUnit, number> = { mm: 1000, cm: 100, m: 1 }
export const unitNames: Record<MeasurementUnit, string> = { mm: 'Milímetros', cm: 'Centímetros', m: 'Metros' }
export const isMeasurementUnit = (value: unknown): value is MeasurementUnit => value === 'mm' || value === 'cm' || value === 'm'
export function toDisplay(valueM: number, unit: MeasurementUnit): number { return valueM * factors[unit] }
export function toCanonical(value: number, unit: MeasurementUnit): number { return value / factors[unit] }
export function parseMeasurement(text: string, unit: MeasurementUnit): number | null {
  const value = text.trim().replace(',', '.')
  if (!value) return null
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) return NaN
  return toCanonical(Number(value), unit)
}
export function inputMeasurement(value: number | null | undefined, unit: MeasurementUnit): string {
  return value == null || !Number.isFinite(value) ? '' : String(toDisplay(value, unit))
}
// Em metros, rótulos seguem o padrão técnico com duas casas ("4,20 m");
// casas extras medidas em campo continuam visíveis.
export function formatMeasurement(value: number | null | undefined, unit: MeasurementUnit, suffix = true): string {
  if (value == null || !Number.isFinite(value)) return '?'
  const text = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: unit === 'm' ? 2 : 0, maximumFractionDigits: 6 }).format(toDisplay(value, unit))
  return suffix ? `${text} ${unit}` : text
}
