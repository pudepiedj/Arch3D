import { execSync } from 'node:child_process';
import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import { drawingsStore } from './server/drawings.ts';
import type { IncomingMessage } from 'node:http';
import { readFileSync } from 'node:fs';

/** The commit the app is built from, e.g. "cfb74f1, 26 Sep 2026", shown in the File menu. */
function version(): string {
  try {
    return execSync('git log -1 --format="%h, %cd" --date=format:"%d %b %Y %H:%M"', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

/** Names for the devices on the Wi-Fi, from devices.local.json (kept on this computer only). */
function deviceNames(): Record<string, string> {
  try {
    return JSON.parse(readFileSync('devices.local.json', 'utf8'));
  } catch (e) {
    // No file is fine (just no names); a mistake in it is worth a warning.
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') console.warn(`devices.local.json: ${(e as Error).message}`);
    return {};
  }
}

const now = () => new Date().toLocaleTimeString('en-GB'); // e.g. 14:05:32

// Strongly-typed custom plugin definition
const networkLoggerPlugin = (): Plugin => ({
  name: 'log-wifi-devices',
  configureServer(server: ViteDevServer) {
    server.ws.on('connection', (socket: any, req: IncomingMessage) => {
      const rawIp: string = req.socket.remoteAddress || 'Unknown IP';
      let cleanIp: string = rawIp.replace(/^::ffff:/, '');
      
      // The Mac itself, opened as localhost, arrives over loopback rather than its Wi-Fi address.
      const local = cleanIp === '::1' || cleanIp === '127.0.0.1';

      // Determine the readable label for the console output
      const deviceName: string = deviceNames()[local ? 'localhost' : cleanIp] || cleanIp;

      console.log(`\x1b[32m[Vite Network Log]\x1b[0m ${now()} Device connected: ${deviceName}`);
      
      socket.on('close', () => {
        console.log(`\x1b[31m[Vite Network Log]\x1b[0m ${now()} Device disconnected: ${deviceName}`);
      });
    });
  }
});

export default defineConfig({
  plugins: [
    drawingsStore(), 
    networkLoggerPlugin()
  ],
  define: { __APP_VERSION__: JSON.stringify(version()) },
    // Listen on the local network as well, so an iPad or phone on the same Wi-Fi can open
  // the app at the "Network:" address printed by `npm run dev`.
  // Always the same port: the browser keeps each site's work under its address, so if the
  // port moved (5174 when 5173 is taken) the drawing kept in the browser would seem to vanish.
  // If the port is busy, `npm run dev` stops with a message instead.
  server: { host: true, port: 5173, strictPort: true },
  preview: { host: true, port: 4173, strictPort: true },
});
