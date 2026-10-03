import { openDatabase } from './database'
const pendingDeletion = new Set<string>()
export function queuePhotoDeletion(fileId: string) { pendingDeletion.add(fileId) }
export function pendingPhotoDeletions(used: Set<string>) { return [...pendingDeletion].filter(fileId => !used.has(fileId)) }
export function acknowledgePhotoDeletions(ids: string[]) { ids.forEach(id => pendingDeletion.delete(id)) }
export const thumbnailKey = (fileId: string) => `thumbnail:${fileId}`
export async function savePhotoFile(fileId: string, original: Blob, thumbnail: Blob): Promise<void> {
  if (!globalThis.indexedDB) throw new Error('Este navegador não disponibiliza IndexedDB para guardar fotos. As medidas continuam disponíveis.')
  const db = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('photoFiles', 'readwrite')
    const store = transaction.objectStore('photoFiles')
    store.put(original, fileId); store.put(thumbnail, thumbnailKey(fileId))
    transaction.oncomplete = () => resolve()
    transaction.onerror = transaction.onabort = () => reject(transaction.error ?? new Error('Não foi possível guardar a foto. Verifique o espaço disponível.'))
  })
}
export async function readPhotoFile(fileId: string, thumbnail = false): Promise<Blob> {
  const db = await openDatabase()
  return new Promise<Blob>((resolve, reject) => {
    const transaction = db.transaction('photoFiles', 'readonly')
    const request = transaction.objectStore('photoFiles').get(thumbnail ? thumbnailKey(fileId) : fileId)
    let result: unknown
    request.onsuccess = () => { result = request.result }
    transaction.oncomplete = () => result instanceof Blob ? resolve(result) : reject(new Error('Arquivo da foto indisponível neste navegador.'))
    transaction.onerror = transaction.onabort = () => reject(transaction.error ?? new Error('Não foi possível abrir a foto.'))
  })
}
export async function discardUnlinkedPhotoFile(fileId: string): Promise<void> {
  const db = await openDatabase()
  await new Promise<void>((resolve, reject) => { const transaction = db.transaction('photoFiles', 'readwrite'); const store = transaction.objectStore('photoFiles'); store.delete(fileId); store.delete(thumbnailKey(fileId)); transaction.oncomplete = () => resolve(); transaction.onerror = transaction.onabort = () => reject(transaction.error) })
}
export async function createThumbnail(file: File): Promise<Blob> {
  let image: ImageBitmap | HTMLImageElement
  let url: string | undefined
  try {
    if (typeof createImageBitmap === 'function') {
      try { image = await createImageBitmap(file) } catch { image = await loadImage() }
    } else image = await loadImage()
    const ratio = Math.min(1, 400 / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * ratio)); canvas.height = Math.max(1, Math.round(image.height * ratio))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Não foi possível gerar a miniatura.')
    context.fillStyle = '#fff'; context.fillRect(0,0,canvas.width,canvas.height); context.drawImage(image,0,0,canvas.width,canvas.height)
    if ('close' in image) image.close()
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Não foi possível gerar a miniatura.')), 'image/jpeg', .75))
  } finally { if (url) URL.revokeObjectURL(url) }
  function loadImage(): Promise<HTMLImageElement> {
    url = URL.createObjectURL(file)
    return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('Formato de imagem não suportado por este navegador. Tente JPEG ou PNG.')); img.src = url! })
  }
}
