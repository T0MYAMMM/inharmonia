/**
 * Transcription evaluation: runs every synthesized fixture through the voice
 * pipeline and prints onset F1, pitch accuracy, key accuracy and grid accuracy.
 * Run with `npm run eval:transcription` after tuning SEGMENT_CONFIG.
 */
import { scoreAll } from '../src/core/transcription/eval';
import { FIXTURE_SPECS } from '../src/core/transcription/fixtures';

const pct = (x: number, digits = 0) => `${(100 * x).toFixed(digits)}%`.padStart(5);
const rows = scoreAll(FIXTURE_SPECS);
const w = Math.max(...rows.map((r) => r.id.length));
console.log(`${'fixture'.padEnd(w)}  notes  found  onsetF1  pitch  onset±ms  key  top2  grid`);
for (const r of rows)
  console.log(
    `${r.id.padEnd(w)}  ${String(r.notes).padStart(5)}  ${String(r.detected).padStart(5)}  ${pct(r.f1).padStart(7)}  ${pct(r.pitchAccuracy)}  ${(Number.isNaN(r.meanOnsetMs) ? '–' : r.meanOnsetMs.toFixed(0)).padStart(8)}  ${r.keyCorrect ? ' ok' : ' no'}  ${r.keyTop2 ? '  ok' : '  no'}  ${pct(r.gridAccuracy)}`,
  );
const mean = (f: (r: (typeof rows)[number]) => number) =>
  rows.reduce((s, r) => s + f(r), 0) / rows.length;
console.log(
  `${'overall'.padEnd(w)}  ${String(rows.reduce((s, r) => s + r.notes, 0)).padStart(5)}  ${String(rows.reduce((s, r) => s + r.detected, 0)).padStart(5)}  ${pct(
    mean((r) => r.f1),
    1,
  ).padStart(7)}  ${pct(
    mean((r) => r.pitchAccuracy),
    1,
  )}  ${mean((r) => (Number.isNaN(r.meanOnsetMs) ? 0 : r.meanOnsetMs))
    .toFixed(0)
    .padStart(
      8,
    )}  ${pct(mean((r) => (r.keyCorrect ? 1 : 0)))} ${pct(mean((r) => (r.keyTop2 ? 1 : 0)))}  ${pct(
    mean((r) => r.gridAccuracy),
    1,
  )}`,
);
