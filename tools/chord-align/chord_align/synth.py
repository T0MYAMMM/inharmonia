"""Synthesised renders of known charts, for tests and ``chord-align eval``.

A render is a chart played by an additive synth: a triad (or the chord's tones)
around middle C and a bass note, struck on every beat, a kick on each beat, and
light noise. Nothing here is a recording.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np

from .chart import even_beats, parse_bar
from .symbols import parse_symbol

SR = 22_050


@dataclass(frozen=True)
class SectionSpec:
    """A section: the bars as played (``truth``) and as a sheet guessed them (``guess``)."""

    id: str
    label: str
    type: str
    truth: tuple[str, ...]
    guess: tuple[str, ...]
    repeat: int = 1


@dataclass(frozen=True)
class RenderSpec:
    """A known chart and how to play it."""

    name: str
    tempo: float
    meter: int
    sections: tuple[SectionSpec, ...]
    form: tuple[str, ...]
    key: tuple[str, str] = ("C", "major")
    #: Semitones the render sounds above the chart (a capo, or a chart in the wrong key).
    transpose: int = 0
    intro_seconds: float = 0.0
    #: The tempo the guessed chart says.
    chart_tempo: float | None = None
    noise: float = 0.003
    seed: int = 1
    #: Wrong on purpose: the chart's chords do not match the render.
    mismatched: bool = False
    expected_shift: int | None = field(default=None)


def chart_file(spec: RenderSpec, which: str = "guess") -> dict[str, Any]:
    """An Inharmonia file holding the chart, with the guessed or the true bars."""
    return {
        "format": "inharmonia",
        "version": 3,
        "exportedAt": "2026-01-01T00:00:00.000Z",
        "items": [
            {
                "kind": "chart",
                "id": spec.name,
                "title": spec.name.replace("-", " ").capitalize(),
                "source": {"kind": "user"},
                "chart": {
                    "key": {"tonic": spec.key[0], "mode": spec.key[1]},
                    "tempo": spec.chart_tempo or spec.tempo,
                    "meter": {"beats": spec.meter, "unit": 4},
                    "sections": [
                        {
                            "id": s.id,
                            "label": s.label,
                            "type": s.type,
                            "repeat": s.repeat,
                            "bars": list(s.truth if which == "truth" else s.guess),
                        }
                        for s in spec.sections
                    ],
                    "form": list(spec.form),
                    "notes": "Keep the second chorus soft.",
                },
                "view": {
                    "transpose": 0,
                    "simplify": "original",
                    "style": "triad-root",
                    "showFunction": False,
                    "showLyrics": True,
                },
            }
        ],
    }


def played_chords(spec: RenderSpec) -> list[tuple[str, int]]:
    """The true chords in play order, as (symbol, whole beats)."""
    by_id = {s.id: s for s in spec.sections}
    out: list[tuple[str, int]] = []
    for sid in spec.form:
        s = by_id[sid]
        for _ in range(s.repeat):
            for i, text in enumerate(s.truth):
                for chord in parse_bar(text, spec.meter, f"{s.id}[{i}]"):
                    out.append((chord.symbol, int(chord.beats)))
    return out


@dataclass
class Render:
    """Samples and the truth: each beat's time and chord."""

    y: np.ndarray
    sr: int
    beat_times: np.ndarray
    labels: list[str]


def _tone(freq: float, n: int, sr: int, amp: float) -> np.ndarray:
    t = np.arange(n) / sr
    env = np.exp(-t / 0.9) * np.minimum(1.0, t / 0.005)
    fade = min(n, int(0.015 * sr))
    if fade:
        env[-fade:] *= np.linspace(1.0, 0.0, fade)
    wave = sum(a * np.sin(2 * np.pi * freq * h * t) for h, a in ((1, 1.0), (2, 0.45), (3, 0.25), (4, 0.12)))
    return amp * env * wave


def _kick(n: int, sr: int, amp: float) -> np.ndarray:
    n = min(n, int(0.08 * sr))
    t = np.arange(n) / sr
    freq = 50 + 100 * np.exp(-t / 0.02)
    phase = 2 * np.pi * np.cumsum(freq) / sr
    return amp * np.sin(phase) * np.exp(-t / 0.03)


def _midi_freq(m: int) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


def render(spec: RenderSpec, sr: int = SR) -> Render:
    """Play the true chart."""
    period = 60.0 / spec.tempo
    chords = played_chords(spec)
    labels = [sym for sym, beats in chords for _ in range(beats)]
    n_beats = len(labels)
    start = spec.intro_seconds
    total = start + n_beats * period + 1.5
    y = np.zeros(int(total * sr) + 1)
    beat_times = start + np.arange(n_beats) * period
    seg = round(period * sr)
    k = 0
    for sym, beats in chords:
        pcs = parse_symbol(sym)
        for b in range(beats):
            at = round(float(beat_times[k]) * sr)
            downbeat = k % spec.meter == 0
            kick = _kick(seg, sr, 0.6 if downbeat else 0.4)
            y[at : at + len(kick)] += kick
            if not pcs.is_no_chord:
                amp = 0.22 if b == 0 else 0.15
                for p in sorted(pcs.pcs):
                    m = 60 + (p + spec.transpose) % 12
                    part = _tone(_midi_freq(m), seg, sr, amp)
                    y[at : at + len(part)] += part[: len(y) - at]
                bass = pcs.bass if pcs.bass is not None else pcs.root
                assert bass is not None
                m = 36 + (bass + spec.transpose) % 12
                part = _tone(_midi_freq(m), seg, sr, amp * 1.4)
                y[at : at + len(part)] += part[: len(y) - at]
            k += 1
    rng = np.random.default_rng(spec.seed)
    y += spec.noise * rng.standard_normal(len(y))
    y /= max(1.0, float(np.max(np.abs(y))) / 0.9)
    return Render(y.astype(np.float32), sr, beat_times, labels)


def guess_bars(truth: tuple[str, ...], meter: int) -> tuple[str, ...]:
    """What a sheet with no rhythm gives: the same chords, one bar each, split evenly."""
    out: list[str] = []
    for i, text in enumerate(truth):
        symbols = [c.symbol for c in parse_bar(text, meter, f"[{i}]")]
        # Drop chords repeated from the bar before: a sheet writes a chord once.
        if out and len(symbols) == 1 and out[-1].split()[-1] == symbols[0]:
            continue
        out.append(" ".join(symbols))
    assert all(len(b.split()) <= len(even_beats(4, meter)) for b in out)
    return tuple(out)
