// Spike for brief 22 (2026-09-02): page-notes layer over untouched static mocks. Run: node server.js
// Demo: serves the Hearwell wireframes untouched, injects the annotation layer at serve time,
// and persists notes to notes.json beside this script. Nothing in the mock files is modified.
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.env.WIRE_ROOT || path.join(process.env.HOME, 'Projects/hearwell/design/wireframes');
const NOTES = path.join(__dirname, 'notes.json');
const PORT = +(process.env.PORT || 4173);
const load = () => fs.existsSync(NOTES) ? JSON.parse(fs.readFileSync(NOTES, 'utf8')) : [];
const save = (n) => fs.writeFileSync(NOTES, JSON.stringify(n, null, 2) + '\n');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const body = (req) => new Promise((res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => res(b ? JSON.parse(b) : {})); });
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const json = (o, code = 200) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (url.pathname === '/__notes/notes.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(fs.readFileSync(path.join(__dirname, 'notes.js'))); }
  if (url.pathname === '/__notes/list') return json(load().filter((n) => n.page === url.searchParams.get('page')));
  if (url.pathname === '/__notes/add' && req.method === 'POST') {
    const n = await body(req); const all = load();
    n.id = 'N' + String(all.length + 1).padStart(3, '0'); n.at = new Date().toISOString(); n.status = 'open';
    all.push(n); save(all); return json(n);
  }
  if (url.pathname === '/__notes/resolve' && req.method === 'POST') {
    const { id, by } = await body(req); const all = load(); const n = all.find((x) => x.id === id);
    if (n) { n.status = 'resolved'; n.resolvedBy = by || 'session'; n.resolvedAt = new Date().toISOString(); save(all); }
    return json(n || {}, n ? 200 : 404);
  }
  let p = decodeURIComponent(url.pathname); if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
  const ext = path.extname(file);
  let data = fs.readFileSync(file);
  if (ext === '.html') data = data.toString() + '\n<script src="/__notes/notes.js"></script>\n';
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(data);
}).listen(PORT, () => console.log(`notes demo on http://localhost:${PORT}  (remote: ssh -L ${PORT}:localhost:${PORT} <host>)`));
