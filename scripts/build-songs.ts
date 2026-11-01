/**
 * Build the song library from what is in the repo:
 * - each src/content/songs/sources/*.piece becomes its Easy, Medium and
 *   Advanced versions: in src/content/songs/ for a built-in piece, in
 *   public/library/ for a catalogue piece;
 * - a composer's file in public/library/ is checked and written the app's way;
 * - an index of each folder lists its songs for the Songs page.
 * Prints the bars where Easy dropped notes, to check by ear.
 *
 *   npm run songs              write the files
 *   npm run songs -- --check   write nothing; fail if a file is out of date or breaks a rule
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { BUILT_IN_PIECES } from '../config/library';
import { PATTERNS } from '../src/content/patterns';
import { buildLibrary, BUILT_IN_DIR, CATALOGUE_DIR, INDEX_FILE } from '../src/core/library/build';

const root = join(import.meta.dirname, '..');
const check = process.argv.includes('--check');

const read = (dir: string, keep: (name: string) => boolean) =>
  Object.fromEntries(
    readdirSync(join(root, dir))
      .filter(keep)
      .map((name) => [name, readFileSync(join(root, dir, name), 'utf8')]),
  );

const { files, issues, generated } = buildLibrary({
  sources: read(`${BUILT_IN_DIR}/sources`, (n) => n.endsWith('.piece')),
  catalogue: read(CATALOGUE_DIR, (n) => n.endsWith('.json') && n !== INDEX_FILE),
  builtIns: BUILT_IN_PIECES,
  year: new Date().getFullYear(),
  ctx: { patterns: new Set(Object.keys(PATTERNS)), fallbackPattern: 'arpeggio-8ths' },
  sha256: (text) => createHash('sha256').update(text, 'utf8').digest('hex'),
  gzipBytes: (text) => gzipSync(text).length,
});

let failed = issues.length;
for (const issue of issues) console.error(issue);
for (const [path, text] of files) {
  const file = join(root, path);
  if (check) {
    if (!existsSync(file) || readFileSync(file, 'utf8') !== text) {
      console.error(`${path} is out of date: run npm run songs`);
      failed++;
    }
    continue;
  }
  writeFileSync(file, text);
}
if (!check)
  for (const { piece, easyShift, easyChanges } of generated) {
    console.log(
      `${piece}  (Easy ${easyShift ? `${easyShift > 0 ? '+' : ''}${easyShift} semitones` : 'in the written key'})`,
    );
    for (const c of easyChanges)
      console.log(`  Easy bar ${c.bar} [${c.section}]: ${c.before}  →  ${c.after}`);
  }
if (failed) process.exit(1);
console.log(check ? 'The song library is up to date.' : `Wrote ${files.size} files.`);
