import express from 'express';
import cors from 'cors';
import db, { intervalMinutes, listMonitors } from './database.js';
import { checkMonitor, normalizePublicUrl, startScheduler } from './checker.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({limit: '12kb'}));
app.use(cors({origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5174']}));

app.get('/api/health', (_req, res) => res.json({ ok: true, application: 'MONITRA', live: true }));
app.get('/api/monitors', (_req, res) => res.json(listMonitors()));

app.post('/api/monitors', (req, res) => {
  try {
    const url = normalizePublicUrl(req.body.url);
    const name = String(req.body.name || new URL(url).hostname).trim().slice(0, 60);
    if (!name) return res.status(400).json({error: 'Monitor name is required.'});
    const result = db.prepare('INSERT INTO monitors(name, url) VALUES (?,?)').run(name, url);
    void checkMonitor(result.lastInsertRowid);
    res.status(201).json({id: String(result.lastInsertRowid), name, url, status: 'pending'});
  } catch (error) {
    const exists = error.code?.startsWith('SQLITE_CONSTRAINT');
    res.status(exists ? 409 : 400).json({error: exists ? 'This website is already monitored.' : error.message});
  }
});

app.patch('/api/monitors/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || !['paused','active'].includes(req.body.action)) return res.status(400).json({error:'Invalid monitor update.'});
  const status = req.body.action === 'paused' ? 'paused' : 'pending';
  const result = db.prepare('UPDATE monitors SET status=?, checked_at=NULL WHERE id=?').run(status, id);
  if (!result.changes) return res.status(404).json({error:'Monitor not found.'});
  if (status === 'pending') void checkMonitor(id);
  res.json({ok:true});
});

app.delete('/api/monitors/:id', (req,res) => {
  const result = db.prepare('DELETE FROM monitors WHERE id=?').run(Number(req.params.id));
  if (!result.changes) return res.status(404).json({error:'Monitor not found.'});
  res.json({ok:true});
});

app.post('/api/monitors/:id/check', (req,res) => {
  const id = Number(req.params.id);
  const monitor = db.prepare('SELECT id,status FROM monitors WHERE id=?').get(id);
  if (!monitor) return res.status(404).json({error:'Monitor not found.'});
  if (monitor.status === 'paused') return res.status(409).json({error:'Resume monitoring first.'});
  void checkMonitor(id);
  res.status(202).json({ok:true});
});

app.get('/api/incidents', (_req, res) => {
  const rows = db.prepare(`SELECT i.id, i.title, i.status, i.started_at, i.resolved_at, m.name AS service
    FROM incidents i JOIN monitors m ON m.id=i.monitor_id ORDER BY i.started_at DESC LIMIT 60`).all();
  res.json(rows.map(row => ({...row, id: String(row.id), time: new Date(`${row.started_at}Z`).toLocaleString()})));
});

app.get('/api/analytics', (req,res) => {
  const days = req.query.range === '7d' ? 7 : 1;
  const rows = db.prepare(`SELECT checked_at, response_ms FROM checks
    WHERE response_ms IS NOT NULL AND checked_at >= datetime('now', ?)
    ORDER BY checked_at`).all(`-${days} days`);
  const buckets = new Map();
  for (const row of rows) {
    const date = new Date(`${row.checked_at}Z`);
    const bucket = days === 7 ? date.toISOString().slice(0,10) : date.toISOString().slice(0,13);
    const b = buckets.get(bucket) || {sum:0,count:0};
    b.sum += row.response_ms; b.count++;
    buckets.set(bucket,b);
  }
  res.json([...buckets].map(([bucket,b])=>({label:days===7 ? bucket.slice(5) : `${bucket.slice(11)}:00`, value:Math.round(b.sum/b.count)})));
});

app.get('/api/settings', (_req,res) => res.json({intervalMinutes:intervalMinutes()}));
app.patch('/api/settings', (req,res) => {
  const minutes = Number(req.body.intervalMinutes);
  if (![1,5,15].includes(minutes)) return res.status(400).json({error:'Select 1, 5, or 15 minutes.'});
  db.prepare('UPDATE settings SET value=? WHERE key=?').run(String(minutes), 'intervalMinutes');
  res.json({intervalMinutes:minutes});
});

app.use((error, _req,res,_next) => {
  console.error(error);
  res.status(500).json({error:'Server error. Check terminal logs.'});
});

const port = Number(process.env.PORT || 3001);
app.listen(port, '127.0.0.1', () => {
  console.log(`MONITRA API running → http://localhost:${port}/api/health`);
  startScheduler();
});
