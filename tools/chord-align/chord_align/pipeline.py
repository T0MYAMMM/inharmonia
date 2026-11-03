"""The whole run: chart and samples in, new lengths, tempo and key out.

The chart's chords and their order are trusted; its lengths are not, unless asked
(``lengths_trusted``): they are mostly guesses from a sheet with no rhythm (one
chord a bar, or two at 2+2). So the beat level is chosen from the music alone:
each candidate grid (the tracked beat, double and half) is aligned with free
lengths, and the cheapest wins, with musical priors that know nothing of the
chart: a tempo from 60 to 160 bpm, chords lasting 2 to 8 beats, about a bar.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from . import features, heard, tonality
from .align import (
    Alignment,
    align,
    downbeat_costs,
    longest_run,
    musical_prior,
    occurrences,
    written_prior,
)
from .chart import LIMITS, Chart, Event, Section, bars_from_lengths, expand_form, write_chart, written_bars
from .lengths import SectionLengths, bar_phase, consensus, event_prior, position_medians, unambiguous
from .symbols import ChordPCs, parse_symbol

log = logging.getLogger(__name__)

#: Sections below this confidence keep their bars.
MIN_CONFIDENCE = 0.6
#: Shifts tried with a full alignment, best template fit first.
SHIFTS_TRIED = 3
#: Preferred tempo range, and how much each octave outside it costs.
TEMPO_RANGE = (60.0, 160.0)
TEMPO_WEIGHT = 0.5
#: Typical chord lengths in beats, and how much each octave outside costs.
RHYTHM_RANGE = (2.0, 8.0)
RHYTHM_WEIGHT = 0.1
#: The tracker's second, neutral starting tempo.
NEUTRAL_BPM = 100.0
#: Cost of moving off the tracker's own beat level: a finer grid always fits at
#: least as well, so it must win on more than that.
SWITCH_COST = 0.02
#: Weight of the chart's lengths when they are not trusted: only enough to break
#: exact ties, where two identical chords meet and their boundary cannot be heard.
TIE_WEIGHT = 0.005
#: Share of the clearly harmonic music the chart should label. An instrumental
#: intro and outro take a little; below this, confidence falls in proportion.
COVERAGE_OK = 0.8
#: How much better (in profile correlation) the best key must fit than the chart's
#: own key before ``--set-key`` writes it: a fifth away is often a near tie.
KEY_MARGIN = 0.1
#: With trusted lengths: cost per octave between the song's length and the chart's.
TRUSTED_SPAN_WEIGHT = 0.3


@dataclass
class SectionResult:
    """What happened to one section."""

    section_id: str
    label: str
    confidence: float
    mean_cost: float
    lengths: SectionLengths | None
    bars: list[str] | None = None
    skipped: str | None = None


@dataclass
class Result:
    """Everything the report and the output need."""

    chart: Chart
    events: list[Event]
    beats: features.BeatFeatures
    tracked_tempo: float
    grid: str
    shift: int
    shift_scores: list[tuple[int, float]]
    sounding: tonality.Key
    alignment: Alignment
    phase: int
    tempo: int
    sections: list[SectionResult]
    unknown_symbols: list[str]
    confidence: float
    heard: list[heard.HeardBar]
    #: Share of the clearly harmonic beats the chart's chords label.
    coverage: float = 1.0
    #: The sounding key fits clearly better than the chart's own (moved by ``shift``).
    key_clear: bool = False
    lengths_trusted: bool = False
    key: tuple[str, str] | None = None
    transpose: int | None = None
    notes: list[str] = field(default_factory=list)
    #: Section labels of playings the recording left out or played twice.
    left_out: list[str] = field(default_factory=list)
    played_twice: list[str] = field(default_factory=list)

    def labels(self) -> list[str | None]:
        """The chord symbol on each beat, None for intro and outro."""
        out: list[str | None] = [None] * self.beats.n
        al = self.alignment
        for i, s, e in zip(al.events, al.starts, al.ends, strict=True):
            for b in range(int(s), int(e)):
                out[b] = self.events[i].symbol
        return out

    def output(self) -> dict[str, Any]:
        """The file with the new bars, tempo and (if asked) key or view."""
        return write_chart(
            self.chart,
            section_bars={s.section_id: s.bars for s in self.sections if s.bars is not None},
            tempo=self.tempo,
            key=self.key,
            transpose=self.transpose,
        )


def _vocabulary(events: list[Event]) -> tuple[list[ChordPCs], np.ndarray]:
    """The distinct chords of the sequence, and each event's index into them."""
    symbols: list[str] = []
    index: dict[str, int] = {}
    for ev in events:
        if ev.symbol not in index:
            index[ev.symbol] = len(symbols)
            symbols.append(ev.symbol)
    return [parse_symbol(s) for s in symbols], np.array([index[e.symbol] for e in events])


def tempo_cost(bpm: float) -> float:
    """Nothing from 60 to 160 bpm; each octave outside costs ``TEMPO_WEIGHT``."""
    lo, hi = TEMPO_RANGE
    return TEMPO_WEIGHT * (max(0.0, np.log2(lo / bpm)) + max(0.0, np.log2(bpm / hi)))


def rhythm_cost(lengths: np.ndarray) -> float:
    """Nothing when the typical (median) chord lasts 2 to 8 beats; octaves outside cost."""
    if not len(lengths):
        return 0.0
    m = float(np.median(lengths))
    lo, hi = RHYTHM_RANGE
    return RHYTHM_WEIGHT * (max(0.0, np.log2(lo / m)) + max(0.0, np.log2(m / hi)))


def skip_reason(section: Section, bars: list[str], confidence: float, min_confidence: float) -> str | None:
    """Why a section keeps its bars, or None when its new bars are written."""
    if confidence < min_confidence:
        return f"low confidence ({confidence:.0%}); its bars are as they were"
    if len(bars) > LIMITS["bars_per_section"]:
        return f"would need {len(bars)} bars, over {LIMITS['bars_per_section']}"
    if section.has_lyrics and len(bars) != len(section.bars):
        return "it holds lyrics, and its number of bars would change"
    return None


@dataclass
class _Try:
    score: float
    tracked_bpm: float
    name: str
    scale: float
    feats: features.BeatFeatures
    shift: int
    ranked: list[tuple[int, float]]
    al: Alignment


def run(
    chart: Chart,
    y: np.ndarray,
    sr: int,
    *,
    set_key: bool = False,
    min_confidence: float = MIN_CONFIDENCE,
    lengths_trusted: bool = False,
) -> Result:
    """Align the chart to the recording and work out lengths, tempo and key."""
    events = expand_form(chart)
    vocab, idx = _vocabulary(events)
    written = np.array([e.chart_beats for e in events])
    occ_index: list[int] = []
    for k, e in enumerate(events):
        prev = events[k - 1] if k else None
        starts_new = prev is None or (prev.section_id, prev.occurrence) != (e.section_id, e.occurrence)
        occ_index.append((occ_index[-1] + 1 if occ_index else 0) if starts_new else occ_index[-1])
    occs = occurrences(occ_index)
    signal = features.analyse(y, sr)

    # Track twice: from the chart's tempo, and from a neutral one, since a chart's
    # tempo is a guess too and can pull the tracker to a wrong level (3:2, say).
    trackings: list[tuple[float, np.ndarray]] = []
    for start in (chart.tempo, NEUTRAL_BPM):
        beats = features.track_beats(signal, start)
        if len(beats) < 4:
            continue
        bpm = 60.0 / features.beat_period(beats)
        if all(abs(np.log2(bpm / other)) > 0.04 for other, _ in trackings):
            trackings.append((bpm, beats))
    candidates = [
        (bpm, name, times)
        for bpm, beats in trackings
        for name, times in features.candidate_grids(beats, signal.duration)
    ]
    best: _Try | None = None
    for tracked_bpm, name, times in candidates:
        if len(times) < 4:
            continue
        grid, tempo = features.regular_grid(times, signal.duration)
        if not 30 <= tempo <= 240:
            continue
        feats = features.beat_features(signal, grid, tempo)
        ranked = tonality.rank_shifts([vocab[i] for i in idx], [1.0] * len(idx), feats.chroma, feats.energy)
        max_run = longest_run(chart.meter) * (2 if name == "double" else 1)
        scale = 2.0 if name == "double" else 0.5 if name.startswith("half") else 1.0
        prior = (
            written_prior(written * scale, max_run)
            if lengths_trusted
            else musical_prior(len(events), max_run) + written_prior(written * scale, max_run, TIE_WEIGHT)
        )
        for shift, _ in ranked[:SHIFTS_TRIED]:
            moved = tonality.shifted(vocab, shift)
            costs = tonality.chord_costs(moved, feats.chroma, feats.energy, feats.bass)
            intro = tonality.intro_costs(moved, feats.chroma, feats.energy)
            try:
                al = align(costs[idx], intro, prior, occs)
            except ValueError:
                continue
            score = al.cost / feats.n + tempo_cost(tempo) + rhythm_cost(al.lengths)
            if name != "tracked":
                score += SWITCH_COST
            if lengths_trusted:
                span = max(int(al.ends[-1] - al.starts[0]), 1)
                score += TRUSTED_SPAN_WEIGHT * abs(np.log2(span / (written.sum() * scale)))
            log.info("grid %s (%.0f bpm), shift %d: score %.4f", name, tempo, shift, score)
            if best is None or score < best.score:
                best = _Try(score, tracked_bpm, name, scale, feats, shift, ranked, al)
    if best is None:
        raise ValueError("the recording is too short for this chart")
    feats, shift, al = best.feats, best.shift, best.al

    # Second pass: what the unambiguous playings of each section say becomes a
    # firmer prior for runs whose edges cannot be heard, and chord changes lean
    # towards the downbeat the first pass found.
    trusted = unambiguous(events, al)
    medians = position_medians(events, al, trusted)
    expected = event_prior(events, medians, float(chart.meter))
    max_run = longest_run(chart.meter) * (2 if best.name == "double" else 1)
    # Only runs whose edges could not be heard get the firm prior; elsewhere the
    # audio decides again, so a slip the first pass made everywhere is not locked in.
    unsure = np.zeros(len(events), dtype=bool)
    for k, i in enumerate(al.events):
        unsure[i] |= not trusted[k]
    prior = musical_prior(len(events), max_run) + np.where(
        unsure[:, None],
        written_prior(expected, max_run),
        written_prior(expected, max_run, TIE_WEIGHT),
    )
    if lengths_trusted:
        prior = prior + written_prior(written * best.scale, max_run)
    moved = tonality.shifted(vocab, shift)
    costs = tonality.chord_costs(moved, feats.chroma, feats.energy, feats.bass)
    intro = tonality.intro_costs(moved, feats.chroma, feats.energy)
    phase = bar_phase(al.starts, chart.meter)
    al = align(costs[idx], intro, prior, occs, start_cost=downbeat_costs(feats.n, phase, chart.meter))
    trusted = unambiguous(events, al)

    best_sim = tonality.best_similarity(moved, feats.chroma)
    weight = tonality.harmony_weight(feats.energy, best_sim)
    yardstick = moved + list(tonality.common_chords())
    phase = bar_phase(al.starts, chart.meter)
    # Confidence per run, judged in half bars: sums of score × weight, and of weight.
    scores = np.zeros(len(al.events))
    judged = np.zeros(len(al.events))
    for k, s, e in heard.bar_pieces(al.starts, al.ends, phase, chart.meter):
        vec, clear = heard.pooled(feats.chroma, weight, s, e)
        chord = moved[idx[al.events[k]]]
        w = (e - s) if chord.is_no_chord else (e - s) * clear
        if w > 0:
            scores[k] += heard.run_score(chord, yardstick, vec, clear) * w
            judged[k] += w
    # Music with clear chords that the chart leaves unlabelled counts against it.
    labelled = np.zeros(feats.n, dtype=bool)
    for s, e in zip(al.starts, al.ends, strict=True):
        labelled[int(s) : int(e)] = True
    coverage = float(weight[labelled].sum() / weight.sum()) if weight.sum() > 0 else 1.0
    covered = min(1.0, coverage / COVERAGE_OK)
    per_section = consensus(events, al, phase, chart.meter, trusted)

    sections: list[SectionResult] = []
    for section in chart.sections:
        if section.id not in chart.form or section.id in chart.missing_form_ids:
            continue
        mask = np.array([events[i].section_id == section.id for i in al.events], dtype=bool)
        if not mask.any():
            sections.append(
                SectionResult(section.id, section.label, 0.0, 1.0, None, skipped="not found in the recording")
            )
            continue
        total = judged[mask].sum()
        confidence = covered * (float(scores[mask].sum() / total) if total else 0.0)
        beats = float(al.lengths[mask].sum())
        mean_cost = float(al.run_costs[mask].sum() / beats) if beats else 1.0
        lengths = per_section[section.id]
        result = SectionResult(section.id, section.label, confidence, mean_cost, lengths)
        symbols = [c.symbol for c in section.merged()]
        bars = written_bars(bars_from_lengths(symbols, lengths.lengths, chart.meter), chart.meter)
        result.skipped = skip_reason(section, bars, confidence, min_confidence)
        if result.skipped is None:
            result.bars = bars
        sections.append(result)

    notes: list[str] = []
    expanded = 0
    by_id = {s.section_id: s for s in sections}
    for sid in chart.form:
        if sid in by_id:
            sec = chart.section(sid)
            bars_now = by_id[sid].bars
            expanded += (len(bars_now) if bars_now is not None else len(sec.bars)) * sec.repeat
    if expanded > LIMITS["expanded_bars"]:
        for s in sections:
            if s.bars is not None:
                s.bars = None
                s.skipped = f"the whole song would be {expanded} bars, over {LIMITS['expanded_bars']}"
    if chart.missing_form_ids:
        notes.append(f"{len(chart.missing_form_ids)} form entries name no section and were left out")

    def label_of(g: int) -> str:
        sec = chart.section(events[occs[g].first].section_id)
        return f"{sec.label} (time {events[occs[g].first].occurrence + 1})"

    profile = np.zeros(12)
    for i, s, e in zip(al.events, al.starts, al.ends, strict=True):
        if not moved[idx[i]].is_no_chord:
            profile += (e - s) * tonality.template(moved[idx[i]])
    keys = tonality.key_scores(feats.chroma, feats.energy, profile)
    sounding = keys[0]
    own = (tonality.transpose_key(chart.key_tonic, chart.key_mode, shift), chart.key_mode)
    own_score = next(k.score for k in keys if (k.tonic, k.mode) == own)
    key_clear = sounding.score - own_score >= KEY_MARGIN
    judged_all = judged.sum()
    result = Result(
        chart=chart,
        events=events,
        beats=feats,
        tracked_tempo=best.tracked_bpm,
        grid=best.name,
        shift=shift,
        shift_scores=best.ranked,
        sounding=sounding,
        alignment=al,
        phase=phase,
        tempo=int(np.clip(round(feats.tempo), 30, 240)),
        sections=sections,
        unknown_symbols=sorted({c.symbol for c in vocab if c.fallback}),
        confidence=covered * (float(scores.sum() / judged_all) if judged_all else 0.0),
        coverage=coverage,
        key_clear=key_clear,
        heard=heard.heard_bars(
            feats.chroma, weight, phase, chart.meter, shift, (chart.key_tonic, chart.key_mode)
        ),
        lengths_trusted=lengths_trusted,
        notes=notes,
        left_out=[label_of(g) for g in al.skipped],
        played_twice=[label_of(g) for g in al.repeated],
    )
    if set_key:
        if shift != 0:
            result.transpose = tonality.signed_shift(shift)
        elif key_clear:
            result.key = (sounding.tonic, sounding.mode)
    return result
