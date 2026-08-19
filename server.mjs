/* Atlas dev server — zero dependencies, Node 18+.
 *
 *   node server.mjs            -> http://localhost:5173
 *   node server.mjs 8080       -> http://localhost:8080
 *
 * Serving over http://localhost matters: browsers treat localhost as a secure
 * context, which is what the Notifications API and service worker require.
 * Opening index.html straight from disk (file://) disables both.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { explain, status as assistantStatus } from './assistant-route.mjs';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.argv[2] || process.env.PORT || 5173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';

    /* ---- assistant API ---- */
    if (rel === '/api/assistant/status') {
      const body = JSON.stringify(await assistantStatus());
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(body);
      return;
    }
    if (rel === '/api/assistant') {
      if (req.method !== 'POST') { res.writeHead(405).end('Method Not Allowed'); return; }
      await explain(req, res);
      return;
    }

    /* Refuse anything that tries to climb out of the project directory. */
    const filePath = join(ROOT, normalize(rel).replace(/^(\.\.[/\\])+/, ''));
    if (!filePath.startsWith(ROOT.replace(new RegExp(`\\${sep}$`), '') + sep) && filePath !== join(ROOT, 'index.html')) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    const info = await stat(filePath);
    if (info.isDirectory()) {
      res.writeHead(302, { Location: rel.replace(/\/?$/, '/') + 'index.html' }).end();
      return;
    }

    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': body.length,
      /* No caching in development, so edits show up on reload. */
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      /* Lets the service worker control the whole origin. */
      'Service-Worker-Allowed': '/'
    });
    res.end(body);
  } catch (err) {
    if (err.code === 'ENOENT') { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404 Not Found'); return; }
    console.error(err);
    res.writeHead(500, { 'Content-Type': 'text/plain' }).end('500 Internal Server Error');
  }
});

server.listen(PORT, () => {
  console.log(`\n  Atlas running at http://localhost:${PORT}\n  Press Ctrl+C to stop.\n`);
});
