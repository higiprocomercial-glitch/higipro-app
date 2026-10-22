import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
      dedupe: ['react', 'react-dom'],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (
              id.includes('node_modules/react/') ||
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/scheduler/')
            ) {
              return 'vendor-react';
            }
            if (
              id.includes('node_modules/recharts') ||
              id.includes('node_modules/@reduxjs') ||
              id.includes('node_modules/react-redux') ||
              id.includes('node_modules/use-sync-external-store') ||
              id.includes('node_modules/react-is')
            ) {
              return 'vendor-recharts';
            }
            if (id.includes('node_modules/xlsx')) {
              return 'vendor-xlsx';
            }
            if (id.includes('node_modules/firebase') || id.includes('node_modules/@supabase')) {
              return 'vendor-cloud';
            }
            if (id.includes('node_modules/lucide-react')) {
              return 'vendor-icons';
            }
          },
        },
      },
      chunkSizeWarningLimit: 2000,
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      strictPort: true,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
