from __future__ import annotations

import shutil
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from chord_align.audio import SAMPLE_RATE, AudioError, ffmpeg_command, load_audio


def _tone(sr: int, seconds: float = 1.0) -> np.ndarray:
    t = np.arange(int(sr * seconds)) / sr
    return (0.3 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)


def test_ffmpeg_reads_only_the_local_file_and_no_shell() -> None:
    cmd = ffmpeg_command(Path("song; rm -rf ~.m4a"), 22_050)
    assert cmd[0] == "ffmpeg"
    assert all(isinstance(a, str) for a in cmd)
    source = cmd[cmd.index("-i") + 1]
    assert source.startswith("file:/")
    assert source.endswith("song; rm -rf ~.m4a")
    assert cmd[cmd.index("-ac") + 1] == "1"
    assert cmd[cmd.index("-ar") + 1] == "22050"


def test_wav_loads_directly_and_is_resampled_to_mono(tmp_path: Path) -> None:
    stereo = np.stack([_tone(44_100), _tone(44_100)], axis=1)
    path = tmp_path / "a.wav"
    sf.write(path, stereo, 44_100)
    y = load_audio(path)
    assert y.dtype == np.float32
    assert y.ndim == 1
    assert abs(len(y) - SAMPLE_RATE) < 10


def test_flac_loads_directly(tmp_path: Path) -> None:
    path = tmp_path / "a.flac"
    sf.write(path, _tone(SAMPLE_RATE), SAMPLE_RATE)
    assert len(load_audio(path)) == SAMPLE_RATE


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg is not installed")
def test_other_formats_go_through_ffmpeg(tmp_path: Path) -> None:
    import subprocess

    wav = tmp_path / "a.wav"
    sf.write(wav, _tone(SAMPLE_RATE, 2.0), SAMPLE_RATE)
    m4a = tmp_path / "a.m4a"
    subprocess.run(
        ["ffmpeg", "-nostdin", "-loglevel", "error", "-i", str(wav), "-c:a", "aac", str(m4a)],
        check=True,
    )
    y = load_audio(m4a)
    assert abs(len(y) / SAMPLE_RATE - 2.0) < 0.1


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg is not installed")
def test_undecodable_file(tmp_path: Path) -> None:
    path = tmp_path / "a.mp3"
    path.write_bytes(b"not audio at all")
    with pytest.raises(AudioError, match="could not decode"):
        load_audio(path)


def test_missing_file(tmp_path: Path) -> None:
    with pytest.raises(AudioError, match="no such file"):
        load_audio(tmp_path / "nothing.wav")
