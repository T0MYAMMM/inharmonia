from __future__ import annotations

import json
from pathlib import Path

import pytest

from chord_align.symbols import NO_CHORD, parse_symbol, pitch_class, transpose_pcs

VECTORS = json.loads((Path(__file__).parent / "vectors" / "chords.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", VECTORS["chords"], ids=lambda c: c["symbol"])
def test_shared_vectors(case: dict) -> None:
    chord = parse_symbol(case["symbol"])
    assert sorted(chord.pcs) == case["pcs"]
    assert chord.bass == case["bass"]
    assert not chord.fallback


@pytest.mark.parametrize("case", VECTORS["fallback"], ids=lambda c: c["symbol"])
def test_unknown_quality_falls_back_to_root_and_fifth(case: dict) -> None:
    chord = parse_symbol(case["symbol"])
    assert chord.fallback
    assert sorted(chord.pcs) == case["pcs"]
    assert len(chord.pcs) == 2


@pytest.mark.parametrize("text", VECTORS["noChord"])
def test_no_chord(text: str) -> None:
    chord = parse_symbol(text)
    assert chord.is_no_chord
    assert chord.symbol == NO_CHORD
    assert chord.pcs == frozenset()


def test_vocabulary_from_the_brief_is_covered() -> None:
    for suffix in [
        "",
        "m",
        "7",
        "maj7",
        "m7",
        "6",
        "m6",
        "9",
        "add9",
        "add11",
        "add4",
        "sus2",
        "sus4",
        "7sus2",
        "7sus4",
        "dim",
        "dim7",
        "aug",
        "m7b5",
    ]:
        assert not parse_symbol(f"D{suffix}").fallback, suffix


def test_slash_bass_outside_the_chord_is_added() -> None:
    chord = parse_symbol("F/G")
    assert chord.bass == 7
    assert chord.pcs == frozenset({5, 9, 0, 7})


def test_accidentals_and_unicode() -> None:
    assert pitch_class("F#") == 6
    assert pitch_class("Cb") == 11
    assert pitch_class("B#") == 0
    assert parse_symbol("B♭m").pcs == parse_symbol("Bbm").pcs


def test_not_a_chord_raises() -> None:
    with pytest.raises(ValueError):
        parse_symbol("Hello")


def test_transpose() -> None:
    d = transpose_pcs(parse_symbol("C/E"), 2)
    assert d.root == 2
    assert d.bass == 6
    assert d.pcs == parse_symbol("D/F#").pcs
    assert transpose_pcs(parse_symbol("N.C."), 5).is_no_chord
