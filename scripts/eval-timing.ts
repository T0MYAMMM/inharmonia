/**
 * Chord timing evaluation: reads every fixture sheet the way a paste does and
 * prints, per song and overall, beat accuracy (beats with the right chord) and
 * bar-count match (lines with the right number of bars), for the estimate from
 * the lyrics and for one chord a bar. Run with `npm run eval:timing`; add
 * `-- --lines` to see each line's bars, or `-- --write-vectors` to rewrite
 * src/core/charts/timing.vectors.json after a deliberate change.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatBars } from '../src/core/charts/syntax';
import {
  barMatch,
  beatAccuracy,
  scoreAll,
  timingVectors,
  type Tally,
} from '../src/core/charts/timing.eval';
import { TIMING_FIXTURES } from '../src/core/charts/timing.fixtures';

const args = new Set(process.argv.slice(2));
const pct = (x: number) => `${(100 * x).toFixed(1)}%`.padStart(7);
const { rows, estimated, baseline } = scoreAll(TIMING_FIXTURES);
const w = Math.max(7, ...rows.map((r) => r.id.length));
const cols = (t: Tally) => `${pct(beatAccuracy(t))}  ${pct(barMatch(t))}`;

console.log(`${''.padEnd(w)}         ${'estimated'.padEnd(16)}  one chord a bar`);
console.log(`${'fixture'.padEnd(w)}  lines    beats     bars    beats     bars`);
for (const r of rows) {
  console.log(
    `${r.id.padEnd(w)}  ${String(r.estimated.lines).padStart(5)}  ${cols(r.estimated)}  ${cols(r.baseline)}`,
  );
  if (args.has('--lines')) {
    const fixture = TIMING_FIXTURES.find((f) => f.id === r.id)!;
    const bars = (b: Parameters<typeof formatBars>[0]) =>
      formatBars(b, fixture.beatsPerBar, Infinity);
    for (const l of r.lines)
      console.log(
        `  line ${l.n}  ${l.confidence ?? 'no lyric'}\n    true  ${bars(l.truth)}\n    est.  ${bars(l.estimated)}\n    one   ${bars(l.baseline)}`,
      );
  }
}
console.log(
  `${'overall'.padEnd(w)}  ${String(estimated.lines).padStart(5)}  ${cols(estimated)}  ${cols(baseline)}`,
);

if (args.has('--write-vectors')) {
  const path = join(import.meta.dirname, '../src/core/charts/timing.vectors.json');
  const vectors = timingVectors(TIMING_FIXTURES);
  writeFileSync(path, `${JSON.stringify(vectors, null, 2)}\n`);
  console.log(`Wrote ${vectors.length} vectors to src/core/charts/timing.vectors.json`);
}
