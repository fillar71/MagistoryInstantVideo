import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [react()],
    define: {
      // SECURITY FIX: Only expose specific required variables to the client bundle.
      // We default to '' to ensure the code doesn't crash with "undefined" during build replacement
      'process.env.API_KEY': JSON.stringify(env.API_KEY || process.env.API_KEY || ''),
      'process.env.PEXELS_API_KEY': JSON.stringify(env.PEXELS_API_KEY || process.env.PEXELS_API_KEY || ''),
      'process.env.PIXABAY_API_KEY': JSON.stringify(env.PIXABAY_API_KEY || process.env.PIXABAY_API_KEY || '53479357-80b3feb16fd61b8af448448fc'),
      // Backend URL configuration
      'process.env.BACKEND_URL': JSON.stringify(env.BACKEND_URL || 'http://localhost:3001'),
      
      // Fallback for other process.env accesses
      'process.env': JSON.stringify({})
    },
    server: {
      host: true,
    }
  };
});