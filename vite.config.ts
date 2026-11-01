/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { BASE_PATH } from './config/site.ts';
import { SAMPLE_CACHE, SAMPLE_DIR } from './src/core/audio/samples.ts';

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
  plugins: [
    react(),
    githubPagesSpaFallback(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registered from main.tsx, which also reports when the app is ready offline.
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Inharmonia',
        short_name: 'Inharmonia',
        description:
          'A calm practice room for piano harmony: chords, voicings, progressions, comping and fills.',
        lang: 'en',
        start_url: BASE_PATH,
        scope: BASE_PATH,
        display: 'standalone',
        background_color: '#E7ECEE',
        theme_color: '#E7ECEE',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Every room's code, the styles, fonts and icons, and the library's
        // index, so the app and its catalogue list work offline (the plugin
        // adds the manifest itself). Not the library's songs (downloads live in
        // IndexedDB) and not the piano samples: those are cached in one format
        // when the page is idle (app/sampleWarm.ts) and read cache-first.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}', 'library/index.json'],
        globIgnores: ['404.html'],
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
        navigateFallbackDenylist: [/\/404\.html$/],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: new RegExp(`/${SAMPLE_DIR}[^/]+\\.(?:ogg|mp3)$`),
            handler: 'CacheFirst',
            options: { cacheName: SAMPLE_CACHE },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@config': fileURLToPath(new URL('./config', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Tone.js loads only in rooms that play; a stable name lets tests and
          // the size budget find it.
          groups: [{ name: 'tone', test: /node_modules[\\/]tone[\\/]/ }],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
});
