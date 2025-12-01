import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [react()],
    define: {
      // SECURITY FIX: Only expose specific required variables to the client bundle.
      'process.env.API_KEY': JSON.stringify(env.API_KEY || process.env.API_KEY),
      'process.env.PEXELS_API_KEY': JSON.stringify(env.PEXELS_API_KEY || process.env.PEXELS_API_KEY),
      // Backend URL configuration
      'process.env.BACKEND_URL': JSON.stringify(env.BACKEND_URL || 'http://localhost:3001'),
      
      'process.env': JSON.stringify({})
    },
    server: {
      host: true,
    }
  };
});