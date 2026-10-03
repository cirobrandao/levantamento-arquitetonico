// Arquivos das fotos sincronizadas: um diretório por usuário, fora do banco (que guarda só o índice).
// As fotos nunca são apagadas automaticamente pelo envio de um aparelho: priorizamos não perder dados.
import express from 'express'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { query } from './db.mjs'

const MAX_PHOTO_BYTES = 30 * 1024 * 1024
const MAX_THUMB_BYTES = 2 * 1024 * 1024
const ID = /^[A-Za-z0-9_-]{1,100}$/
const MIME = /^image\/[a-z0-9.+-]{1,40}$/
export const photoRoot = path.resolve(process.env.PHOTO_STORAGE_DIR || fileURLToPath(new URL('../data/photos', import.meta.url)))

async function store(file, bytes) {
  await mkdir(path.dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`
  await writeFile(temp, bytes); await rename(temp, file)
}

export function photosRouter() {
  const router = express.Router()
  const dirOf = req => path.join(photoRoot, String(req.user.id))
  // Índice das fotos do usuário (para o aparelho saber o que enviar e o que baixar).
  router.get('/', async (req, res, next) => {
    try { res.json((await query('SELECT file_id, mime, size, has_thumbnail FROM photo_files WHERE user_id = $1 ORDER BY created_at', [req.user.id])).rows.map(row => ({ fileId: row.file_id, mimeType: row.mime, size: Number(row.size), thumbnail: row.has_thumbnail }))) } catch (error) { next(error) }
  })
  router.put('/:fileId', express.raw({ type: () => true, limit: MAX_PHOTO_BYTES }), async (req, res, next) => {
    try {
      const { fileId } = req.params, mime = String(req.get('Content-Type') || '').split(';')[0].trim().toLowerCase()
      if (!ID.test(fileId) || !MIME.test(mime) || !Buffer.isBuffer(req.body) || !req.body.length) return res.status(422).json({ error: 'Foto inválida; nada foi gravado.' })
      await store(path.join(dirOf(req), fileId), req.body)
      await query(`INSERT INTO photo_files (user_id, file_id, mime, size) VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id, file_id) DO UPDATE SET mime = EXCLUDED.mime, size = EXCLUDED.size, updated_at = now()`, [req.user.id, fileId, mime, req.body.length])
      res.status(201).json({ fileId, size: req.body.length })
    } catch (error) { next(error) }
  })
  router.put('/:fileId/thumbnail', express.raw({ type: () => true, limit: MAX_THUMB_BYTES }), async (req, res, next) => {
    try {
      const { fileId } = req.params
      if (!ID.test(fileId) || !Buffer.isBuffer(req.body) || !req.body.length) return res.status(422).json({ error: 'Miniatura inválida.' })
      const { rowCount } = await query('UPDATE photo_files SET has_thumbnail = TRUE, updated_at = now() WHERE user_id = $1 AND file_id = $2', [req.user.id, fileId])
      if (!rowCount) return res.status(404).json({ error: 'Envie a foto antes da miniatura.' })
      await store(path.join(dirOf(req), `${fileId}.thumb`), req.body)
      res.status(201).json({ fileId })
    } catch (error) { next(error) }
  })
  router.get('/:fileId', async (req, res, next) => {
    try {
      const { fileId } = req.params, thumbnail = req.query.thumbnail === '1'
      if (!ID.test(fileId)) return res.status(404).json({ error: 'Foto não encontrada.' })
      const { rows } = await query('SELECT mime, has_thumbnail FROM photo_files WHERE user_id = $1 AND file_id = $2', [req.user.id, fileId])
      if (!rows.length || (thumbnail && !rows[0].has_thumbnail)) return res.status(404).json({ error: 'Foto não encontrada.' })
      const file = path.join(dirOf(req), thumbnail ? `${fileId}.thumb` : fileId)
      await stat(file)
      res.set('Cache-Control', 'private, max-age=31536000, immutable').type(thumbnail ? 'image/jpeg' : rows[0].mime).send(await readFile(file))
    } catch (error) { if (error?.code === 'ENOENT') return res.status(404).json({ error: 'Arquivo da foto ausente no servidor.' }); next(error) }
  })
  return router
}
