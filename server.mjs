import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = join(process.cwd(), 'dist');
const port = Number(process.env.PORT || 8788);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

createServer((request, response) => {
  try {
    let url;
    try {
      url = new URL(request.url || '/', `http://${request.headers.host}`);
    } catch {
      response.writeHead(400).end('Bad Request');
      return;
    }

    let requested;
    try {
      requested = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    } catch {
      response.writeHead(400).end('Bad Request');
      return;
    }

    let filePath = join(root, requested === '/' ? 'index.html' : requested);

    /* Built with base '/Memorie/' — strip it when serving from root */
    if (!existsSync(filePath) && (requested === '/Memorie' || requested.startsWith('/Memorie/'))) {
      const stripped = requested.replace(/^\/Memorie/, '') || '/';
      const tryPath = join(root, stripped === '/' ? 'index.html' : stripped);
      if (tryPath.startsWith(root) && existsSync(tryPath)) {
        filePath = tryPath;
      }
    }

    if (!filePath.startsWith(root) || !existsSync(filePath)) {
      filePath = join(root, 'index.html');
    }

    if (statSync(filePath).isDirectory()) {
      filePath = join(filePath, 'index.html');
    }

    response.writeHead(200, {
      'Content-Type': mime[extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(500).end('Server Error');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Memorie preview running at http://127.0.0.1:${port}/`);
});
