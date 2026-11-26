import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';

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
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
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
      requested = normalize(decodeURIComponent(url.pathname)).replaceAll('\\', '/').replace(/^(\.\.[/\\])+/, '');
    } catch {
      response.writeHead(400).end('Bad Request');
      return;
    }

    const relative = requested.replace(/^\/Memorie(?:\/|$)/, '/');
    let filePath = join(root, relative);
    if (filePath !== root && !filePath.startsWith(root + sep)) {
      response.writeHead(404).end('Not found');
      return;
    }
    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      if (extname(relative)) {
        response.writeHead(404).end('Not found');
        return;
      }
      filePath = join(root, 'index.html');
    }

    response.writeHead(200, {
      'Content-Type': mime[extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
    });
    createReadStream(filePath).on('error', () => response.destroy()).pipe(response);
  } catch {
    response.writeHead(500).end('Server Error');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Memorie preview running at http://127.0.0.1:${port}/`);
});
