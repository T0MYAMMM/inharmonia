/**
 * Build the library: every src/content/songs/sources/*.piece becomes
 * src/content/songs/<piece>.json with its Easy, Medium and Advanced versions.
 * Prints the bars where Easy dropped notes, to check by ear.
 *
 *   npm run songs          write the JSON files
 *   npm run songs -- --check   fail if a JSON file is out of date
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { generatePiece, parsePiece, pieceFile } from '../src/core/library';

const dir = join(import.meta.dirname, '../src/content/songs');
const check = process.argv.includes('--check');
let stale = 0;
for (const name of readdirSync(join(dir, 'sources'))
  .filter((f) => f.endsWith('.piece'))
  .sort()) {
  const src = parsePiece(readFileSync(join(dir, 'sources', name), 'utf8'));
  const out = join(dir, `${src.meta.piece}.json`);
  const text = pieceFile(src);
  const { easyChanges, easyShift } = generatePiece(src);
  if (check) {
    if (!existsSync(out) || readFileSync(out, 'utf8') !== text) {
      console.error(`${out} is out of date: run npm run songs`);
      stale++;
    }
    continue;
  }
  writeFileSync(out, text);
  console.log(
    `${src.meta.piece}.json  (Easy ${easyShift ? `${easyShift > 0 ? '+' : ''}${easyShift} semitones` : 'in the written key'})`,
  );
  for (const c of easyChanges)
    console.log(`  Easy bar ${c.bar} [${c.section}]: ${c.before}  →  ${c.after}`);
}
if (stale) process.exit(1);
