import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve('dist');
const base = '/Leafmark';
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  if (pathname !== base && !pathname.startsWith(`${base}/`)) {
    response.writeHead(404).end('Not found');
    return;
  }
  const relative = decodeURIComponent(pathname.slice(base.length)).replace(/^\/+/, '') || 'index.html';
  const target = path.resolve(root, relative);
  if (!target.startsWith(`${root}${path.sep}`) && target !== path.join(root, 'index.html')) {
    response.writeHead(400).end('Invalid path');
    return;
  }
  try {
    const file = await stat(target);
    const resolvedTarget = file.isDirectory() ? path.join(target, 'index.html') : target;
    response.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(resolvedTarget)] ?? 'application/octet-stream',
      'Service-Worker-Allowed': `${base}/`,
      'Cache-Control': resolvedTarget.endsWith('sw.js') ? 'no-cache' : 'public, max-age=0, must-revalidate',
    });
    createReadStream(resolvedTarget).pipe(response);
  } catch {
    response.writeHead(404).end('Not found');
  }
});

const port = Number(process.env.PORT ?? 4173);
server.listen(port, '127.0.0.1', () => console.log(`Serving ${root} at http://127.0.0.1:${port}${base}/`));

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
