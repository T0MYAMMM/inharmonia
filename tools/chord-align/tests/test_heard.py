from __future__ import annotations

import numpy as np

from chord_align.heard import bar_pieces, fits, heard_bars, pooled, run_score, triads
from chord_align.symbols import parse_symbol
from chord_align.tonality import common_chords, template


def _chroma(symbols: list[str]) -> np.ndarray:
    return np.stack([template(parse_symbol(s)) for s in symbols], axis=1)


def test_pieces_are_cut_at_barlines_and_half_bars() -> None:
    pieces = bar_pieces(np.array([0, 3]), np.array([3, 9]), 0, 4)
    assert pieces == [(0, 0, 2), (0, 2, 3), (1, 3, 4), (1, 4, 6), (1, 6, 8), (1, 8, 9)]
    # With the bar starting on beat 1.
    assert bar_pieces(np.array([0]), np.array([5]), 1, 4)[:2] == [(0, 0, 1), (0, 1, 3)]


def test_a_seventh_in_the_playing_still_counts_in_full() -> None:
    vocab = [parse_symbol("C"), *common_chords()]
    vec, clear = pooled(_chroma(["Cmaj7", "Cmaj7"]), np.ones(2), 0, 2)
    assert clear == 1.0
    assert run_score(parse_symbol("C"), vocab, vec, clear) == 1.0
    assert run_score(parse_symbol("Cmaj7"), vocab, vec, clear) == 1.0
    vec, _ = pooled(_chroma(["C"]), np.ones(1), 0, 1)
    assert run_score(parse_symbol("Cadd9"), [parse_symbol("Cadd9"), *common_chords()], vec, 1.0) == 1.0
    # A different root has to earn its fit: Am7 holds C, but C is not Am7.
    vec, _ = pooled(_chroma(["Am"]), np.ones(1), 0, 1)
    assert run_score(parse_symbol("C"), [parse_symbol("C"), *common_chords()], vec, 1.0) < 0.5


def test_a_wrong_chord_counts_for_nothing() -> None:
    vocab = [parse_symbol("F#"), *common_chords()]
    vec, clear = pooled(_chroma(["C", "C"]), np.ones(2), 0, 2)
    assert run_score(parse_symbol("F#"), vocab, vec, clear) == 0.0


def test_no_chord_scores_by_how_quiet_it_is() -> None:
    nc = parse_symbol("N.C.")
    assert run_score(nc, [], np.zeros(12), 0.0) == 1.0
    assert run_score(nc, [], np.zeros(12), 1.0) == 0.0


def test_free_chords_per_bar_with_a_split_bar() -> None:
    chroma = _chroma(["C"] * 4 + ["Am", "Am", "F", "F"] + ["G"] * 4)
    bars = heard_bars(chroma, np.ones(12), 0, 4, 0)
    assert [b.chords for b in bars] == [("C",), ("Am", "F"), ("G",)]


def test_free_chords_are_named_in_the_chart_key() -> None:
    chroma = _chroma(["D"] * 4 + ["F#m"] * 4)  # the recording, two semitones up
    bars = heard_bars(chroma, np.ones(8), 0, 4, 2, ("C", "major"))
    assert [b.chords for b in bars] == [("C",), ("Em",)]
    sharp = heard_bars(_chroma(["C#m"] * 4), np.ones(4), 0, 4, 0, ("E", "major"))
    assert sharp[0].chords == ("C#m",)
    flat = heard_bars(_chroma(["Db"] * 4), np.ones(4), 0, 4, 0, ("Ab", "major"))
    assert flat[0].chords == ("Db",)


def test_quiet_bars_have_no_clear_chord() -> None:
    bars = heard_bars(_chroma(["C"] * 4), np.zeros(4), 0, 4, 0)
    assert bars[0].chords == ()


def test_fits() -> None:
    assert fits("C", "C")
    assert fits("C", "Cmaj7")
    assert fits("C", "Am7")
    assert not fits("Am", "C")
    assert not fits("C", "N.C.")
    assert len(triads()) == 24
