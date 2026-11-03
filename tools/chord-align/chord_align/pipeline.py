"""The whole run: chart and samples in, new lengths, tempo and key out."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from . import features, tonality
from .align import Alignment, align
from .chart import LIMITS, Chart, Event, Section, bars_from_lengths, expand_form, write_chart, written_bars
from .lengths import SectionLengths, bar_phase, consensus, position_medians, unambiguous
from .symbols import ChordPCs, parse_symbol

log = logging.getLogger(__name__)

#: Sections below this share of confidently labelled beats keep their bars.
MIN_CONFIDENCE = 0.5
#: How close to the best match a chord may be and still count as the best.
TIE = 0.03
#: Shifts tried with a full alignment, best template fit first.
SHIFTS_TRIED = 3
#: Weight of the duration prior in the second pass, from the first pass's lengths.
SECOND_PASS_WEIGHT = 0.15


@dataclass
class SectionResult:
    """What happened to one section."""

    section_id: str
    label: str
    confidence: float
    mean_cost: float
    lengths: SectionLengths
    bars: list[str] | None = None
    skipped: str | None = None


@dataclass
class Result:
    """Everything the report and the output need."""

    chart: Chart
    events: list[Event]
    beats: features.BeatFeatures
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
    key: tuple[str, str] | None = None
    transpose: int | None = None
    notes: list[str] = field(default_factory=list)

    def labels(self) -> list[str | None]:
        """The chord symbol on each beat, None for intro and outro."""
        out: list[str | None] = [None] * self.beats.n
        for ev, s, e in zip(self.events, self.alignment.starts, self.alignment.ends, strict=True):
            for b in range(int(s), int(e)):
                out[b] = ev.symbol
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


def _grids(signal: features.Signal, prior: float, chart_beats: float) -> list[tuple[str, np.ndarray, float]]:
    """Beat grids to try: the tracked one, and half or double tempo if it looks an octave off."""
    tracked = features.track_beats(signal, prior)
    out = []
    for name, times in features.candidate_grids(tracked, signal.duration):
        if len(times) < 4:
            continue
        grid, tempo = features.regular_grid(times, signal.duration)
        if name != "tracked" and not 30 <= tempo <= 240:
            continue
        out.append((name, grid, tempo))
    music = len(tracked)
    ratio = music / max(chart_beats, 1.0)
    if 0.7 <= ratio <= 1.45:
        out = out[:1]
    return out


def _confidence(
    events: list[Event],
    vocab: list[ChordPCs],
    idx: np.ndarray,
    sims: np.ndarray,
    best: np.ndarray,
    weight: np.ndarray,
    al: Alignment,
) -> np.ndarray:
    """Per event: confident beats and judged beats.

    A beat with a clear chord is confident when its chord matches as well as the best of the
    chart's chords and common chords on every root (within ``TIE``); so a wrong
    chart, whose chords never fit, scores low. A beat with no chord to hear
    (``weight`` below one half) is confident under N.C. and not judged under a chord.
    """
    w = weight
    out = np.zeros((len(events), 2))
    for k, (s, e) in enumerate(zip(al.starts, al.ends, strict=True)):
        v = idx[k]
        for b in range(int(s), int(e)):
            loud = w[b] >= 0.5
            if vocab[v].is_no_chord:
                out[k] += (0.0 if loud else 1.0, 1.0)
            elif loud:
                out[k] += (1.0 if sims[v, b] >= best[b] - TIE else 0.0, 1.0)
    return out


def skip_reason(section: Section, bars: list[str], confidence: float, min_confidence: float) -> str | None:
    """Why a section keeps its bars, or None when its new bars are written."""
    if confidence < min_confidence:
        return f"low confidence ({confidence:.0%}); its bars are as they were"
    if len(bars) > LIMITS["bars_per_section"]:
        return f"would need {len(bars)} bars, over {LIMITS['bars_per_section']}"
    if section.has_lyrics and len(bars) != len(section.bars):
        return "it holds lyrics, and its number of bars would change"
    return None


def run(
    chart: Chart,
    y: np.ndarray,
    sr: int,
    *,
    set_key: bool = False,
    min_confidence: float = MIN_CONFIDENCE,
) -> Result:
    """Align the chart to the recording and work out lengths, tempo and key."""
    events = expand_form(chart)
    vocab, idx = _vocabulary(events)
    written = np.array([e.chart_beats for e in events])
    signal = features.analyse(y, sr)

    best: tuple[float, Any] | None = None
    for name, grid, tempo in _grids(signal, chart.tempo, float(written.sum())):
        feats = features.beat_features(signal, grid, tempo)
        if feats.n < len(events):
            continue
        ranked = tonality.rank_shifts([vocab[i] for i in idx], list(written), feats.chroma, feats.energy)
        for shift, _ in ranked[:SHIFTS_TRIED]:
            moved = tonality.shifted(vocab, shift)
            costs = tonality.chord_costs(moved, feats.chroma, feats.energy)
            intro = tonality.intro_costs(moved, feats.chroma, feats.energy)
            al = align(costs[idx], intro, written, chart.meter)
            span = max(int(al.ends[-1] - al.starts[0]), 1)
            score = float(al.chord_costs.sum()) / span + 0.3 * abs(np.log2(span / written.sum()))
            log.info("grid %s, shift %d: score %.3f", name, shift, score)
            if best is None or score < best[0]:
                best = (score, (name, feats, shift, ranked, al))
    if best is None:
        raise ValueError("the recording is too short for this chart")
    name, feats, shift, ranked, al = best[1]

    # Second pass: what the unambiguous occurrences of each section say becomes
    # a firmer prior, which settles runs whose edges cannot be heard.
    trusted = unambiguous(events)
    prior = np.maximum(position_medians(events, al.lengths.astype(float), trusted), 1.0)
    moved = tonality.shifted(vocab, shift)
    costs = tonality.chord_costs(moved, feats.chroma, feats.energy)
    intro = tonality.intro_costs(moved, feats.chroma, feats.energy)
    al = align(costs[idx], intro, prior, chart.meter, SECOND_PASS_WEIGHT)

    sims = tonality.similarities(moved, feats.chroma)
    best_sim = tonality.best_similarity(moved, feats.chroma)
    weight = tonality.harmony_weight(feats.energy, best_sim)
    conf = _confidence(events, vocab, idx, sims, best_sim, weight, al)
    phase = bar_phase(al.starts, chart.meter)
    per_section = consensus(events, al.lengths, al.starts, phase, chart.meter, trusted)

    sections: list[SectionResult] = []
    for section in chart.sections:
        if section.id not in per_section:
            continue
        mask = np.array([e.section_id == section.id for e in events])
        judged = conf[mask, 1].sum()
        confidence = float(conf[mask, 0].sum() / judged) if judged else 0.0
        beats = float(al.lengths[mask].sum())
        mean_cost = float(al.chord_costs[mask].sum() / beats) if beats else 1.0
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
            count = len(by_id[sid].bars) if by_id[sid].bars is not None else len(sec.bars)
            expanded += count * sec.repeat
    if expanded > LIMITS["expanded_bars"]:
        for s in sections:
            if s.bars is not None:
                s.bars = None
                s.skipped = f"the whole song would be {expanded} bars, over {LIMITS['expanded_bars']}"
    if chart.missing_form_ids:
        notes.append(f"{len(chart.missing_form_ids)} form entries name no section and were left out")

    sounding = tonality.sounding_key(feats.chroma, feats.energy)
    judged_all = conf[:, 1].sum()
    result = Result(
        chart=chart,
        events=events,
        beats=feats,
        grid=name,
        shift=shift,
        shift_scores=ranked,
        sounding=sounding,
        alignment=al,
        phase=phase,
        tempo=int(np.clip(round(feats.tempo), 30, 240)),
        sections=sections,
        unknown_symbols=sorted({c.symbol for c in vocab if c.fallback}),
        confidence=float(conf[:, 0].sum() / judged_all) if judged_all else 0.0,
        notes=notes,
    )
    if set_key:
        if shift == 0:
            result.key = (sounding.tonic, sounding.mode)
        else:
            result.transpose = tonality.signed_shift(shift)
    return result
