"""Beats and beat-synchronous chroma.

Beats come from librosa's tracker, the chart tempo only its starting guess (a
log-normal prior an octave wide); the octave is settled later, from the music.
Chroma is a constant-Q chromagram of the harmonic part (HPSS), taken as the
median between beats, in two bands: from C3 up, where the chord is (a walking
bass's passing notes stay out of it), and C1 to B2, for the bass note alone. The
beat grid is extended at both ends with the mean beat length, so a quiet intro
or outro is still covered by beats.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import librosa
import numpy as np

log = logging.getLogger(__name__)

HOP = 512


@dataclass
class Signal:
    """What the analysis needs from the audio, computed once."""

    sr: int
    duration: float
    onset_env: np.ndarray
    chroma: np.ndarray
    bass: np.ndarray
    rms: np.ndarray


@dataclass
class BeatFeatures:
    """Features on one beat grid."""

    #: Beat start times in seconds; beat ``i`` lasts until ``times[i + 1]`` (or the end).
    times: np.ndarray
    tempo: float
    #: (12, beats), each column L2-normalised.
    chroma: np.ndarray
    #: (12, beats), the bass band, each column scaled to a peak of 1.
    bass: np.ndarray
    #: (beats,) harmonic loudness, 1.0 = a loud beat of this recording.
    energy: np.ndarray

    @property
    def n(self) -> int:
        """Number of beats."""
        return len(self.times)


def analyse(y: np.ndarray, sr: int) -> Signal:
    """HPSS, onset strength, harmonic chroma and loudness, frame by frame."""
    harmonic, _ = librosa.effects.hpss(y)
    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP)
    chroma = _log_chroma(harmonic, sr, "C3", 5)
    bass = _log_chroma(harmonic, sr, "C1", 2)
    rms = librosa.feature.rms(y=harmonic, hop_length=HOP)[0]
    n = min(len(onset_env), chroma.shape[1], bass.shape[1], len(rms))
    return Signal(sr, len(y) / sr, onset_env[:n], chroma[:, :n], bass[:, :n], rms[:n])


#: Log compression of the constant-Q magnitudes before they fold into chroma, so
#: one loud voice (a melody over a quiet verse) does not drown the chord.
LOG_GAIN = 100.0


def _log_chroma(y: np.ndarray, sr: int, lowest: str, octaves: int) -> np.ndarray:
    """Chroma from log-compressed constant-Q magnitudes, three bins a semitone."""
    bins = 36
    cqt = np.abs(
        librosa.cqt(
            y,
            sr=sr,
            hop_length=HOP,
            fmin=librosa.note_to_hz(lowest),
            n_bins=bins * octaves,
            bins_per_octave=bins,
        )
    )
    compressed = np.log1p(LOG_GAIN * cqt / (cqt.max() or 1.0))
    return librosa.feature.chroma_cqt(
        C=compressed, sr=sr, hop_length=HOP, fmin=librosa.note_to_hz(lowest), bins_per_octave=bins
    )


def track_beats(signal: Signal, prior_bpm: float) -> np.ndarray:
    """Beat times in seconds, with ``prior_bpm`` as the tracker's starting tempo."""
    _, frames = librosa.beat.beat_track(
        onset_envelope=signal.onset_env,
        sr=signal.sr,
        hop_length=HOP,
        start_bpm=prior_bpm,
        units="frames",
    )
    return librosa.frames_to_time(frames, sr=signal.sr, hop_length=HOP)


def regular_grid(times: np.ndarray, duration: float) -> tuple[np.ndarray, float]:
    """Extend tracked beats to cover the whole recording; also return the tempo.

    The tempo is 60 over the median beat interval. Missing beats at the edges are
    filled at that interval, so silence before and after the music still has beats
    (which the aligner may label as intro or outro).
    """
    if len(times) < 4:
        raise ValueError("too few beats were found to align anything")
    period = beat_period(times)
    before = np.arange(times[0] - period, -period / 2, -period)[::-1]
    after = np.arange(times[-1] + period, duration - period / 2, period)
    grid = np.concatenate([before, times, after])
    grid = grid[grid >= -1e-9]
    return np.maximum(grid, 0.0), 60.0 / period


def beat_period(times: np.ndarray) -> float:
    """The mean beat length: a straight line fitted through the beats.

    Beat times are only as fine as the analysis frames (about 23 ms); fitting a
    line through all of them averages that out, where the median interval would
    not. A gap where the tracker skipped a beat counts as two beats.
    """
    gaps = np.diff(times)
    median = float(np.median(gaps))
    steps = np.maximum(1, np.round(gaps / median))
    index = np.concatenate([[0.0], np.cumsum(steps)])
    slope, _ = np.polyfit(index, times, 1)
    return float(slope)


def onset_salience(signal: Signal, times: np.ndarray) -> float:
    """Mean onset strength on the beats of a grid: the true beats carry the kicks and strums."""
    frames = librosa.time_to_frames(times, sr=signal.sr, hop_length=HOP)
    frames = frames[(frames >= 0) & (frames < len(signal.onset_env))]
    return float(np.mean(signal.onset_env[frames])) if len(frames) else 0.0


def candidate_grids(times: np.ndarray, signal: Signal) -> list[tuple[str, np.ndarray]]:
    """The tracked grid, double it, and half it.

    Half the beats can be every first or every second tracked beat; the one whose
    beats land on the stronger onsets is kept, since the cost of the alignment
    barely tells the two phases apart.
    """
    mids = (times[:-1] + times[1:]) / 2
    doubled = np.sort(np.concatenate([times, mids]))
    halves = [times[::2], times[1::2]]
    half = max(halves, key=lambda h: onset_salience(signal, h))
    return [("tracked", times), ("double", doubled), ("half", half)]


def beat_features(signal: Signal, times: np.ndarray, tempo: float) -> BeatFeatures:
    """Chroma (median) and loudness (mean) between consecutive beats."""
    frames = librosa.time_to_frames(times, sr=signal.sr, hop_length=HOP)
    n_frames = signal.chroma.shape[1]
    bounds = np.clip(np.concatenate([frames, [n_frames]]), 0, n_frames)
    chroma = np.zeros((12, len(times)))
    bass = np.zeros((12, len(times)))
    energy = np.zeros(len(times))
    for i in range(len(times)):
        lo, hi = int(bounds[i]), int(max(bounds[i + 1], bounds[i] + 1))
        hi = min(hi, n_frames)
        if lo >= hi:
            continue
        chroma[:, i] = np.median(signal.chroma[:, lo:hi], axis=1)
        bass[:, i] = np.median(signal.bass[:, lo:hi], axis=1)
        energy[i] = float(np.mean(signal.rms[lo:hi]))
    norms = np.linalg.norm(chroma, axis=0)
    chroma = chroma / np.where(norms > 0, norms, 1.0)
    loud = float(np.percentile(energy, 90)) if np.any(energy > 0) else 1.0
    energy = energy / (loud if loud > 0 else 1.0)
    peaks = bass.max(axis=0)
    bass = bass / np.where(peaks > 0, peaks, 1.0)
    return BeatFeatures(times, tempo, chroma, bass, energy)
