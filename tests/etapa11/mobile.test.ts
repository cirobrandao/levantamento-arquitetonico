import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// O uso real no celular (toque, teclado virtual, rolagem) é verificado
// manualmente — ver tests/etapa11/README.md. Aqui garantimos que as regras
// responsivas que sustentam esse uso não foram removidas.
const css = readFileSync(new URL('../../src/styles.css', import.meta.url), 'utf8')
const app = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8')
const editor = readFileSync(new URL('../../src/RoomEditor.tsx', import.meta.url), 'utf8')

describe('Etapa 11 — uso no celular (verificação estrutural)', () => {
  it('T21 layout de celular: navegação recolhível, coluna única, croqui e status visíveis', () => {
    const phone = css.split('\n').find(line => line.startsWith('@media(max-width:800px){.app-header'))
    expect(phone).toContain('.app-shell{display:block}')
    expect(css).toMatch(/\.mobile-geometry-status\{display:block/)
    expect(css).toMatch(/@media\(max-width:380px\)\{\.fields\{grid-template-columns:1fr\}/)
    expect(app).toContain('className="mobile-navigation"')
    expect(app).toContain('aria-expanded={navigationOpen}')
    expect(editor).toContain('mobile-geometry-status')
    expect(readFileSync(new URL('../../index.html', import.meta.url), 'utf8')).toContain('width=device-width')
  })
})
