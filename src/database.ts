export const DATABASE_NAME = 'campo-levantamentos'
let database: Promise<IDBDatabase> | undefined
export function openDatabase(): Promise<IDBDatabase> {
  if (!database) database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 2)
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('workspace')) request.result.createObjectStore('workspace'); if (!request.result.objectStoreNames.contains('photoFiles')) request.result.createObjectStore('photoFiles') }
    request.onerror = () => reject(request.error ?? new Error('Não foi possível abrir o armazenamento local.'))
    request.onblocked = () => reject(new Error('Feche outras abas antigas da aplicação e tente novamente.'))
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => { db.close(); database = undefined }
      resolve(db)
    }
  }).catch(error => { database = undefined; throw error })
  return database
}
