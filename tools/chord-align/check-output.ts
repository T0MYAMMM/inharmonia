/**
 * Proves a chord-align output imports: runs the app's own reader (`parseFile`)
 * on each file and fails on any error. Every chart in it is read in full, so
 * bars, lengths, tempo and key are held to the app's rules, not this tool's.
 *
 *     npx tsx --tsconfig tsconfig.app.json tools/chord-align/check-output.ts out.json [...]
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { PATTERNS } from '../../src/content/patterns';
import { describeError, parseFile } from '../../src/core/format';

const CONTEXT = { patterns: new Set(Object.keys(PATTERNS)), fallbackPattern: 'arpeggio-8ths' };

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: check-output.ts <file.json> [...]');
  process.exit(2);
}

let failed = false;
for (const file of files) {
  const name = basename(file);
  const parsed = parseFile(readFileSync(file, 'utf8'), CONTEXT);
  if ('fatal' in parsed) {
    console.error(`${name}: ${parsed.fatal}`);
    failed = true;
    continue;
  }
  if (parsed.errors.length) {
    for (const e of parsed.errors) console.error(`${name}: ${describeError(e)}`);
    failed = true;
    continue;
  }
  const charts = parsed.items.filter((i) => i.kind === 'chart').length;
  if (charts === 0) {
    console.error(`${name}: holds no chart`);
    failed = true;
    continue;
  }
  console.log(`${name}: imports (${charts} chart${charts === 1 ? '' : 's'})`);
}
process.exit(failed ? 1 : 0);
