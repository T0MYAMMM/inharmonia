import { useMemo, useState } from 'react';
import { MAJOR_KEYS, MINOR_KEYS } from '@/core/content/realize';
import {
  barOf,
  chartIssues,
  evenBeats,
  expandForm,
  formatBars,
  LIMITS,
  MAX_LABEL,
  NO_CHORD,
  normalizeChord,
  parseBars,
  SECTION_NAMES,
  sectionTypeOf,
  suggestKeys,
  type ChartBar,
  type ChartSection,
  type ChordChart,
  type SectionType,
} from '@/core/charts';
import { keyName, prettyAccidentals, prettyChord } from '@/core/notation';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { Segmented } from '@/ui/Segmented';
import { Select } from '@/ui/Select';
import { Slider } from '@/ui/Slider';
import { TextArea } from '@/ui/TextArea';
import { TextInput } from '@/ui/TextInput';
import { PasteSheet } from './PasteSheet';
import styles from './charts.module.css';

const KEYS = [
  ...MAJOR_KEYS.map((t) => ({ tonic: t, mode: 'major' as const })),
  ...MINOR_KEYS.map((t) => ({ tonic: t, mode: 'minor' as const })),
];
const keyId = (k: { tonic: string; mode: string }) => `${k.tonic} ${k.mode}`;
const NEW_LABELS = ['Intro', 'Verse', 'Pre-chorus', 'Chorus', 'Bridge', 'Outro'];

export interface ChartEditorProps {
  initial: ChordChart;
  saving: boolean;
  onSave: (chart: ChordChart) => void;
}

let ids = 0;
const newSectionId = () => `s${Date.now().toString(36)}${(++ids).toString(36)}`;

/** Grid editor for a chord chart: sections, bars, chords and beats, and the form. */
export function ChartEditor({ initial, saving, onSave }: ChartEditorProps) {
  const [chart, setChart] = useState<ChordChart>(initial);
  const [selected, setSelected] = useState<{ section: string; bar: number } | null>(null);
  const [textFor, setTextFor] = useState<string | null>(null);
  const [pasting, setPasting] = useState(initial.sections.length === 0);
  const bpb = chart.meter.beats;
  const issues = chartIssues(chart);
  const suggestions = useMemo(() => suggestKeys(chart.sections).slice(0, 2), [chart.sections]);
  const length = expandForm(chart).length;

  const patch = (p: Partial<ChordChart>) => setChart((c) => ({ ...c, ...p }));
  const patchSection = (id: string, p: Partial<ChartSection>) =>
    setChart((c) => ({
      ...c,
      sections: c.sections.map((s) => (s.id === id ? { ...s, ...p } : s)),
    }));
  const setBars = (id: string, f: (bars: ChartBar[]) => ChartBar[]) =>
    setChart((c) => ({
      ...c,
      sections: c.sections.map((s) => (s.id === id ? { ...s, bars: f(s.bars) } : s)),
    }));

  const addSection = (label: string) => {
    const id = newSectionId();
    setChart((c) => ({
      ...c,
      sections: [
        ...c.sections,
        { id, label, type: sectionTypeOf(label), repeat: 1, bars: [barOf(['C'], c.meter.beats)] },
      ],
      form: [...c.form, id],
    }));
    setSelected({ section: id, bar: 0 });
  };
  const removeSection = (id: string) =>
    setChart((c) => ({
      ...c,
      sections: c.sections.filter((s) => s.id !== id),
      form: c.form.filter((f) => f !== id),
    }));
  const moveSection = (id: string, dir: -1 | 1) =>
    setChart((c) => {
      const i = c.sections.findIndex((s) => s.id === id);
      const j = i + dir;
      if (j < 0 || j >= c.sections.length) return c;
      const sections = [...c.sections];
      [sections[i], sections[j]] = [sections[j]!, sections[i]!];
      return { ...c, sections };
    });

  return (
    <div className={styles.editor}>
      <section className={styles.card} aria-labelledby="chart-about">
        <h2 id="chart-about" className={styles.cardTitle}>
          The song
        </h2>
        <div className={styles.fields}>
          <Field label="Title">
            <TextInput
              value={chart.title}
              maxLength={LIMITS.title}
              onChange={(e) => patch({ title: e.target.value })}
              data-testid="chart-title"
            />
          </Field>
          <Field label="Key">
            <Select
              value={keyId(chart.key)}
              onChange={(e) => {
                const [tonic, mode] = e.target.value.split(' ') as [string, 'major' | 'minor'];
                patch({ key: { tonic, mode } });
              }}
              data-testid="chart-key"
            >
              {KEYS.map((k) => (
                <option key={keyId(k)} value={keyId(k)}>
                  {prettyAccidentals(keyName(k))}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Meter" group>
            <Segmented
              label="Meter"
              value={String(bpb) as '4' | '3'}
              options={[
                { value: '4', label: '4/4' },
                { value: '3', label: '3/4' },
              ]}
              onChange={(v) => {
                const beats = Number(v) as 3 | 4;
                // Bars keep their chords, split evenly in the new meter.
                setChart((c) => ({
                  ...c,
                  meter: { beats, unit: 4 },
                  sections: c.sections.map((s) => ({
                    ...s,
                    bars: s.bars.map((b) =>
                      barOf(
                        b.chords.map((x) => x.symbol),
                        beats,
                      ),
                    ),
                  })),
                }));
              }}
            />
          </Field>
          <div className={styles.slider}>
            <Slider
              label="Tempo"
              value={chart.tempo}
              min={40}
              max={200}
              onChange={(v) => patch({ tempo: v })}
              format={(v) => `${v} bpm`}
            />
          </div>
        </div>
        {chart.sections.length && suggestions[0] ? (
          <p className={styles.note} data-testid="key-suggestion">
            The chords suggest{' '}
            {suggestions.map((k, i) => (
              <span key={keyId(k)}>
                {i > 0 ? ' or ' : ''}
                <Button
                  size="small"
                  variant={keyId(k) === keyId(chart.key) ? 'secondary' : 'ghost'}
                  onClick={() => patch({ key: { tonic: k.tonic, mode: k.mode } })}
                  aria-pressed={keyId(k) === keyId(chart.key)}
                >
                  {prettyAccidentals(keyName(k))}
                </Button>
              </span>
            ))}
            .
          </p>
        ) : null}
        <Field label="Notes for yourself" className={styles.start}>
          <TextArea
            className={styles.notes}
            value={chart.notes}
            maxLength={LIMITS.notes}
            onChange={(e) => patch({ notes: e.target.value })}
            placeholder="Slow down in the bridge."
            data-testid="chart-notes"
          />
        </Field>
      </section>

      {pasting ? (
        <PasteSheet
          beatsPerBar={bpb}
          hasSections={chart.sections.length > 0}
          newId={newSectionId}
          onCancel={() => setPasting(false)}
          onUse={(parts, mode) => {
            setChart((c) => {
              const next =
                mode === 'replace'
                  ? { ...c, ...parts }
                  : {
                      ...c,
                      sections: [...c.sections, ...parts.sections],
                      form: [...c.form, ...parts.form],
                    };
              // A chart with no key yet takes the one its chords suggest.
              if (c.sections.length === 0 || mode === 'replace') {
                const best = suggestKeys(next.sections)[0];
                if (best) next.key = { tonic: best.tonic, mode: best.mode };
              }
              return next;
            });
            setPasting(false);
          }}
        />
      ) : (
        <div className={styles.row}>
          <Button onClick={() => setPasting(true)} data-testid="paste-open">
            Paste a chord sheet
          </Button>
        </div>
      )}

      {chart.sections.map((s, si) => (
        <section
          key={s.id}
          className={styles.card}
          aria-label={`Section ${s.label}`}
          data-testid={`section-${si}`}
        >
          <div className={styles.sectionHead}>
            <Field label="Section">
              <TextInput
                value={s.label}
                maxLength={MAX_LABEL}
                onChange={(e) => {
                  const label = e.target.value;
                  // The type follows the name until it is picked by hand.
                  const auto = sectionTypeOf(s.label) === s.type;
                  patchSection(s.id, { label, ...(auto ? { type: sectionTypeOf(label) } : {}) });
                }}
                data-testid={`section-label-${si}`}
              />
            </Field>
            <Field label="Kind">
              <Select
                value={s.type}
                onChange={(e) => patchSection(s.id, { type: e.target.value as SectionType })}
              >
                {(Object.keys(SECTION_NAMES) as SectionType[]).map((t) => (
                  <option key={t} value={t}>
                    {t === 'custom' ? 'Other' : SECTION_NAMES[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Repeat">
              <Select
                value={s.repeat}
                onChange={(e) => patchSection(s.id, { repeat: Number(e.target.value) })}
              >
                {Array.from({ length: LIMITS.repeat }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    ×{n}
                  </option>
                ))}
              </Select>
            </Field>
            <span className={styles.spacer} />
            <span className={styles.sectionTools}>
              <Button
                size="small"
                variant="ghost"
                onClick={() => moveSection(s.id, -1)}
                disabled={si === 0}
                aria-label={`Move ${s.label} up`}
              >
                ↑
              </Button>
              <Button
                size="small"
                variant="ghost"
                onClick={() => moveSection(s.id, 1)}
                disabled={si === chart.sections.length - 1}
                aria-label={`Move ${s.label} down`}
              >
                ↓
              </Button>
              <Button
                size="small"
                variant="ghost"
                onClick={() => removeSection(s.id)}
                aria-label={`Delete ${s.label}`}
              >
                Delete
              </Button>
            </span>
          </div>

          {textFor === s.id ? (
            <BarsText
              initial={formatBars(s.bars, bpb)}
              beatsPerBar={bpb}
              onApply={(bars) => {
                setBars(s.id, () => bars);
                setTextFor(null);
              }}
              onCancel={() => setTextFor(null)}
            />
          ) : (
            <>
              <ol className={styles.bars} aria-label={`Bars of ${s.label}`}>
                {s.bars.map((b, bi) => {
                  const bad = b.chords.some(
                    (c) => c.symbol !== NO_CHORD && !normalizeChord(c.symbol),
                  );
                  const isSel = selected?.section === s.id && selected.bar === bi;
                  return (
                    <li key={bi}>
                      <button
                        type="button"
                        className={styles.bar}
                        aria-pressed={isSel}
                        data-invalid={bad || undefined}
                        onClick={() => setSelected(isSel ? null : { section: s.id, bar: bi })}
                        data-testid={`bar-${si}-${bi}`}
                      >
                        <span className={styles.barNo}>{bi + 1}</span>
                        <span className={styles.barChords}>
                          {b.chords.map((c, ci) => (
                            <span key={ci} style={{ flexGrow: c.beats }}>
                              {c.symbol === NO_CHORD ? c.symbol : prettyChord(c.symbol)}
                            </span>
                          ))}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
              {selected?.section === s.id && s.bars[selected.bar] ? (
                <BarEditor
                  key={`${s.id}-${selected.bar}`}
                  bar={s.bars[selected.bar]!}
                  beatsPerBar={bpb}
                  canDelete={s.bars.length > 1}
                  onChange={(bar) =>
                    setBars(s.id, (bars) => bars.map((b, i) => (i === selected.bar ? bar : b)))
                  }
                  onInsert={() => {
                    setBars(s.id, (bars) => [
                      ...bars.slice(0, selected.bar + 1),
                      structuredClone(bars[selected.bar]!),
                      ...bars.slice(selected.bar + 1),
                    ]);
                    setSelected({ section: s.id, bar: selected.bar + 1 });
                  }}
                  onDelete={() => {
                    setBars(s.id, (bars) => bars.filter((_, i) => i !== selected.bar));
                    setSelected(null);
                  }}
                />
              ) : null}
              <div className={styles.row}>
                <Button
                  size="small"
                  onClick={() => {
                    setBars(s.id, (bars) => [
                      ...bars,
                      barOf([bars.at(-1)?.chords.at(-1)?.symbol ?? 'C'], bpb),
                    ]);
                    setSelected({ section: s.id, bar: s.bars.length });
                  }}
                  disabled={s.bars.length >= LIMITS.barsPerSection}
                  data-testid={`add-bar-${si}`}
                >
                  Add bar
                </Button>
                <Button
                  size="small"
                  variant="ghost"
                  onClick={() => setTextFor(s.id)}
                  data-testid={`edit-text-${si}`}
                >
                  Edit as text
                </Button>
              </div>
            </>
          )}
        </section>
      ))}

      <div className={styles.row}>
        <Field label="Add a section">
          <Select
            value=""
            onChange={(e) => e.target.value && addSection(e.target.value)}
            disabled={chart.sections.length >= LIMITS.sections}
            data-testid="add-section"
          >
            <option value="">Choose…</option>
            {NEW_LABELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <section className={styles.card} aria-labelledby="form-title">
        <h2 id="form-title" className={styles.cardTitle}>
          Form
        </h2>
        <p className={styles.note}>
          The order the sections are played in. A section can come back as often as it does in the
          song; you only enter its chords once. {length} bars in all.
        </p>
        <ol className={styles.form} data-testid="form">
          {chart.form.map((id, i) => {
            const s = chart.sections.find((x) => x.id === id);
            if (!s) return null;
            const move = (dir: -1 | 1) =>
              setChart((c) => {
                const form = [...c.form];
                const j = i + dir;
                if (j < 0 || j >= form.length) return c;
                [form[i], form[j]] = [form[j]!, form[i]!];
                return { ...c, form };
              });
            return (
              <li key={`${id}-${i}`} className={styles.formChip}>
                <span>
                  {s.label}
                  {s.repeat > 1 ? ` ×${s.repeat}` : ''}
                </span>
                <button
                  type="button"
                  onClick={() => move(-1)}
                  disabled={i === 0}
                  aria-label={`Move ${s.label} earlier`}
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => move(1)}
                  disabled={i === chart.form.length - 1}
                  aria-label={`Move ${s.label} later`}
                >
                  →
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setChart((c) => ({ ...c, form: c.form.filter((_, k) => k !== i) }))
                  }
                  aria-label={`Remove ${s.label} from the form`}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ol>
        {chart.sections.length ? (
          <Field label="Play next">
            <Select
              value=""
              onChange={(e) => e.target.value && patch({ form: [...chart.form, e.target.value] })}
              disabled={chart.form.length >= LIMITS.form}
              data-testid="form-add"
            >
              <option value="">Choose a section…</option>
              {chart.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </section>

      {issues.length && chart.sections.length ? (
        <ul className={styles.issues} aria-label="Before you can save" data-testid="chart-issues">
          {issues.slice(0, 8).map((i, k) => (
            <li key={k}>
              {i.section ? `${i.section}${i.bar ? `, bar ${i.bar}` : ''}: ` : ''}
              {i.message}
            </li>
          ))}
        </ul>
      ) : null}
      <div className={styles.row}>
        <Button
          variant="primary"
          onClick={() => onSave({ ...chart, title: chart.title.trim() || 'Untitled chart' })}
          disabled={saving || issues.length > 0}
          data-testid="chart-save"
        >
          {saving ? 'Saving…' : 'Save to My songs'}
        </Button>
        <span className={styles.note}>
          Kept in this browser on this device. Never uploaded or shared.
        </span>
      </div>
    </div>
  );
}

/** One bar: 1 to 4 chords, each with its length in beats. */
function BarEditor({
  bar,
  beatsPerBar,
  canDelete,
  onChange,
  onInsert,
  onDelete,
}: {
  bar: ChartBar;
  beatsPerBar: number;
  canDelete: boolean;
  onChange: (bar: ChartBar) => void;
  onInsert: () => void;
  onDelete: () => void;
}) {
  const [drafts, setDrafts] = useState(() => bar.chords.map((c) => c.symbol));
  const total = bar.chords.reduce((s, c) => s + c.beats, 0);
  const setCount = (n: number) => {
    const symbols = Array.from(
      { length: n },
      (_, i) => bar.chords[i]?.symbol ?? bar.chords.at(-1)!.symbol,
    );
    setDrafts(symbols);
    onChange(barOf(symbols, beatsPerBar));
  };
  return (
    <div className={styles.barEditor} role="group" aria-label="Edit bar" data-testid="bar-editor">
      <Field label="Chords in the bar">
        <Select value={bar.chords.length} onChange={(e) => setCount(Number(e.target.value))}>
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </Select>
      </Field>
      {bar.chords.map((c, i) => {
        const draft = drafts[i] ?? c.symbol;
        const ok = normalizeChord(draft) !== null;
        return (
          <div key={i} className={styles.slot}>
            <Field label={<>Chord {i + 1}</>}>
              <TextInput
                className={styles.chordInput}
                value={draft}
                aria-invalid={!ok}
                onChange={(e) => {
                  const v = e.target.value;
                  setDrafts((d) => d.map((x, k) => (k === i ? v : x)));
                  const sym = normalizeChord(v);
                  onChange({
                    chords: bar.chords.map((x, k) =>
                      k === i ? { ...x, symbol: sym ?? v.trim() } : x,
                    ),
                  });
                }}
                data-testid={`chord-input-${i}`}
              />
            </Field>
            <Field label="Beats">
              <Select
                value={c.beats}
                onChange={(e) =>
                  onChange({
                    chords: bar.chords.map((x, k) =>
                      k === i ? { ...x, beats: Number(e.target.value) } : x,
                    ),
                  })
                }
              >
                {[
                  ...new Set([
                    ...Array.from({ length: beatsPerBar }, (_, k) => k + 1),
                    ...evenBeats(bar.chords.length, beatsPerBar),
                  ]),
                ]
                  .sort((a, b) => a - b)
                  .map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
              </Select>
            </Field>
            <Button
              size="small"
              variant="ghost"
              onClick={() => {
                setDrafts((d) => d.map((x, k) => (k === i ? NO_CHORD : x)));
                onChange({
                  chords: bar.chords.map((x, k) => (k === i ? { ...x, symbol: NO_CHORD } : x)),
                });
              }}
            >
              N.C.
            </Button>
            {!ok ? <span className={styles.unknown}>Not a chord yet</span> : null}
          </div>
        );
      })}
      {total !== beatsPerBar ? (
        <p className={styles.unknown}>
          These last {total} beats; the bar has {beatsPerBar}.
        </p>
      ) : null}
      <div className={styles.row}>
        <Button size="small" onClick={onInsert}>
          Copy after
        </Button>
        <Button size="small" variant="ghost" onClick={onDelete} disabled={!canDelete}>
          Delete bar
        </Button>
      </div>
    </div>
  );
}

/** A section's bars as text in chart syntax, checked as you type. */
function BarsText({
  initial,
  beatsPerBar,
  onApply,
  onCancel,
}: {
  initial: string;
  beatsPerBar: number;
  onApply: (bars: ChartBar[]) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  const { bars, issues } = parseBars(text, beatsPerBar);
  return (
    <div className={styles.barsText}>
      <TextArea
        mono
        className={styles.paste}
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="Bars as text"
        data-testid="bars-text"
      />
      <p className={styles.note}>
        <code>| C | G/B | Am7 | F |</code> one chord a bar, <code>| C G |</code> two to a bar,{' '}
        <code>| C . . G |</code> dots add beats, <code>%</code> repeats the bar before,{' '}
        <code>N.C.</code> no chord, <code>x2</code> after a line plays it twice.
      </p>
      {issues.length ? (
        <ul className={styles.issues}>
          {issues.map((i, k) => (
            <li key={k}>
              Line {i.line}
              {i.bar ? `, bar ${i.bar}` : ''}: {i.message}
            </li>
          ))}
        </ul>
      ) : null}
      <div className={styles.row}>
        <Button
          size="small"
          variant="primary"
          onClick={() => onApply(bars)}
          disabled={bars.length === 0 || bars.length > LIMITS.barsPerSection}
          data-testid="bars-apply"
        >
          Use {bars.length} bar{bars.length === 1 ? '' : 's'}
        </Button>
        <Button size="small" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
