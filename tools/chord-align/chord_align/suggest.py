"""Suggested chord changes: where the recording clearly and repeatedly plays another chord.

For every chord of a section, each playing of it is heard on its own: the
beats the alignment gave it, pooled, against a vocabulary wider than the
report's 24 triads (sevenths, major and minor sevenths, sus2, sus4 and power
chords too), with the bass counted as the alignment counts it. The simpler
chord is heard unless a richer one fits clearly better. A heard chord that
holds the chart's chord, or sits inside it, agrees with it (Cmaj7 or C5 with C,
C with Am7).

A change is suggested only when the same other chord is heard, by a margin,
in at least two playings and in most of the clear ones, or in the only
playing at high clarity. Suggestions are never applied unless asked
(``--apply-suggestions``).
"""

from __future__ import annotations

import copy
from dataclasses import asdict, dataclass
from functools import cache
from typing import TYPE_CHECKING, Any

import numpy as np

from .chart import Chart, replace_symbols, written_bars
from .heard import pooled
from .symbols import ChordPCs, parse_symbol
from .tonality import (
    BASS_WEIGHT,
    MAJOR_NAMES,
    bass_fit,
    best_similarity,
    chord_root_name,
    harmony_weight,
    pedal_beats,
    shifted,
    template,
)

if TYPE_CHECKING:
    from .pipeline import Result

#: Qualities heard besides major and minor triads; each must beat the best triad
#: by ``RICH_MARGIN`` to be heard instead of it.
RICH_QUALITIES = ("7", "maj7", "m7", "sus2", "sus4", "5")
RICH_MARGIN = 0.04
#: How much better the heard chord must fit than the chart's, in similarity.
MARGIN = 0.1
#: Clarity (0 to 1) a playing needs to be judged at all, and to stand alone.
CLEAR = 0.5
HIGH_CLEAR = 0.75
#: Beats a playing needs to be judged: a beat or two between changes is too little to hear.
MIN_BEATS = 2


@dataclass(frozen=True)
class Heard:
    """One chord as heard: its symbol in sounding pitch, pitch classes and simplicity rank."""

    root: int
    suffix: str
    chord: ChordPCs
    #: 0 for a major or minor triad, 1 for anything richer.
    rank: int


@cache
def vocabulary() -> tuple[Heard, ...]:
    """The 24 triads, then sevenths, sus and power chords, on every root."""
    out = []
    for rank, qualities in ((0, ("", "m")), (1, RICH_QUALITIES)):
        for pc, name in enumerate(MAJOR_NAMES):
            for q in qualities:
                out.append(Heard(pc, q, parse_symbol(name + q), rank))
    return tuple(out)


#: Qualities whose root a recording can't tell: Absus4 and Dbsus2 are the same notes.
_OPEN = ("sus2", "sus4", "5")


def agrees(heard: Heard, chart: ChordPCs) -> bool:
    """The heard chord holds the chart's chord or sits inside it: Cmaj7 or C5 with C, C with Am7.

    A sus or power chord agrees when it holds the chart's root and adds no more
    than a 2nd or a 4th to its notes: Absus4 (Ab Db Eb) is Db with an added 9th.
    """
    if heard.chord.pcs <= chart.pcs or chart.pcs <= heard.chord.pcs:
        return True
    if heard.suffix in _OPEN and chart.root is not None and chart.root in heard.chord.pcs:
        return heard.chord.pcs <= chart.pcs | {(chart.root + 2) % 12, (chart.root + 5) % 12}
    return False


@dataclass(frozen=True)
class Playing:
    """One playing of a chart chord, as heard."""

    heard: Heard
    #: How much better the heard chord fits than the chart's (0 when it is the chart's).
    margin: float
    clarity: float
    agrees: bool
    beats: int


@dataclass
class Suggestion:
    """A chord the recording plays instead of the chart's, with the evidence."""

    section_id: str
    section: str
    #: Index into ``Section.merged()``.
    position: int
    #: Bar of the section (1-based) where the chord starts, as written.
    bar: int
    chart: str
    suggested: str
    #: Times the section is played, and the playings that heard the suggested chord.
    playings: int
    heard_in: int
    #: Median margin over the chart's chord, and median clarity, of those playings.
    margin: float
    clarity: float
    applied: bool = False

    def as_json(self) -> dict[str, Any]:
        """The suggestion as plain JSON values."""
        out = asdict(self)
        out["margin"] = round(self.margin, 3)
        out["clarity"] = round(self.clarity, 3)
        return out


def _fit(chord: ChordPCs, vec: np.ndarray, bass: float | None) -> float:
    """Similarity of a pooled chroma to the chord, plus the bass term the alignment uses."""
    sim = float(template(chord) @ vec)
    return sim if bass is None else sim - BASS_WEIGHT * (1.0 - bass)


def hear(vec: np.ndarray, bass_vec: np.ndarray | None) -> tuple[Heard, float]:
    """The heard chord for a pooled chroma (and bass), with its fit; the simpler chord on a near tie."""
    best: dict[int, tuple[Heard, float]] = {}
    for h in vocabulary():
        b = None if bass_vec is None else float(bass_fit(h.chord, bass_vec[:, None])[0])
        f = _fit(h.chord, vec, b)
        if h.rank not in best or f > best[h.rank][1]:
            best[h.rank] = (h, f)
    simple, rich = best[0], best[1]
    return rich if rich[1] - simple[1] > RICH_MARGIN else simple


def _bass(bass: np.ndarray, heard_bass: np.ndarray, start: int, end: int) -> np.ndarray | None:
    """The mean bass over beats where it is heard (not a pedal), or None if it is never heard."""
    keep = heard_bass[start:end]
    if not keep.any():
        return None
    return bass[:, start:end][:, keep].mean(axis=1)


def playing(chart: ChordPCs, chroma: np.ndarray, weight: np.ndarray, bass: np.ndarray | None) -> Playing:
    """Hear one run's pooled chroma and bass against the chart's chord."""
    vec, clear = pooled(chroma, weight, 0, chroma.shape[1])
    h, fit = hear(vec, bass)
    b = None if bass is None else float(bass_fit(chart, bass[:, None])[0])
    clarity = float(clear * max(float(template(h.chord) @ vec), 0.0))
    ok = agrees(h, chart)
    margin = 0.0 if ok else max(fit - _fit(chart, vec, b), 0.0)
    return Playing(h, margin, clarity, ok, chroma.shape[1])


def name(h: Heard, shift: int, key: tuple[str, str]) -> str:
    """The heard chord named in the chart's key, the transposition taken out."""
    return chord_root_name((h.root - shift) % 12, key) + h.suffix


def decide(playings: list[Playing], times: int, beats_per_bar: int) -> tuple[Heard, list[Playing]] | None:
    """The suggested chord and the playings that heard it, or None when the chart's chord stands.

    ``playings`` are the judged playings of one chord; ``times`` is how often its
    section is played. Two or more playings must hear the same other chord, and
    be most of the clear ones; a section played once needs that playing to be
    clear, high in clarity, and at least a bar long.
    """
    judged = [p for p in playings if p.clarity >= CLEAR]
    against = [p for p in judged if not p.agrees and p.margin >= MARGIN]
    if not against:
        return None
    # A playing heard as C supports Am7 and the other way round: one holds the other.
    support_of = {
        h: [p for p in against if h.chord.pcs <= p.heard.chord.pcs or p.heard.chord.pcs <= h.chord.pcs]
        for h in {p.heard for p in against}
    }
    top = max(
        support_of,
        key=lambda h: (len(support_of[h]), float(np.median([p.margin for p in support_of[h]])), -h.rank),
    )
    support = support_of[top]
    n = len(support)
    if n >= 2 and n * 2 > len(judged):
        return top, support
    alone = support[0]
    if times == 1 and alone.clarity >= HIGH_CLEAR and alone.beats >= beats_per_bar:
        return top, support
    return None


def suggest(result: Result) -> list[Suggestion]:
    """Every suggested change for the chart, in section and chord order."""
    chart = result.chart
    feats = result.beats
    al = result.relaxed
    vocab = sorted({e.symbol for e in result.events})
    moved = dict(zip(vocab, shifted([parse_symbol(s) for s in vocab], result.shift), strict=True))
    weight = harmony_weight(feats.energy, best_similarity(list(moved.values()), feats.chroma))
    heard_bass = ~pedal_beats(feats.bass, feats.chroma)
    key = (chart.key_tonic, chart.key_mode)

    # Heard only where the main alignment found the song, so the capped search
    # cannot stretch the first and last chords over an unlabelled intro or outro.
    first, last = int(result.alignment.starts[0]), int(result.alignment.ends[-1])
    by_position: dict[tuple[str, int], list[Playing]] = {}
    for i, s0, e0 in zip(al.events, al.starts, al.ends, strict=True):
        ev = result.events[i]
        chord = moved[ev.symbol]
        runs = by_position.setdefault((ev.section_id, ev.position), [])
        s, e = max(int(s0), first), min(int(e0), last)
        if chord.is_no_chord or e - s < MIN_BEATS:
            continue
        runs.append(playing(chord, feats.chroma[:, s:e], weight[s:e], _bass(feats.bass, heard_bass, s, e)))

    out: list[Suggestion] = []
    for sec in result.sections:
        if sec.lengths is None:
            continue
        section = chart.section(sec.section_id)
        merged = section.merged()
        lengths = sec.lengths.lengths if sec.bars is not None else [int(c.beats) for c in merged]
        starts = np.concatenate([[0], np.cumsum(lengths)[:-1]])
        for pos, chord in enumerate(merged):
            times = len(sec.lengths.occurrences)
            found = decide(by_position.get((sec.section_id, pos), []), times, chart.meter)
            if found is None:
                continue
            h, support = found
            out.append(
                Suggestion(
                    section_id=sec.section_id,
                    section=sec.label,
                    position=pos,
                    bar=int(starts[pos]) // chart.meter + 1,
                    chart=chord.symbol,
                    suggested=name(h, result.shift, key),
                    playings=times,
                    heard_in=len(support),
                    margin=float(np.median([p.margin for p in support])),
                    clarity=float(np.median([p.clarity for p in support])),
                )
            )
    return out


def corrected(chart: Chart, suggestions: list[Suggestion]) -> dict[str, Any]:
    """A copy of the chart's file with the suggested chords written in, lengths as they were."""
    changes: dict[str, dict[int, str]] = {}
    for s in suggestions:
        changes.setdefault(s.section_id, {})[s.position] = s.suggested
    data = copy.deepcopy(chart.data)
    for raw in data["items"][chart.item_index]["chart"]["sections"]:
        if raw["id"] in changes:
            bars = replace_symbols(chart.section(raw["id"]).bars, changes[raw["id"]])
            raw["bars"] = written_bars(bars, chart.meter)
    return data


def suggestions_file(result: Result) -> dict[str, Any]:
    """The machine-readable ``.suggestions.json``: the chart and every suggestion."""
    item = result.chart.data["items"][result.chart.item_index]
    return {
        "chart": {"id": result.chart.item_id, "title": item.get("title")},
        "applied": any(s.applied for s in result.suggestions),
        "suggestions": [s.as_json() for s in result.suggestions],
    }
