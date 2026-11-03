"""What the recording itself seems to play, and how well the chart's chords fit it.

Two things, both read from beat chroma:

- **Confidence**: in each half bar, does the chart's chord explain its beats
  (pooled, so melody and passing tones average out) about as well as the best
  of the common chords? The same chord with a seventh or an added ninth counts
  in full, a small shortfall nearly so, and a large one for nothing.
- **Free chords per bar**: the best of the 24 major and minor triads for each bar,
  or for each half when the halves clearly differ, with no chart at all. Set
  beside the chart's chords, they show where a chart is wrong, as opposed to a
  recording that is hard to hear.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import cache

import numpy as np

from .symbols import ChordPCs, parse_symbol
from .tonality import MAJOR_NAMES, chord_root_name, similarities, template

#: A shortfall up to this much counts in full; from ``SHORT_NONE`` on, not at all.
SHORT_FULL = 0.04
SHORT_NONE = 0.15
#: A bar with less clear harmony than this is shown as "no clear chord".
CLEAR = 0.5
#: Gain in fit needed to hear a bar as two chords rather than one.
SPLIT_GAIN = 0.06


@cache
def triads() -> tuple[ChordPCs, ...]:
    """The 24 major and minor triads, named with the file's spellings."""
    return tuple(parse_symbol(f"{name}{q}") for name in MAJOR_NAMES for q in ("", "m"))


def pooled(chroma: np.ndarray, weight: np.ndarray, start: int, end: int) -> tuple[np.ndarray, float]:
    """The weighted mean chroma of beats ``start``–``end`` (unit length), and the mean weight."""
    w = weight[start:end]
    total = float(w.sum())
    if total <= 1e-9:
        return np.zeros(12), 0.0
    v = chroma[:, start:end] @ w / total
    norm = np.linalg.norm(v)
    return (v / norm if norm else v), total / max(end - start, 1)


#: Beats in one judged piece: enough to pool a melody's passing notes away, short
#: enough that a chord stretched over the wrong music cannot blend into it.
PIECE = 2


def bar_pieces(
    starts: np.ndarray, ends: np.ndarray, phase: int, beats_per_bar: int
) -> list[tuple[int, int, int]]:
    """Each run cut at barlines and every ``PIECE`` beats within a bar: (run, start, end).

    Confidence is judged piece by piece, so a run the alignment stretched over
    music its chord does not fit cannot hide in one long, mostly good average.
    """
    out: list[tuple[int, int, int]] = []
    for k, (s, e) in enumerate(zip(starts, ends, strict=True)):
        a = int(s)
        while a < int(e):
            into_bar = (a - phase) % beats_per_bar
            to_bar = beats_per_bar - into_bar
            to_piece = PIECE - into_bar % PIECE
            b = min(a + min(to_bar, to_piece), int(e))
            out.append((k, a, b))
            a = b
    return out


def run_score(chord: ChordPCs, vocabulary: list[ChordPCs], vec: np.ndarray, clear: float) -> float:
    """How well the chart's chord explains a pooled piece, 0 to 1.

    The chord is measured against the best of ``vocabulary``. When that best chord
    is the same chord with tones added or left out (C against Cmaj7, Cadd9 or C7,
    or the other way round), the chart's chord counts in full: that is how a
    chord sheet writes what is played.
    """
    if chord.is_no_chord:
        return 1.0 - clear
    if not vec.any():
        return 0.0
    sims = similarities(vocabulary, vec[:, None])[:, 0]
    best = vocabulary[int(np.argmax(sims))]
    if best.root == chord.root and (best.pcs <= chord.pcs or chord.pcs <= best.pcs):
        return 1.0
    shortfall = float(sims.max()) - float(template(chord) @ vec)
    return float(np.clip((SHORT_NONE - shortfall) / (SHORT_NONE - SHORT_FULL), 0.0, 1.0))


@dataclass(frozen=True)
class HeardBar:
    """One bar as heard: its first beat, the chords heard (empty if none is clear) and clarity."""

    start: int
    chords: tuple[str, ...]
    clarity: float


def _best_triad(vec: np.ndarray) -> tuple[ChordPCs, float]:
    sims = similarities(list(triads()), vec[:, None])[:, 0]
    i = int(np.argmax(sims))
    return triads()[i], float(sims[i])


def name_in_chart_key(chord: ChordPCs, shift: int, key: tuple[str, str] = ("C", "major")) -> str:
    """The triad's name moved down by ``shift``, spelt as the chart's key spells it."""
    assert chord.root is not None
    minor = (chord.root + 3) % 12 in chord.pcs
    return f"{chord_root_name(chord.root - shift, key)}{'m' if minor else ''}"


def heard_bars(
    chroma: np.ndarray,
    weight: np.ndarray,
    phase: int,
    beats_per_bar: int,
    shift: int,
    key: tuple[str, str] = ("C", "major"),
) -> list[HeardBar]:
    """Free chords for every bar of the grid, named in the chart's key."""
    out: list[HeardBar] = []
    n = chroma.shape[1]
    starts = list(range(phase - beats_per_bar if phase else 0, n, beats_per_bar))
    split = 2
    for s in starts:
        lo, hi = max(s, 0), min(s + beats_per_bar, n)
        if hi - lo < 1:
            continue
        vec, clear = pooled(chroma, weight, lo, hi)
        if clear < CLEAR:
            out.append(HeardBar(s, (), clear))
            continue
        whole, fit = _best_triad(vec)
        names = (name_in_chart_key(whole, shift, key),)
        if hi - lo == beats_per_bar:
            a, ca = pooled(chroma, weight, lo, lo + split)
            b, cb = pooled(chroma, weight, lo + split, hi)
            if min(ca, cb) >= CLEAR:
                ta, fa = _best_triad(a)
                tb, fb = _best_triad(b)
                if ta != tb and (fa * split + fb * (hi - lo - split)) / (hi - lo) - fit > SPLIT_GAIN:
                    names = (name_in_chart_key(ta, shift, key), name_in_chart_key(tb, shift, key))
        out.append(HeardBar(s, names, fit * clear))
    return out


def fits(heard: str, chart_symbol: str) -> bool:
    """True when a heard triad is part of the chart's chord: C in Cmaj7 or Am7, but not in Am."""
    triad = parse_symbol(heard)
    chord = parse_symbol(chart_symbol)
    if chord.is_no_chord:
        return False
    return triad.pcs <= chord.pcs
