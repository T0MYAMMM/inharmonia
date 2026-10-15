/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { BASE_PATH } from './config/site.ts';

const segmentsToKeep = BASE_PATH.split('/').filter(Boolean).length;

/**
 * GitHub Pages has no SPA rewrites. Its 404.html turns the requested path into
 * a query string and redirects to the app root; a small script in index.html
 * restores the original URL before React Router reads it.
 * (Approach from github.com/rafgraph/spa-github-pages, MIT.)
 */
function githubPagesSpaFallback(): Plugin {
  return {
    name: 'inharmonia:gh-pages-spa-fallback',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: '404.html',
        source: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Inharmonia</title>
    <script>
      (function (l) {
        var keep = ${segmentsToKeep};
        var parts = l.pathname.split('/');
        l.replace(
          l.protocol + '//' + l.hostname + (l.port ? ':' + l.port : '') +
          parts.slice(0, 1 + keep).join('/') + '/?/' +
          parts.slice(1 + keep).join('/').replace(/&/g, '~and~') +
          (l.search ? '&' + l.search.slice(1).replace(/&/g, '~and~') : '') +
          l.hash
        );
      })(window.location);
    </script>
  </head>
  <body></body>
</html>
`,
      });
    },
  };
}

export default defineConfig({
  base: BASE_PATH,
  plugins: [react(), githubPagesSpaFallback()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@config': fileURLToPath(new URL('./config', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 700,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
});
