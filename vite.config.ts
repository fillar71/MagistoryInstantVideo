
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [react()],
    define: {
      // SECURITY FIX: Only expose specific required variables to the client bundle.
      'process.env.API_KEY': JSON.stringify(env.API_KEY || process.env.API_KEY || ''),
      'process.env.PEXELS_API_KEY': JSON.stringify(env.PEXELS_API_KEY || process.env.PEXELS_API_KEY || 'np1dGKKGGlLeT7JjklA5l8mspt3LhwLGtHXEBgnskJKfVFnNVXuAODDu'),
      'process.env.PIXABAY_API_KEY': JSON.stringify(env.PIXABAY_API_KEY || process.env.PIXABAY_API_KEY || '53479357-80b3feb16fd61b8af448448fc'),
      
      // Backend Configuration - Split into API and Render services
      // Use empty string default to force fallback logic in app if needed, or specific localhost for dev
      'process.env.API_URL': JSON.stringify(env.API_URL || process.env.API_URL || 'http://localhost:3001'),
      'process.env.RENDER_URL': JSON.stringify(env.RENDER_URL || process.env.RENDER_URL || 'http://localhost:3002'),
      
      // Google Auth configuration:
      'process.env.GOOGLE_CLIENT_ID': JSON.stringify(env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || ''),
      
      'process.env': JSON.stringify({})
    },
    build: {
      // Increase warning limit to 1000kB to verify build passes without noise
      chunkSizeWarningLimit: 1000, 
      rollupOptions: {
        output: {
          // Manual chunking to split large vendor files
          manualChunks: {
            vendor: ['react', 'react-dom'],
            genai: ['@google/genai'], // Split GenAI SDK into its own file
            utils: ['axios', 'uuid', 'jwt-decode'] // Common utils
          }
        }
      }
    },
    server: {
      host: true,
    }
  };
});