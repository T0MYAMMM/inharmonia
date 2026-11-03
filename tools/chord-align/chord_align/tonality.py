"""Chord templates, beat costs, global transposition and the sounding key."""

from __future__ import annotations

from dataclasses import dataclass
from functools import cache

import numpy as np

from .symbols import ChordPCs, parse_symbol, transpose_pcs

#: Krumhansl–Kessler key profiles, tonic first.
KK_MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
KK_MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
MAJOR_NAMES = ("C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B")
MINOR_NAMES = ("C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B")

#: Loudness (1 = a loud beat) below which a beat counts as quiet.
QUIET = 0.12
#: Cost per beat of unlabelled audio (intro or outro): between a right and a wrong chord.
INTRO_LOUD = 0.3
INTRO_QUIET = 0.12

#: Common chords on every root: the yardstick each beat is measured against.
_COMMON = ("", "m", "7", "maj7", "m7", "sus2", "sus4", "dim", "aug")
_ROOTS = ("C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B")


@cache
def common_chords() -> tuple[ChordPCs, ...]:
    """Major, minor, sevenths, sus, dim and aug chords on all twelve roots."""
    return tuple(parse_symbol(r + q) for r in _ROOTS for q in _COMMON)


def template(chord: ChordPCs) -> np.ndarray:
    """A unit chroma vector for the chord; the root and the slash bass weigh more."""
    t = np.zeros(12)
    for p in chord.pcs:
        t[p] = 1.0
    if chord.root is not None:
        t[chord.root] += 0.25
    if chord.bass is not None:
        t[chord.bass] += 0.25
    norm = np.linalg.norm(t)
    return t / norm if norm else t


#: Best chord similarity below which a beat has no clear harmony (flat chroma scores about 0.57).
TONAL_LOW = 0.6
TONAL_HIGH = 0.8


def loudness_weight(energy: np.ndarray) -> np.ndarray:
    """0 for a silent beat, 1 for one loud enough to judge a chord."""
    return np.clip(energy / QUIET, 0.0, 1.0)


def harmony_weight(energy: np.ndarray, best: np.ndarray) -> np.ndarray:
    """0 for a beat with no chord to hear (quiet, or noise that no chord fits), 1 for a clear one."""
    tonal = np.clip((best - TONAL_LOW) / (TONAL_HIGH - TONAL_LOW), 0.0, 1.0)
    return loudness_weight(energy) * tonal


def best_similarity(chords: list[ChordPCs], chroma: np.ndarray) -> np.ndarray:
    """Per beat, the best similarity of any common chord or any of ``chords``."""
    return np.vstack([similarities(chords, chroma), similarities(list(common_chords()), chroma)]).max(axis=0)


def chord_costs(chords: list[ChordPCs], chroma: np.ndarray, energy: np.ndarray) -> np.ndarray:
    """Cost of each chord on each beat, (len(chords), beats), 0 = as good as any chord.

    A chord costs how far its similarity falls short of the best common chord on
    that beat. Measured that way, a noisy recording, where no chord matches well,
    does not make every chord look wrong next to the intro and outro costs. On a
    quiet beat no chord can be heard, so every chord costs 1. N.C. is the
    reverse: cheap when quiet, dear when loud. A loud beat that no chord fits
    (noise, a drum break) counts as quiet: N.C. means low energy or no template.
    """
    best = best_similarity(chords, chroma)
    w = harmony_weight(energy, best)
    out = np.empty((len(chords), chroma.shape[1]))
    for i, chord in enumerate(chords):
        if chord.is_no_chord:
            out[i] = 0.05 + 0.9 * w
        else:
            shortfall = np.maximum(best - template(chord) @ chroma, 0.0)
            out[i] = w * shortfall + (1.0 - w) * 1.0
    return out


def intro_costs(chords: list[ChordPCs], chroma: np.ndarray, energy: np.ndarray) -> np.ndarray:
    """Cost per beat of leaving it unlabelled, before the first chord or after the last."""
    w = harmony_weight(energy, best_similarity(chords, chroma))
    return INTRO_QUIET + (INTRO_LOUD - INTRO_QUIET) * w


def similarities(chords: list[ChordPCs], chroma: np.ndarray) -> np.ndarray:
    """Cosine similarity of each (sounding) chord with each beat; N.C. rows are 0."""
    out = np.zeros((len(chords), chroma.shape[1]))
    for i, chord in enumerate(chords):
        if not chord.is_no_chord:
            out[i] = template(chord) @ chroma
    return out


def rank_shifts(
    chords: list[ChordPCs], weights: list[float], chroma: np.ndarray, energy: np.ndarray
) -> list[tuple[int, float]]:
    """Every shift (0 to 11 semitones up), best first, scored by template fit.

    The chart's chords, weighted by their written length, make a pitch-class
    profile; each shift of it is correlated with the recording's loudness-weighted
    mean chroma.
    """
    profile = np.zeros(12)
    for chord, beats in zip(chords, weights, strict=True):
        if not chord.is_no_chord:
            profile += beats * template(chord)
    mean = chroma @ loudness_weight(energy)
    scores = [(k, _corr(mean, np.roll(profile, k))) for k in range(12)]
    return sorted(scores, key=lambda s: -s[1])


def shifted(chords: list[ChordPCs], shift: int) -> list[ChordPCs]:
    """The chords moved up ``shift`` semitones."""
    return [transpose_pcs(c, shift) for c in chords]


@dataclass(frozen=True)
class Key:
    """A key as the file writes it."""

    tonic: str
    mode: str
    score: float

    @property
    def name(self) -> str:
        """``"F# minor"``."""
        return f"{self.tonic} {self.mode}"


def key_name(pc: int, mode: str) -> str:
    """The tonic name the file accepts for this pitch class and mode."""
    return (MAJOR_NAMES if mode == "major" else MINOR_NAMES)[pc % 12]


def key_pc(tonic: str, mode: str) -> int:
    """The pitch class of a key's tonic as the file writes it."""
    return (MAJOR_NAMES if mode == "major" else MINOR_NAMES).index(tonic)


def sounding_key(chroma: np.ndarray, energy: np.ndarray) -> Key:
    """Krumhansl–Schmuckler: the key whose profile best fits the mean chroma."""
    mean = chroma @ loudness_weight(energy)
    best = Key("C", "major", -2.0)
    for pc in range(12):
        for mode, profile in (("major", KK_MAJOR), ("minor", KK_MINOR)):
            score = _corr(mean, np.roll(profile, pc))
            if score > best.score:
                best = Key(key_name(pc, mode), mode, score)
    return best


def transpose_key(tonic: str, mode: str, shift: int) -> str:
    """The tonic name of a key moved up ``shift`` semitones."""
    return key_name(key_pc(tonic, mode) + shift, mode)


def signed_shift(shift: int) -> int:
    """0..11 as -5..6, the smaller way round."""
    s = shift % 12
    return s - 12 if s > 6 else s


def _corr(a: np.ndarray, b: np.ndarray) -> float:
    a = a - a.mean()
    b = b - b.mean()
    denom = float(np.linalg.norm(a) * np.linalg.norm(b))
    return float(a @ b) / denom if denom else 0.0
