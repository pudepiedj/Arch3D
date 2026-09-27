import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import { drawingsStore } from './server/drawings.ts';

/** The commit the app is built from, e.g. "cfb74f1, 26 Sep 2026", shown in the File menu. */
function version(): string {
  try {
    return execSync('git log -1 --format="%h, %cd" --date=format:"%d %b %Y %H:%M"', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

export default defineConfig({
  plugins: [drawingsStore()],
  define: { __APP_VERSION__: JSON.stringify(version()) },
  // Listen on the local network as well, so an iPad or phone on the same Wi-Fi can open
  // the app at the "Network:" address printed by `npm run dev`.
  // Always the same port: the browser keeps each site's work under its address, so if the
  // port moved (5174 when 5173 is taken) the drawing kept in the browser would seem to vanish.
  // If the port is busy, `npm run dev` stops with a message instead.
  server: { host: true, port: 5173, strictPort: true },
  preview: { host: true, port: 4173, strictPort: true },
});
