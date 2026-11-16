import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'classic-webview-bundle',
        enforce: 'post',
        transformIndexHtml(html) {
          return html
            .replace(/ crossorigin/g, '')
            .replace(/type="module"/g, 'defer');
        },
      },
    ],
    build: {
      target: 'es2015',
      cssTarget: 'chrome61',
      rollupOptions: {
        output: {
          format: 'iife',
          inlineDynamicImports: true,
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

