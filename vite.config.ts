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
        name: 'inline-webview-bundle',
        enforce: 'post',
        generateBundle(_, bundle) {
          const htmlFile = bundle['index.html'];
          const jsKey = Object.keys(bundle).find(
            (k) => k.endsWith('.js') && bundle[k].type === 'chunk'
          );
          if (htmlFile && htmlFile.type === 'asset' && jsKey) {
            const jsChunk = bundle[jsKey];
            if (jsChunk.type === 'chunk') {
              const safeCode = jsChunk.code.replace(/<\/script>/gi, '<\\/script>');
              htmlFile.source = String(htmlFile.source).replace(
                /<script[^>]*src="[^"]*"[^>]*><\/script>/i,
                `<script>${safeCode}</script>`
              );
              delete bundle[jsKey];
            }
          }
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

