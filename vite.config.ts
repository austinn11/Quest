import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // OAuth redirect URLs must keep the port registered in SpacetimeAuth.
  server: { port: 5173, strictPort: true },
});
