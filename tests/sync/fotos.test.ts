import { describe, expect, it } from 'vitest'
import { syncPhotoFiles } from '../../src/photoSync'
import type { PhotoTransport, RemotePhoto } from '../../src/photoSync'
import type { Project } from '../../src/models'

const proj = (fileIds: string[]) => ({ id: 'p', name: 'P', relationships: [], floors: [{ id: 'f', name: 'T', rooms: [{ id: 'r', name: 'Sala', subrooms: [], photos: fileIds.map(fileId => ({ id: `ph-${fileId}`, fileId, mimeType: 'image/jpeg', originalFileName: `${fileId}.jpg`, createdAt: '', roomId: 'r', tags: [], size: 1 })) }] }] }) as unknown as Project
function fakes(server: Record<string, { blob: Blob; thumb?: Blob }>, device: Record<string, { blob: Blob; thumb: Blob }>) {
  const transport: PhotoTransport = {
    async list() { return Object.entries(server).map(([fileId, item]): RemotePhoto => ({ fileId, mimeType: 'image/jpeg', thumbnail: !!item.thumb })) },
    async upload(fileId, blob) { server[fileId] = { blob } },
    async uploadThumbnail(fileId, thumb) { server[fileId].thumb = thumb },
    async download(fileId, thumbnail) { const item = server[fileId]; if (!item) throw new Error('404'); return thumbnail ? item.thumb! : item.blob },
  }
  const local = { async read(fileId: string, thumbnail?: boolean) { const item = device[fileId]; return item && (thumbnail ? item.thumb : item.blob) }, async save(fileId: string, blob: Blob, thumb: Blob) { device[fileId] = { blob, thumb } } }
  return { transport, local }
}
const b = (text: string) => new Blob([text], { type: 'image/jpeg' })
describe('Etapa 18 — fotos sincronizadas', () => {
  it('envia o que falta no servidor e baixa o que falta no aparelho, sem apagar nada', async () => {
    const server = { s1: { blob: b('S1'), thumb: b('s1') }, sobra: { blob: b('X') } }
    const device = { d1: { blob: b('D1'), thumb: b('d1') } }
    const { transport, local } = fakes(server, device)
    const result = await syncPhotoFiles([proj(['s1', 'd1', 'perdida'])], transport, local)
    expect(result.uploaded).toEqual(['d1']); expect(result.downloaded).toEqual(['s1']); expect(result.missing).toEqual(['perdida'])
    expect(await (server as Record<string, { blob: Blob; thumb?: Blob }>).d1.thumb!.text()).toBe('d1')
    expect(await (device as Record<string, { blob: Blob }>).s1.blob.text()).toBe('S1')
    expect(Object.keys(server)).toContain('sobra')
    const again = await syncPhotoFiles([proj(['s1', 'd1'])], transport, local)
    expect(again.uploaded).toEqual([]); expect(again.downloaded).toEqual([])
  })
  it('falha de rede numa foto não interrompe as outras', async () => {
    const { transport, local } = fakes({}, { a: { blob: b('A'), thumb: b('a') }, c: { blob: b('C'), thumb: b('c') } })
    const upload = transport.upload; transport.upload = async (fileId, blob, mime) => { if (fileId === 'a') throw new Error('rede'); return upload(fileId, blob, mime) }
    const result = await syncPhotoFiles([proj(['a', 'c'])], transport, local)
    expect(result.failed).toEqual(['a']); expect(result.uploaded).toEqual(['c'])
  })
})
