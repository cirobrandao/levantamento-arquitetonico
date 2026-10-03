import assert from 'node:assert/strict'
import { load } from './load.mjs'
const { createRoom } = await load('domain')
const { getCorners } = await load('corners')
const { buildRoomGeometry } = await load('roomGeometry')
const { roomMetrics, formatMetric } = await load('metrics')

function room(lengths, { height = 2.8, angles, openings = [] } = {}) {
  const base = createRoom('Sala', 'f1')
  const walls = lengths.map((lengthM, index) => ({ id: `w${index}`, label: String.fromCharCode(65 + index), lengthM }))
  const corners = getCorners(walls, []).map((corner, index) => angles ? { ...corner, angleDegrees: angles[index], angleSource: angles[index] === null ? null : 'informed' } : corner)
  return { ...base, ceilingHeightM: height, walls, corners, openings }
}
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} ≠ ${expected}`)

const rect = room([4, 3, 4, 3], { openings: [{ id: 'p', label: 'P01', type: 'door', wallId: 'w0', referenceCornerId: 'w3/w0', offsetM: 0.1, widthM: 0.8, heightM: 2.1, sillHeightM: null }] })
const frozen = JSON.stringify(rect)
const m = roomMetrics(rect, buildRoomGeometry(rect))
near(m.perimeterM, 14, 'perímetro'); near(m.floorAreaM2, 12, 'área'); assert.equal(m.areaApproximate, false)
near(m.grossWallAreaM2, 14 * 2.8, 'parede bruta'); near(m.openingsAreaM2, 1.68, 'aberturas'); near(m.netWallAreaM2, 14 * 2.8 - 1.68, 'parede líquida'); near(m.volumeM3, 33.6, 'volume')
assert.deepEqual(m.missing, [])
assert.equal(JSON.stringify(rect), frozen, 'medidas originais não podem ser alteradas')

// Ambiente em L (canto reentrante de 270°): 4×4 menos 2×2 = 12 m².
const l = room([4, 2, 2, 2, 2, 4], { angles: [90, 90, 270, 90, 90, 90] })
near(roomMetrics(l, buildRoomGeometry(l)).floorAreaM2, 12, 'área em L')

// Diferença de fechamento pequena: área aproximada; grande: área não calculada.
const small = room([4, 3, 4.02, 3])
const smallMetrics = roomMetrics(small, buildRoomGeometry(small))
assert.equal(smallMetrics.areaApproximate, true); assert.ok(smallMetrics.floorAreaM2 > 11.9 && smallMetrics.floorAreaM2 < 12.1)
const large = room([4, 3, 4.6, 3])
assert.equal(roomMetrics(large, buildRoomGeometry(large)).floorAreaM2, null)

// Dados incompletos: sem pé-direito, parede sem medida, ângulo indefinido, abertura incompleta.
const incomplete = room([4, null, 4, 3], { height: null })
const im = roomMetrics(incomplete, buildRoomGeometry(incomplete))
assert.equal(im.perimeterM, null); assert.equal(im.floorAreaM2, null); assert.equal(im.volumeM3, null)
assert.ok(im.missing.includes('pé-direito') && im.missing.includes('comprimento de todas as paredes'))
const undefinedAngle = room([4, 3, 4, 3], { angles: [90, null, 90, 90] })
assert.equal(roomMetrics(undefinedAngle, buildRoomGeometry(undefinedAngle)).floorAreaM2, null)
const badOpening = { ...rect, openings: [{ ...rect.openings[0], heightM: null }] }
assert.equal(roomMetrics(badOpening, buildRoomGeometry(badOpening)).netWallAreaM2, null)
assert.equal(roomMetrics(room([4, 3]), buildRoomGeometry(room([4, 3]))).perimeterM, null)
assert.equal(formatMetric(12.345, 'm²'), '12,35 m²'); assert.equal(formatMetric(null, 'm'), '—')
console.log('Quantitativos: área (retângulo, L, fechamento aproximado), perímetro, paredes, aberturas, volume e dados incompletos OK.')
