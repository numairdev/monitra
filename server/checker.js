import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';
import db, { intervalMinutes } from './database.js';

// Restrict targets to publicly routable hosts. Useful for any service that
// allows users to supply URLs; never allow requests to private infrastructure.
function isPublicIp(address) {
  const version = isIP(address);
  if (version === 4) {
    const [a,b,c] = address.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 ||
        a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 ||
        a === 100 && b >= 64 && b <= 127 || a === 192 && b === 0 ||
        a === 192 && b === 0 && c === 2 || a === 192 && b === 88 ||
        a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) ||
        a === 203 && b === 0 && c === 113) return false;
    return true;
  }
  if (version === 6) {
    const ip = address.toLowerCase();
    if (ip.startsWith('::ffff:')) return isPublicIp(ip.slice(7));
    if (!/^[23][0-9a-f]{0,3}:/.test(ip)) return false;
    if (ip.startsWith('2001:db8:')) return false;
    return true;
  }
  return false;
}

export function normalizePublicUrl(input) {
  if (typeof input !== 'string' || input.length > 2048) throw new Error('Please enter a valid URL.');
  const raw = /^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`;
  let url;
  try { url = new URL(raw); } catch { throw new Error('Please enter a valid website URL.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password ||
      !url.hostname.includes('.') || url.hostname.endsWith('.') ||
      /\.(local|localhost|internal|test|invalid)$/i.test(url.hostname) ||
      url.hostname.toLowerCase() === 'localhost' ||
      (url.port && !['80', '443'].includes(url.port))) {
    throw new Error('Only public HTTP/HTTPS websites on standard ports are supported.');
  }
  if (isIP(url.hostname) && !isPublicIp(url.hostname)) throw new Error('Private network addresses cannot be monitored.');
  url.hash = '';
  return url.href.replace(/\/$/, '');
}

async function requestPublicWebsite(rawUrl) {
  const url = new URL(rawUrl);
  const answers = await lookup(url.hostname, { all: true });
  if (!answers.length || answers.some(answer => !isPublicIp(answer.address))) throw new Error('URL points to a restricted network.');
  const chosen = answers[0];
  const transport = url.protocol === 'https:' ? https : http;
  const start = performance.now();
  return new Promise((resolve, reject) => {
    const req = transport.request(url, {
      method: 'GET', timeout: 9000,
      headers: { 'User-Agent': 'MONITRA-Monitor/1.0', 'Accept': '*/*', 'Connection': 'close' },
lookup: (_hostname, options, callback) => {
  if (options.all) {
    callback(null, [{
      address: chosen.address,
      family: chosen.family
    }]);
  } else {
    callback(null, chosen.address, chosen.family);
  }
},      agent: false,
    }, res => {
      const elapsed = Math.round(performance.now() - start);
      // Do not follow redirects. Otherwise a public URL could redirect to a private IP.
      res.destroy();
      resolve({ code: res.statusCode, elapsed });
    });
    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.on('error', reject);
    req.end();
  });
}

const running = new Set();

export async function checkMonitor(id) {
  id = Number(id);
  if (!Number.isSafeInteger(id) || running.has(id)) return;
  const monitor = db.prepare('SELECT * FROM monitors WHERE id = ?').get(id);
  if (!monitor || monitor.status === 'paused') return;
  running.add(id);
  let status = 'down', response = null, httpStatus = null, errorMessage = null;
  try {
    const result = await requestPublicWebsite(monitor.url);
    httpStatus = result.code;
    response = result.elapsed;
    status = httpStatus >= 200 && httpStatus < 400 ? (response > 1200 ? 'degraded' : 'operational') : 'down';
    if (status === 'down') errorMessage = `HTTP ${httpStatus}`;
  } catch (error) {
    errorMessage = String(error.message || 'Connection failed').slice(0, 220);
  }
  try {
    const old = db.prepare('SELECT status FROM monitors WHERE id = ?').get(id);
    if (!old || old.status === 'paused') return;
    const commit = db.transaction(() => {
      db.prepare('UPDATE monitors SET status=?, response_ms=?, http_status=?, checked_at=datetime(\'now\') WHERE id=?')
        .run(status, response, httpStatus, id);
      db.prepare('INSERT INTO checks(monitor_id,status,response_ms,http_status,error_message) VALUES(?,?,?,?,?)')
        .run(id, status, response, httpStatus, errorMessage);
      const unresolved = db.prepare("SELECT id FROM incidents WHERE monitor_id=? AND status='Investigating' ORDER BY id DESC LIMIT 1").get(id);
      if (status === 'down' && !unresolved) {
        db.prepare('INSERT INTO incidents(monitor_id,title) VALUES (?,?)').run(id, 'Website unavailable');
      } else if (status !== 'down' && unresolved) {
        db.prepare("UPDATE incidents SET status='Resolved', resolved_at=datetime('now') WHERE id=?").run(unresolved.id);
      }
    });
    commit();
  } finally {
    running.delete(id);
  }
}

let ticker;
export function startScheduler() {
  // Sweep once per minute, but each monitor respects the selected interval.
  const sweep = () => {
    const mins = intervalMinutes();
    const due = db.prepare(`SELECT id FROM monitors WHERE status != 'paused'
      AND (checked_at IS NULL OR (julianday('now') - julianday(checked_at))*1440 >= ?)`)
      .all(mins);
    for (const {id} of due) void checkMonitor(id);
  };
  sweep();
  ticker = setInterval(sweep, 60_000);
  ticker.unref?.();
}
