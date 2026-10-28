import { mkdirSync } from 'node:fs'
import { Database } from 'bun:sqlite'
import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { cors } from 'hono/cors'

type Note = {
  id: number
  body: string
  created_at: string
}

mkdirSync('data', { recursive: true })

const app = new Hono()
app.use('*', cors())
const db = new Database('data/app.db')

db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`)

app.get('/api/v1/health', (c) => c.json({ ok: true }))
app.get('/hello', (c) => c.json({message:'hey there!'}))

app.get('/api/notes', (c) => {
  const rows = db.query('SELECT id, body, created_at FROM notes ORDER BY created_at DESC').all() as Note[]
  return c.json({ notes: rows })
})

app.post('/api/v1/notes', async (c) => {
  const body = await c.req.json<{ body?: string }>()
  if (!body.body || body.body.trim().length === 0) {
    return c.json({ error: 'Note body is required' }, 400)
  }
  const result = db.query('INSERT INTO notes (body) VALUES (?)').run(body.body.trim())
  return c.json({ id: Number(result.lastInsertRowid) }, 201)
})

app.delete('/api/notes/:id', (c) => {
  const id = c.req.param('id')
  db.query('DELETE FROM notes WHERE id = ?').run(id)
  return c.json({ success: true })
})

app.use('/*', serveStatic({ root: './public' }))

export default {
  port: 3000,
  hostname: '0.0.0.0',
  fetch: app.fetch,
}
