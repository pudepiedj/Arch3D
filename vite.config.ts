import { defineConfig } from 'vite';
import { drawingsStore } from './server/drawings.ts';

export default defineConfig({
  plugins: [drawingsStore()],
  // Listen on the local network as well, so an iPad or phone on the same Wi-Fi can open
  // the app at the "Network:" address printed by `npm run dev`.
  server: { host: true },
  preview: { host: true },
});
