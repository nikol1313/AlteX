'use strict';
// Minimal static server for trying the built PWA locally: node tools/serve.cjs dist [port]
// (localhost counts as a secure context, so the service worker and install prompt work).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

const serve = (dir, port = 8080) => {
  const root = path.resolve(dir);
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(root, p);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': p.endsWith('sw.js') ? 'no-cache' : 'max-age=0' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(port, () => ok(server)));
};
module.exports = serve;
if (require.main === module) {
  const [dir = 'dist', port = '8080'] = process.argv.slice(2);
  serve(dir, +port).then(() => console.log(`serving ${dir} at http://localhost:${port}/pwa/`));
}
