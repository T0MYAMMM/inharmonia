/**
 * Check what Home costs: the entry script plus every module it preloads, as
 * dist/index.html lists them, gzipped. Fails above the budget, so a change
 * that drags a room, Tone or the file reader back into the entry is caught.
 * Run after `npm run build`.
 *
 *   npm run size
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { BASE_PATH } from '../config/site.ts';

/** kB (1000 bytes) gzipped, for `/`. */
const BUDGET_KB = 115;

const dist = join(import.meta.dirname, '../dist');
const html = readFileSync(join(dist, 'index.html'), 'utf8');

/** The entry module and its modulepreloads, as paths under dist/. */
function entryScripts(page: string): string[] {
  const urls: string[] = [];
  for (const [tag] of page.matchAll(/<(?:script|link)\b[^>]*>/g)) {
    const attr = (name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
    const src = attr('src');
    const href = attr('href');
    if (tag.startsWith('<script') && attr('type') === 'module' && src) urls.push(src);
    if (tag.startsWith('<link') && attr('rel') === 'modulepreload' && href) urls.push(href);
  }
  return urls.map((url) => {
    const path = url.startsWith(BASE_PATH) ? url.slice(BASE_PATH.length) : '';
    if (!/^assets\/[\w.-]+\.js$/.test(path))
      throw new Error(`Unexpected script in index.html: ${url}`);
    return path;
  });
}

const files = entryScripts(html);
if (files.length === 0)
  throw new Error('No entry script in dist/index.html: run npm run build first');

let total = 0;
for (const file of files) {
  const gz = gzipSync(readFileSync(join(dist, file))).length;
  total += gz;
  console.log(`${(gz / 1000).toFixed(1).padStart(7)} kB gz  ${file}`);
}
const kb = total / 1000;
console.log(`${kb.toFixed(1).padStart(7)} kB gz  for / (budget ${BUDGET_KB} kB)`);
if (kb > BUDGET_KB) {
  console.error(`/ is ${(kb - BUDGET_KB).toFixed(1)} kB gz over budget.`);
  process.exit(1);
}
