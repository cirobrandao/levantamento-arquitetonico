import assert from 'node:assert/strict'
import { load } from './load.mjs'
const { createRoom } = await load('domain')
const { getCorners } = await load('corners')
const { createBackup, parseBackup, importProjects, projectCsv, projectRows, CSV_HEADER } = await load('exporting')

function room(name, floorId, lengths) {
  const walls = lengths.map((lengthM, index) => ({ id: `${name}-w${index}`, label: String.fromCharCode(65 + index), lengthM }))
  return { ...createRoom(name, floorId), ceilingHeightM: 2.7, walls, corners: getCorners(walls, []) }
}
const sala = { ...room('Sala; "principal"', 'f1', [4.25, 3, 4.25, 3]), openings: [{ id: 'o1', label: 'J01', type: 'window', wallId: 'Sala; "principal"-w1', referenceCornerId: 'Sala; "principal"-w0/Sala; "principal"-w1', offsetM: 0.5, widthM: 1.2, heightM: 1, sillHeightM: 1.1 }] }
sala.pendingItems = [{ id: 'pi', description: '=HYPERLINK("x")', resolved: false, kind: 'manual', reason: 'doubtful', note: 'conferir' }]
const cozinha = room('Cozinha', 'f1', [NaN, 2, 3, -0])
const project = { id: 'p1', name: 'Casa Árvore', floors: [{ id: 'f1', name: 'Térreo', rooms: [sala, cozinha] }], relationships: [] }
const other = { id: 'p2', name: 'Outro', floors: [], relationships: [] }
const workspace = { projects: [project, other], projectId: 'p1', floorId: 'f1', roomId: sala.id }

// Backup: ida e volta preserva valores originais, inclusive inválidos.
const single = createBackup(workspace, ['p1'])
assert.match(single.fileName, /^campo-casa-arvore-\d{4}-\d{2}-\d{2}\.json$/)
const restored = parseBackup(single.text)
assert.equal(restored.data.projects.length, 1)
const walls = restored.data.projects[0].floors[0].rooms[1].walls
assert.ok(Number.isNaN(walls[0].lengthM)); assert.ok(Object.is(walls[3].lengthM, -0))
assert.equal(restored.data.projects[0].floors[0].rooms[0].walls[0].lengthM, 4.25)
assert.equal(createBackup(workspace).fileName.includes('todos-os-projetos'), true)
assert.throws(() => createBackup(workspace, ['inexistente']), /Não há projeto/)

// Backup inválido não altera nada e tem mensagem clara.
assert.throws(() => parseBackup('isto não é json'), /JSON ilegível/)
assert.throws(() => parseBackup('{"schemaVersion":99,"revision":"x","savedAt":"x","data":{}}'), /versão incompatível/)
assert.throws(() => parseBackup('{"schemaVersion":1,"revision":"x","savedAt":"x","data":{"projects":[]}}'), /incompleto/)

// Importação: adiciona projetos novos e substitui os de mesmo ID, sem tocar nos demais.
const renamed = parseBackup(createBackup({ ...workspace, projects: [{ ...project, name: 'Casa Árvore v2' }] }, ['p1']).text)
const imported = importProjects({ ...workspace, projects: [other] }, restored)
assert.deepEqual(imported.added, ['Casa Árvore']); assert.deepEqual(imported.data.projects.map(p => p.id), ['p2', 'p1']); assert.equal(imported.data.projectId, 'p1')
const replaced = importProjects(workspace, renamed)
assert.deepEqual(replaced.replaced, ['Casa Árvore v2']); assert.deepEqual(replaced.added, [])
assert.equal(replaced.data.projects.find(p => p.id === 'p2'), other)

// Planilha: cabeçalho, separador ;, vírgula decimal, aspas e proteção contra fórmulas.
const csv = projectCsv(project)
assert.ok(csv.text.startsWith('\uFEFF' + CSV_HEADER.join(';')))
assert.match(csv.fileName, /\.csv$/)
assert.ok(csv.text.includes('"Sala; ""principal"""'), 'texto com ; e aspas deve ser escapado')
assert.ok(csv.text.includes(';4,25;'), 'decimais com vírgula')
assert.ok(csv.text.includes("'=HYPERLINK"), 'texto iniciado por = não pode virar fórmula')
const rows = projectRows(project)
const roomRow = rows.find(row => row[3] === 'Ambiente' && row[1] === sala.name)
assert.ok(Math.abs(roomRow[12] - 12.75) < 1e-9, 'área do ambiente na planilha')
assert.ok(rows.some(row => row[3] === 'Janela' && row[4] === 'J01' && row[8] === 1.1))
assert.ok(rows.some(row => row[3] === 'Pendência' && row[4] === 'Medida duvidosa'))
const nanRow = rows.find(row => row[3] === 'Parede' && row[1] === 'Cozinha' && row[4] === 'A')
assert.ok(Number.isNaN(nanRow[5]))
assert.ok(!csv.text.includes('NaN'), 'valor inválido exportado como célula vazia')
console.log('Exportação: backup (ida e volta, inválidos), importação (adicionar/substituir), planilha (escape, fórmulas, decimais) OK.')
