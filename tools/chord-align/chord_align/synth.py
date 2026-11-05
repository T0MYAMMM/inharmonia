"""Synthesised renders of known charts, for tests and ``chord-align eval``.

A render is a chart played by a small synthetic band. A clean render is chords
struck on every beat, a root in the bass, a kick on each beat and light noise. A
band render sounds more like a recording:

- strummed guitar, its notes spread over a few milliseconds, in a syncopated
  down-and-up pattern;
- a walking bass with approach notes;
- a melody with passing and neighbour tones over the chords;
- drums with syncopated kicks, a backbeat and hi-hats;
- tempo drift, a slowing at the end, reverb and noise.

A render may also play a form other than the chart's (a section more or less).
Nothing here is a recording.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
from scipy.signal import fftconvolve

from .chart import even_beats, parse_bar
from .symbols import ChordPCs, parse_symbol

SR = 22_050

_MAJOR_SCALE = (0, 2, 4, 5, 7, 9, 11)
_MINOR_SCALE = (0, 2, 3, 5, 7, 8, 10)
_TONICS = {"C": 0, "C#": 1, "Db": 1, "D": 2, "Eb": 3, "E": 4, "F": 5, "F#": 6, "G": 7}
_TONICS |= {"G#": 8, "Ab": 8, "A": 9, "Bb": 10, "B": 11}


@dataclass(frozen=True)
class SectionSpec:
    """A section: the bars as played (``truth``) and as a sheet guessed them (``guess``)."""

    id: str
    label: str
    type: str
    truth: tuple[str, ...]
    guess: tuple[str, ...]
    repeat: int = 1
    #: Band renders: how loud the band plays (below 0.8 the drums stop).
    level: float = 1.0
    #: Band renders: a bass note held under the whole section (a pedal).
    pedal: str | None = None


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
    #: The form the render plays, when it is not the chart's.
    played_form: tuple[str, ...] | None = None
    #: A band render (see the module docstring) instead of a clean one.
    band: bool = False
    #: Tempo drift, as a fraction either way (0.03 is ±3%).
    drift: float = 0.0
    #: Slow down over the last two bars.
    rubato: bool = False
    #: Reverb mix, 0 for none.
    reverb: float = 0.0
    #: Bars must come out exactly as played (clean renders, and the ×2 case).
    exact: bool = True
    #: A form change the tool must report: ("twice" or "left out", section label).
    form_change: tuple[str, str] | None = None
    #: Beats of the first chord played before the first bar (a pickup).
    pickup: int = 0
    #: Band renders: the guitar's last up-strum before a change already plays the next chord.
    push: bool = False

    @property
    def plays(self) -> tuple[str, ...]:
        """The section ids the render plays, in order."""
        return self.played_form or self.form


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
    """The true chords in the order the render plays them, as (symbol, whole beats)."""
    return [(sym, beats) for sym, beats, _ in _played(spec)]


def _played(spec: RenderSpec) -> list[tuple[str, int, SectionSpec | None]]:
    """(symbol, beats, section) in play order; a pickup comes first, in no section."""
    by_id = {s.id: s for s in spec.sections}
    out: list[tuple[str, int, SectionSpec | None]] = []
    for sid in spec.plays:
        s = by_id[sid]
        for _ in range(s.repeat):
            for i, text in enumerate(s.truth):
                for chord in parse_bar(text, spec.meter, f"{s.id}[{i}]"):
                    out.append((chord.symbol, int(chord.beats), s))
    if spec.pickup and out:
        out.insert(0, (out[0][0], spec.pickup, None))
    return out


@dataclass
class Render:
    """Samples and the truth: each beat's time and chord."""

    y: np.ndarray
    sr: int
    beat_times: np.ndarray
    labels: list[str]


def _midi_freq(m: float) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


def _add(y: np.ndarray, t: float, part: np.ndarray, sr: int) -> None:
    at = round(t * sr)
    if at >= len(y) or at < 0:
        return
    n = min(len(part), len(y) - at)
    y[at : at + n] += part[:n]


def _env(n: int, sr: int, decay: float, attack: float = 0.005) -> np.ndarray:
    t = np.arange(n) / sr
    env = np.exp(-t / decay) * np.minimum(1.0, t / attack)
    fade = min(n, int(0.015 * sr))
    if fade:
        env[-fade:] *= np.linspace(1.0, 0.0, fade)
    return env


def _tone(freq: float, n: int, sr: int, amp: float, decay: float = 0.9) -> np.ndarray:
    t = np.arange(n) / sr
    wave = sum(a * np.sin(2 * np.pi * freq * h * t) for h, a in ((1, 1.0), (2, 0.45), (3, 0.25), (4, 0.12)))
    return amp * _env(n, sr, decay) * wave


def _pluck(freq: float, n: int, sr: int, amp: float) -> np.ndarray:
    """A plucked string: bright at the attack, the upper partials dying first."""
    t = np.arange(n) / sr
    wave = np.zeros(n)
    for h in range(1, 8):
        if freq * h > sr / 2.2:
            break
        wave += np.sin(2 * np.pi * freq * h * t) * np.exp(-t * (1.2 + 0.9 * h)) / h
    return amp * wave * _env(n, sr, 2.0, 0.002)


def _lead(freq: float, n: int, sr: int, amp: float) -> np.ndarray:
    """A sung-like lead: a soft attack and a slight vibrato."""
    t = np.arange(n) / sr
    phase = 2 * np.pi * np.cumsum(freq * (1 + 0.004 * np.sin(2 * np.pi * 5.5 * t))) / sr
    wave = np.sin(phase) + 0.4 * np.sin(2 * phase) + 0.15 * np.sin(3 * phase)
    return amp * wave * _env(n, sr, 1.6, 0.03)


def _kick(n: int, sr: int, amp: float) -> np.ndarray:
    n = min(n, int(0.08 * sr))
    t = np.arange(n) / sr
    freq = 50 + 100 * np.exp(-t / 0.02)
    phase = 2 * np.pi * np.cumsum(freq) / sr
    return amp * np.sin(phase) * np.exp(-t / 0.03)


def _snare(sr: int, amp: float, rng: np.random.Generator) -> np.ndarray:
    n = int(0.18 * sr)
    t = np.arange(n) / sr
    noise = np.diff(rng.standard_normal(n + 1))
    body = np.sin(2 * np.pi * 185 * t) * np.exp(-t / 0.03)
    return amp * (0.6 * noise * np.exp(-t / 0.07) + 0.5 * body)


def _hat(sr: int, amp: float, rng: np.random.Generator) -> np.ndarray:
    n = int(0.04 * sr)
    t = np.arange(n) / sr
    noise = np.diff(np.diff(rng.standard_normal(n + 2)))
    return amp * noise * np.exp(-t / 0.012)


def beat_times(spec: RenderSpec, n_beats: int) -> np.ndarray:
    """When each beat starts, and when the last one ends (``n_beats + 1`` times)."""
    k = np.arange(n_beats)
    period = 60.0 / spec.tempo * (1.0 + spec.drift * np.sin(2 * np.pi * k / 48.0 + 0.7))
    if spec.rubato:
        tail = min(n_beats, 2 * spec.meter)
        period[-tail:] *= np.linspace(1.0, 1.25, tail)
    return spec.intro_seconds + np.concatenate([[0.0], np.cumsum(period)])


def _scale(spec: RenderSpec) -> set[int]:
    tonic = (_TONICS[spec.key[0]] + spec.transpose) % 12
    steps = _MAJOR_SCALE if spec.key[1] == "major" else _MINOR_SCALE
    return {(tonic + s) % 12 for s in steps}


def _guitar_voicing(chord: ChordPCs, shift: int) -> list[int]:
    """Six notes in guitar range: the bass note, then chord tones upward."""
    assert chord.root is not None
    pcs = sorted((p + shift) % 12 for p in chord.pcs)
    low = (chord.bass if chord.bass is not None else chord.root) + shift
    notes = [40 + (low - 4) % 12]
    for target in (50, 55, 59, 64, 67):
        options = [m for m in range(notes[-1] + 1, notes[-1] + 13) if m % 12 in pcs]
        notes.append(min(options, key=lambda m: abs(m - target)))
    return notes


def render(spec: RenderSpec, sr: int = SR) -> Render:
    """Play the true chart."""
    rng = np.random.default_rng(spec.seed)
    played = _played(spec)
    chords = [(sym, beats) for sym, beats, _ in played]
    section_of = [sec for _, beats, sec in played for _ in range(beats)]
    labels = [sym for sym, beats in chords for _ in range(beats)]
    times = beat_times(spec, len(labels))
    y = np.zeros(int((times[-1] + 2.0) * sr))
    pcs_of = {sym: parse_symbol(sym) for sym, _ in chords}
    runs: list[tuple[int, int, str]] = []  # first beat, beats, symbol
    k = 0
    for sym, beats in chords:
        runs.append((k, beats, sym))
        k += beats
    chord_at = [i for i, (_, beats, _) in enumerate(runs) for _ in range(beats)]

    def at(beat: float) -> float:
        """The time of a (fractional) beat, along the drifting grid."""
        i = min(int(beat), len(labels) - 1)
        return float(times[i] + (beat - i) * (times[i + 1] - times[i]))

    for b in range(len(labels)):
        period = float(times[b + 1] - times[b])
        n = round(period * sr)
        pos = (b - spec.pickup) % spec.meter
        chord = pcs_of[labels[b]]
        run_start = runs[chord_at[b]][0]
        if not spec.band:
            _add(y, times[b], _kick(n, sr, 0.6 if pos == 0 else 0.4), sr)
            if not chord.is_no_chord:
                amp = 0.22 if b == run_start else 0.15
                for p in sorted(chord.pcs):
                    _add(y, times[b], _tone(_midi_freq(60 + (p + spec.transpose) % 12), n, sr, amp), sr)
                low = chord.bass if chord.bass is not None else chord.root
                assert low is not None
                _add(y, times[b], _tone(_midi_freq(36 + (low + spec.transpose) % 12), n, sr, amp * 1.4), sr)
            continue
        _band_beat(y, spec, sr, rng, b, pos, n, chord, runs, chord_at, pcs_of, at, section_of[b])
    if spec.band:
        _melody(y, spec, sr, rng, labels, pcs_of, at)
    if spec.reverb:
        n = int(1.4 * sr)
        ir = rng.standard_normal(n) * np.exp(-np.arange(n) / sr / (1.1 / 6.9))
        ir /= np.sqrt(np.sum(ir**2))
        y = y + spec.reverb * fftconvolve(y, ir)[: len(y)]
    y += spec.noise * rng.standard_normal(len(y))
    y /= max(1.0, float(np.max(np.abs(y))) / 0.9)
    return Render(y.astype(np.float32), sr, times[:-1], labels)


def _band_beat(
    y: np.ndarray,
    spec: RenderSpec,
    sr: int,
    rng: np.random.Generator,
    b: int,
    pos: int,
    n: int,
    chord: ChordPCs,
    runs: list[tuple[int, int, str]],
    chord_at: list[int],
    pcs_of: dict[str, ChordPCs],
    at: Any,
    section: SectionSpec | None,
) -> None:
    """Drums, strummed guitar and walking bass for one beat."""
    level = section.level if section is not None else 1.0
    eighths = (0, 1)
    # Drums: hats on every eighth, a backbeat, kicks with an anticipation.
    for half in eighths:
        t = at(b + half / 2)
        _add(y, t, _hat(sr, 0.1 if half else 0.14, rng), sr)
        slot = 2 * pos + half
        kicks = (0, 3, 4) if spec.meter == 4 else (0,)
        snares = (2, 6) if spec.meter == 4 else (2, 4)
        if level < 0.8:
            continue  # a soft section: no drums
        if slot in kicks:
            _add(y, t, _kick(n, sr, 0.55), sr)
        if slot in snares:
            _add(y, t, _snare(sr, 0.3, rng), sr)
    if chord.is_no_chord:
        return
    run_start, run_len, _ = runs[chord_at[b]]
    nxt = chord_at[b] + 1
    last_beat = b == run_start + run_len - 1 and nxt < len(runs)
    # Guitar: D - D U - U D U in 4/4, D - D U D U in 3/4.
    pattern = (
        {0: "D", 2: "D", 3: "U", 5: "U", 6: "D", 7: "U"}
        if spec.meter == 4
        else {0: "D", 2: "D", 3: "U", 4: "D", 5: "U"}
    )
    voicing = _guitar_voicing(chord, spec.transpose)
    for half in eighths:
        stroke = pattern.get(2 * pos + half)
        if stroke is None:
            continue
        t0 = at(b + half / 2)
        dur = round(sr * (at(b + half / 2 + 1) - t0)) + int(0.03 * sr)
        notes = voicing if stroke == "D" else voicing[:1:-1][:4]
        if spec.push and half == 1 and last_beat and not pcs_of[runs[nxt][2]].is_no_chord:
            pushed = _guitar_voicing(pcs_of[runs[nxt][2]], spec.transpose)
            notes = pushed if stroke == "D" else pushed[:1:-1][:4]
        amp = (0.09 if stroke == "D" else 0.06) * level
        for j, m in enumerate(notes):
            _add(y, t0 + 0.011 * j, _pluck(_midi_freq(m), dur, sr, amp), sr)
    # Walking bass: root, then third or fifth, and an approach into the next chord.
    j = b - run_start
    root = (chord.bass if chord.bass is not None and j == 0 else chord.root) or 0
    pcs = sorted(chord.pcs)
    third = (
        next((p for p in pcs if (p - chord.root) % 12 in (3, 4)), root) if chord.root is not None else root
    )
    fifth = (
        next((p for p in pcs if (p - chord.root) % 12 in (6, 7, 8)), root) if chord.root is not None else root
    )
    # (next_root comes from the run after this one, as nxt above)
    next_root = None
    if nxt < len(runs):
        nc = pcs_of[runs[nxt][2]]
        next_root = nc.root
    if j == 0:
        pc = root
    elif j == run_len - 1 and next_root is not None and run_len > 1:
        pc = (next_root + (1 if rng.random() < 0.5 else -1)) % 12
    else:
        pc = fifth if j % 2 else third
    if section is not None and section.pedal is not None:
        pc = parse_symbol(section.pedal).root or 0
    m = 33 + (pc + spec.transpose - 9) % 12
    _add(y, at(b), _tone(_midi_freq(m), n, sr, 0.32 * level, decay=0.5), sr)


def _melody(
    y: np.ndarray,
    spec: RenderSpec,
    sr: int,
    rng: np.random.Generator,
    labels: list[str],
    pcs_of: dict[str, ChordPCs],
    at: Any,
) -> None:
    """A lead line: chord tones on the beat, scale steps (often outside the chord) between."""
    scale = _scale(spec)
    note = 72
    for b, sym in enumerate(labels):
        chord = pcs_of[sym]
        bar = b // spec.meter
        if chord.is_no_chord or bar % 8 == 7:
            continue  # rests: N.C., and a breath every eighth bar
        tones = sorted({(p + spec.transpose) % 12 for p in chord.pcs})
        options = [m for m in range(66, 84) if m % 12 in tones]
        note = min(options, key=lambda m: abs(m - note) + rng.random() * 4)
        t0, t1, t2 = at(b), at(b + 0.5), at(b + 1)
        if rng.random() < 0.3:
            _add(y, t0, _lead(_midi_freq(note), round((t2 - t0) * sr), sr, 0.2), sr)
            continue
        _add(y, t0, _lead(_midi_freq(note), round((t1 - t0) * sr), sr, 0.2), sr)
        step = 1 if rng.random() < 0.5 else -1
        passing = note + step
        while passing % 12 not in scale:
            passing += step
        _add(y, t1, _lead(_midi_freq(passing), round((t2 - t1) * sr), sr, 0.18), sr)


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
