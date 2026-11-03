/**
 * Chord timing evaluation: reads every fixture sheet the way a paste does and
 * prints, per song and for each half of the set (tune: used to set the
 * constants; test: never used for that), for the estimate from the lyrics and
 * for one chord a bar:
 *   beats  beats with the right chord (a wrong bar count costs)
 *   bars   lines with the right number of bars
 *   shape  the right chord at the same place in the line, both stretched to the
 *          same length: scale-free, so a line read at double length scores here
 *   x2     lines read at twice or half the true number of bars
 * and the estimate again with each song at its best of Half, as estimated and
 * Double: what one click in the review gets back.
 * Run with `npm run eval:timing`. `-- --only tune` (or test) prints one half;
 * `-- --lines` each line's bars; `-- --write-vectors` rewrites
 * src/core/charts/timing.vectors.json after a deliberate change.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatBars } from '../src/core/charts/syntax';
import {
  barMatch,
  beatAccuracy,
  scoreAll,
  shapeAccuracy,
  timingVectors,
  type Tally,
} from '../src/core/charts/timing.eval';
import { TIMING_FIXTURES } from '../src/core/charts/timing.fixtures';

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const pct = (x: number) => `${(100 * x).toFixed(1)}%`.padStart(7);
const w = Math.max(...TIMING_FIXTURES.map((f) => f.id.length), 12);
const cols = (t: Tally) =>
  `${pct(beatAccuracy(t))}  ${pct(barMatch(t))}  ${pct(shapeAccuracy(t))}  ${String(t.doubled).padStart(3)}`;

for (const split of ['tune', 'test'] as const) {
  if (only && only !== split) continue;
  const fixtures = TIMING_FIXTURES.filter((f) => f.split === split);
  const { rows, estimated, baseline } = scoreAll(fixtures);
  console.log(
    `\n${split.toUpperCase()}${''.padEnd(w - split.length)}         estimated                        one chord a bar`,
  );
  console.log(
    `${'fixture'.padEnd(w)}  lines    beats     bars    shape   x2    beats     bars    shape   x2`,
  );
  for (const r of rows) {
    console.log(
      `${r.id.padEnd(w)}  ${String(r.estimated.lines).padStart(5)}  ${cols(r.estimated)}  ${cols(r.baseline)}`,
    );
    if (args.includes('--lines')) {
      const fixture = fixtures.find((f) => f.id === r.id)!;
      const bars = (b: Parameters<typeof formatBars>[0]) =>
        formatBars(b, fixture.beatsPerBar, Infinity);
      for (const l of r.lines)
        console.log(
          `  line ${l.n}  ${l.confidence ?? 'no lyric'}\n    true  ${bars(l.truth)}\n    est.  ${bars(l.estimated)}\n    one   ${bars(l.baseline)}`,
        );
    }
  }
  console.log(
    `${`${split} overall`.padEnd(w)}  ${String(estimated.lines).padStart(5)}  ${cols(estimated)}  ${cols(baseline)}`,
  );
  const best = scoreAll(fixtures, { bestScale: true }).estimated;
  console.log(
    `${'with Half or Double'.padEnd(w)}  ${String(best.lines).padStart(5)}  ${cols(best)}   (each song at its best of ½, 1, 2)`,
  );
}

if (args.includes('--write-vectors')) {
  const path = join(import.meta.dirname, '../src/core/charts/timing.vectors.json');
  const vectors = timingVectors(TIMING_FIXTURES);
  writeFileSync(path, `${JSON.stringify(vectors, null, 2)}\n`);
  console.log(`Wrote ${vectors.length} vectors to src/core/charts/timing.vectors.json`);
}
