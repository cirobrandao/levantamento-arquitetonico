import { defineConfig } from 'vitest/config'

// Bateria da Etapa 11 (testes obrigatórios). Os testes legados em tests/*.mjs
// continuam rodando por `node tests/run.mjs`.
export default defineConfig({
  test: { include: ['tests/etapa11/**/*.test.{ts,tsx}', 'tests/sync/**/*.test.ts'], environment: 'node' },
})
