// Spike for the atlas index-navigation item (2026-09-07): a table-of-contents drawer and
// note <-> mock navigation, prototyped before /spec:plan. Run: node server.js
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = __dirname;
const PORT = +(process.env.PORT || 4180);
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' };
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/' || p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(fs.readFileSync(file));
}).listen(PORT, '127.0.0.1', () => console.log(`atlas nav prototype on http://localhost:${PORT}/index.html`));
