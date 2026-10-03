import { describe, expect, it } from 'vitest'
import { convertMeasurement, formatMeasurement, parseMeasurement } from '../../src/units'
import { isTheme, resolvedTheme } from '../../src/theme'

describe('Etapa 12 — convertMeasurement', () => {
  it('converte entre mm, cm e m sem perder valores', () => {
    expect(convertMeasurement(1.23, 'm', 'mm')).toBe(1230)
    expect(convertMeasurement(1230, 'mm', 'm')).toBe(1.23)
    expect(convertMeasurement(4.2, 'm', 'cm')).toBe(420)
    expect(convertMeasurement(15, 'cm', 'mm')).toBe(150)
    expect(convertMeasurement(0.1, 'm', 'm')).toBe(0.1)
    for (const v of [0.001, 0.015, 2.805, 3.333333, 12.3456]) expect(convertMeasurement(convertMeasurement(v, 'm', 'mm'), 'mm', 'm')).toBe(v)
    expect(Number.isNaN(convertMeasurement(NaN, 'm', 'mm'))).toBe(true)
  })
  it('parse/format seguem a unidade do projeto', () => {
    expect(parseMeasurement('2,80', 'm')).toBe(2.8); expect(parseMeasurement('280', 'cm')).toBe(2.8); expect(parseMeasurement('2800', 'mm')).toBe(2.8)
    expect(formatMeasurement(2.8, 'mm')).toBe('2.800 mm')
  })
})
describe('Etapa 16 — tema', () => {
  it('Sistema segue prefers-color-scheme; Claro/Escuro fixos', () => {
    expect(resolvedTheme('system', true)).toBe('dark'); expect(resolvedTheme('system', false)).toBe('light')
    expect(resolvedTheme('dark', false)).toBe('dark'); expect(resolvedTheme('light', true)).toBe('light')
    expect(isTheme('sepia')).toBe(false)
  })
})
import { readFileSync } from 'node:fs'
describe('Etapa 16 — cores só por variáveis', () => {
  it('styles.css não tem cor fixa e toda variável existe nos temas claro e escuro', () => {
    const css = readFileSync(new URL('../../src/styles.css', import.meta.url), 'utf8'), theme = readFileSync(new URL('../../src/theme.css', import.meta.url), 'utf8')
    expect(css.match(/#[0-9a-f]{3,6}\b/gi) ?? []).toEqual([])
    const used = new Set([...css.matchAll(/--(c|rgb)-([0-9a-f]{6})/g)].map(m => `--${m[1]}-${m[2]}`))
    const dark = theme.slice(theme.indexOf('[data-theme=dark]'))
    for (const name of used) { expect(theme).toContain(`${name}:`); expect(dark).toContain(`${name}:`) }
  })
})
