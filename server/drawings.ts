// A tiny drawings store for the dev/preview server, so every device using the app (the
// computer running `npm run dev`, an iPad on the same Wi-Fi) can save to and open from one
// place. Saves never overwrite: each one is a new, timestamped file in ./drawings.

import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';

const DIR = resolve(process.cwd(), 'drawings');
const MAX_BYTES = 20 * 1024 * 1024;
const SAFE_FILE = /^[\w.-]+\.json$/;

export interface DrawingInfo {
  file: string;
  name: string;
  device: string;
  savedAt: string;
  bytes: number;
}

async function list(): Promise<DrawingInfo[]> {
  await mkdir(DIR, { recursive: true });
  const out: DrawingInfo[] = [];
  for (const file of await readdir(DIR)) {
    if (!SAFE_FILE.test(file)) continue;
    try {
      const text = await readFile(join(DIR, file), 'utf8');
      const data = JSON.parse(text);
      out.push({
        file,
        name: String(data.name ?? file),
        device: String(data.device ?? ''),
        savedAt: String(data.savedAt ?? (await stat(join(DIR, file))).mtime.toISOString()),
        bytes: Buffer.byteLength(text),
      });
    } catch {
      // Not one of ours, or damaged: leave it out of the list.
    }
  }
  return out.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((ok, fail) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BYTES) {
        fail(new Error('too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')));
    req.on('error', fail);
  });
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

/** A file name for a new save: date and time, plus a tidy version of its name. */
function newFileName(name: string, when: Date): string {
  const stamp = when.toISOString().replace(/[:T]/g, '-').replace(/\..+$/, '');
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'drawing';
  return `${stamp}_${slug}.json`;
}

async function handle(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const url = new URL(req.url ?? '/', 'http://local');
  if (!url.pathname.startsWith('/api/drawings')) return next();
  try {
    const file = decodeURIComponent(url.pathname.slice('/api/drawings'.length).replace(/^\//, ''));
    if (req.method === 'GET' && !file) return send(res, 200, await list());
    if (req.method === 'GET') {
      if (!SAFE_FILE.test(file)) return send(res, 400, { error: 'bad file name' });
      return send(res, 200, JSON.parse(await readFile(join(DIR, file), 'utf8')));
    }
    if (req.method === 'POST' && !file) {
      const data = JSON.parse(await readBody(req));
      if (!data || typeof data !== 'object' || !data.building) return send(res, 400, { error: 'no drawing' });
      await mkdir(DIR, { recursive: true });
      const when = new Date();
      const name = String(data.name ?? 'Drawing').slice(0, 80);
      let fileName = newFileName(name, when);
      // Never overwrite: two saves in the same second get distinct names.
      for (let n = 2; (await readdir(DIR)).includes(fileName); n++) fileName = fileName.replace(/(-\d+)?\.json$/, `-${n}.json`);
      const record = { name, device: String(data.device ?? ''), savedAt: when.toISOString(), building: data.building };
      await writeFile(join(DIR, fileName), JSON.stringify(record), { flag: 'wx' });
      return send(res, 201, { file: fileName, name, device: record.device, savedAt: record.savedAt });
    }
    send(res, 405, { error: 'not allowed' });
  } catch (err) {
    send(res, 500, { error: (err as Error).message });
  }
}

/** Vite plugin: serves /api/drawings from both `vite` (dev) and `vite preview`. */
export function drawingsStore(): Plugin {
  return {
    name: 'arch3d-drawings',
    configureServer(server) {
      server.middlewares.use((req, res, next) => void handle(req, res, next));
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => void handle(req, res, next));
    },
  };
}
