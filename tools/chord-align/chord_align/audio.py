"""Load a recording as mono samples at the analysis rate.

WAV and FLAC are read directly. Anything else (m4a, mp3, ...) goes through
``ffmpeg``, run with an argument list and never a shell, reading only the local
file. Audio never leaves the machine.
"""

from __future__ import annotations

import logging
import shutil
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf

log = logging.getLogger(__name__)

SAMPLE_RATE = 22_050
_DIRECT = {".wav", ".flac"}


class AudioError(RuntimeError):
    """The recording could not be read."""


def load_audio(path: Path, sr: int = SAMPLE_RATE) -> np.ndarray:
    """Mono float32 samples of ``path`` at ``sr`` Hz."""
    if not path.is_file():
        raise AudioError(f"no such file: {path}")
    if path.suffix.lower() in _DIRECT:
        return _load_direct(path, sr)
    return _load_ffmpeg(path, sr)


def _load_direct(path: Path, sr: int) -> np.ndarray:
    try:
        data, rate = sf.read(str(path), dtype="float32", always_2d=True)
    except (sf.LibsndfileError, RuntimeError) as e:
        raise AudioError(f"could not read {path.name}: {e}") from None
    mono = data.mean(axis=1)
    if rate != sr:
        import librosa

        mono = librosa.resample(mono, orig_sr=rate, target_sr=sr)
    log.info("read %s directly: %.1f s", path.suffix, len(mono) / sr)
    return np.ascontiguousarray(mono, dtype=np.float32)


def ffmpeg_command(path: Path, sr: int) -> list[str]:
    """The ffmpeg arguments: local file only, mono, ``sr`` Hz, raw float32 to stdout."""
    return [
        "ffmpeg",
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        # "file:" keeps ffmpeg to the local file, whatever the name looks like.
        "-i",
        f"file:{path.resolve()}",
        "-vn",
        "-ac",
        "1",
        "-ar",
        str(sr),
        "-f",
        "f32le",
        "pipe:1",
    ]


def _load_ffmpeg(path: Path, sr: int) -> np.ndarray:
    if shutil.which("ffmpeg") is None:
        raise AudioError("ffmpeg is not installed; see the README, or convert to WAV first")
    result = subprocess.run(ffmpeg_command(path, sr), capture_output=True, check=False)
    if result.returncode != 0:
        detail = result.stderr.decode("utf-8", "replace").strip().splitlines()
        raise AudioError(f"ffmpeg could not decode {path.name}: {detail[-1] if detail else '?'}")
    samples = np.frombuffer(result.stdout, dtype="<f4").astype(np.float32)
    if samples.size == 0:
        raise AudioError(f"{path.name} holds no audio")
    log.info("decoded %s with ffmpeg: %.1f s", path.suffix, len(samples) / sr)
    return samples
