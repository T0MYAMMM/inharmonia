"""Chord symbols as pitch classes.

Covers the chord vocabulary the app's charts read (``src/core/charts/symbols.ts``
and ``src/core/theory/chord.ts``). The shared vectors in
``tests/vectors/chords.json`` are checked here and, by a Vitest test, against the
app's own chord reading, so the two cannot drift apart.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

NO_CHORD = "N.C."

_LETTER = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
_ROOT = r"[A-Ga-g](?:##|bb|#|b)?"
_SYMBOL_RE = re.compile(rf"^({_ROOT})([^/]*)(?:/({_ROOT}))?$")

# Semitones above the root for each suffix the app reads. Aliases tonal accepts
# for the same chord share a row.
_QUALITIES: dict[tuple[str, ...], tuple[int, ...]] = {
    ("", "M", "maj", "major"): (0, 4, 7),
    ("m", "min", "-", "minor"): (0, 3, 7),
    ("7", "dom"): (0, 4, 7, 10),
    ("maj7", "M7", "Maj7", "^7"): (0, 4, 7, 11),
    ("m7", "min7", "-7"): (0, 3, 7, 10),
    ("6", "M6", "add6", "add13"): (0, 4, 7, 9),
    ("m6", "min6", "-6"): (0, 3, 7, 9),
    ("9",): (0, 4, 7, 10, 2),
    ("maj9", "M9"): (0, 4, 7, 11, 2),
    ("m9", "min9", "-9"): (0, 3, 7, 10, 2),
    ("add9", "Madd9", "2", "add2"): (0, 4, 7, 2),
    ("madd9", "m(add9)"): (0, 3, 7, 2),
    ("add11",): (0, 4, 7, 5),
    ("madd11",): (0, 3, 7, 5),
    ("add4",): (0, 4, 5, 7),
    ("madd4",): (0, 3, 5, 7),
    ("sus2",): (0, 2, 7),
    ("sus4", "sus"): (0, 5, 7),
    ("7sus2",): (0, 2, 7, 10),
    ("7sus4", "7sus"): (0, 5, 7, 10),
    ("dim", "°", "o"): (0, 3, 6),
    ("dim7", "°7", "o7"): (0, 3, 6, 9),
    ("aug", "+"): (0, 4, 8),
    ("m7b5", "ø", "h7", "-7b5"): (0, 3, 6, 10),
    ("mM7", "mMaj7", "m/ma7", "-M7"): (0, 3, 7, 11),
    ("69", "6add9"): (0, 4, 7, 9, 2),
    ("m69",): (0, 3, 7, 9, 2),
    ("7b5",): (0, 4, 6, 10),
    ("7#5", "aug7", "+7"): (0, 4, 8, 10),
    ("7b9",): (0, 4, 7, 10, 1),
    ("7#9",): (0, 4, 7, 10, 3),
    ("11",): (0, 7, 10, 2, 5),
    ("m11",): (0, 3, 7, 10, 2, 5),
    ("13",): (0, 4, 7, 10, 2, 9),
    ("5",): (0, 7),
}
_BY_SUFFIX = {alias: steps for names, steps in _QUALITIES.items() for alias in names}


@dataclass(frozen=True)
class ChordPCs:
    """A chord as pitch classes (0 = C), with its slash bass if any."""

    symbol: str
    root: int | None
    pcs: frozenset[int]
    bass: int | None
    #: True when the quality was not recognised and only root and fifth are used.
    fallback: bool = False

    @property
    def is_no_chord(self) -> bool:
        """N.C.: no template, scored by low energy instead."""
        return self.root is None


def pitch_class(name: str) -> int:
    """Pitch class of a note name such as ``"F#"``, ``"Bb"`` or ``"c##"``."""
    letter = name[0].upper()
    if letter not in _LETTER:
        raise ValueError(f"not a note name: {name!r}")
    shift = name[1:].count("#") - name[1:].count("b")
    return (_LETTER[letter] + shift) % 12


def is_no_chord(symbol: str) -> bool:
    """N.C., written the ways the app reads it."""
    return re.fullmatch(r"\(?n\.?\s?c\.?\)?", symbol.strip(), re.IGNORECASE) is not None


def parse_symbol(symbol: str) -> ChordPCs:
    """Read a chord symbol as pitch classes.

    An unknown quality falls back to root and fifth (``fallback=True``); a symbol
    with no recognisable root raises ``ValueError``.
    """
    text = symbol.strip().replace("♯", "#").replace("♭", "b")
    if is_no_chord(text):
        return ChordPCs(NO_CHORD, None, frozenset(), None)
    match = _SYMBOL_RE.match(text)
    if not match:
        raise ValueError(f"not a chord symbol: {symbol!r}")
    root = pitch_class(match.group(1))
    suffix = match.group(2).replace("(", "").replace(")", "")
    bass = pitch_class(match.group(3)) if match.group(3) else None
    steps = _BY_SUFFIX.get(suffix)
    fallback = steps is None
    if steps is None:
        steps = (0, 7)
    pcs = {(root + s) % 12 for s in steps}
    if bass is not None:
        pcs.add(bass)
    return ChordPCs(symbol, root, frozenset(pcs), bass, fallback)


def transpose_pcs(chord: ChordPCs, shift: int) -> ChordPCs:
    """The same chord moved up ``shift`` semitones."""
    if chord.is_no_chord:
        return chord
    return ChordPCs(
        chord.symbol,
        (chord.root + shift) % 12 if chord.root is not None else None,
        frozenset((p + shift) % 12 for p in chord.pcs),
        (chord.bass + shift) % 12 if chord.bass is not None else None,
        chord.fallback,
    )
