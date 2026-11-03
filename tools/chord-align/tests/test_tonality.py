from __future__ import annotations

import numpy as np

from chord_align.symbols import parse_symbol
from chord_align.tonality import (
    chord_costs,
    harmony_weight,
    intro_costs,
    rank_shifts,
    shifted,
    signed_shift,
    sounding_key,
    template,
    transpose_key,
)


def _chroma(symbols: list[str]) -> np.ndarray:
    return np.stack([template(parse_symbol(s)) for s in symbols], axis=1)


def test_finds_a_capo_shift() -> None:
    chart = [parse_symbol(s) for s in ["C", "Am", "F", "G"]]
    heard = _chroma(["D", "Bm", "G", "A"] * 4)
    ranked = rank_shifts(chart, [4, 4, 4, 4], heard, np.ones(16))
    assert ranked[0][0] == 2


def test_sounding_key() -> None:
    heard = _chroma(["D", "G", "A", "D", "Bm", "G", "A", "D"])
    key = sounding_key(heard, np.ones(8))
    assert (key.tonic, key.mode) == ("D", "major")
    minor = sounding_key(_chroma(["F#m", "Bm", "C#", "F#m", "D", "C#", "F#m"]), np.ones(7))
    assert (minor.tonic, minor.mode) == ("F#", "minor")


def test_costs_follow_the_template_and_loudness() -> None:
    chords = [parse_symbol(s) for s in ["C", "G", "N.C."]]
    heard = _chroma(["C", "C"])
    costs = chord_costs(chords, heard, np.array([1.0, 0.0]))
    assert costs[0, 0] < 0.01  # right chord, loud: as good as any chord
    assert costs[1, 0] > costs[0, 0]
    assert costs[2, 0] > 0.9  # N.C. while loud
    assert costs[2, 1] < 0.1  # N.C. while quiet
    assert costs[0, 1] > 0.99  # no chord can be heard in silence
    intro = intro_costs(chords, heard, np.array([1.0, 0.0]))
    assert costs[0, 0] < intro[0]  # a right chord beats leaving the beat unlabelled
    assert intro[1] < intro[0]  # silence is cheap to leave unlabelled


def test_a_loud_beat_no_chord_fits_counts_as_no_chord() -> None:
    chords = [parse_symbol(s) for s in ["C", "N.C."]]
    flat = np.full((12, 1), 1 / np.sqrt(12))  # noise: every pitch class alike
    costs = chord_costs(chords, flat, np.array([1.0]))
    assert costs[0, 0] > 0.9
    assert costs[1, 0] < 0.1
    assert harmony_weight(np.array([1.0]), np.array([0.5]))[0] == 0.0


def test_shifts_and_key_names() -> None:
    assert signed_shift(2) == 2
    assert signed_shift(9) == -3
    assert signed_shift(6) == 6
    assert transpose_key("C", "major", 2) == "D"
    assert transpose_key("A", "minor", 9) == "F#"
    assert transpose_key("Bb", "major", 1) == "B"
    assert shifted([parse_symbol("C")], 1)[0].root == 1
