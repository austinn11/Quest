import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { publicConfig } from './shared/public-config';

export default defineConfig(({ command, mode }) => {
  if (command === 'build') publicConfig(loadEnv(mode, '.', 'VITE_'), true);
  return {
    plugins: [react()],
    // OAuth redirect URLs must keep the port registered in SpacetimeAuth.
    server: { port: 5173, strictPort: true },
  };
});
