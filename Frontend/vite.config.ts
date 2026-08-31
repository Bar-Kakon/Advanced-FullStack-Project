import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The dev server port is pinned because it is half of a pair: the API's CORS allowlist names an
 * exact origin and can never be `*`, since the Refresh Token cookie travels with credentials. A
 * port that drifts is a request the API refuses.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
});
