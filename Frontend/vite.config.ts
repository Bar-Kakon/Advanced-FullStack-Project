import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The dev server port is pinned because it is half of a pair: the API's CORS allowlist names an
 * exact origin and can never be `*`, since the Refresh Token cookie travels with credentials. A
 * port that drifts is a request the API refuses.
 *
 * `screens/` is deliberately outside this build. Those prototypes are plain files that must keep
 * opening by double-click, and Vite only ever serves `index.html` and what `src/` imports.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
});
