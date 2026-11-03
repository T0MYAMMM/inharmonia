"""Many songs at once: recordings matched to charts by name, aligned, and summed up.

A recording is matched to a chart when the chart's title appears, word for
word, in the recording's file name; the artist's name there too settles a tie.
Everything else in a name ("Official Music Video", "(Capo 1)", "Nada Asli",
"(Lyrics)") is ignored. A CSV manifest (``audio,chart``) overrides the
matching for the files it lists. When several recordings match one song, the
official or original one is preferred over a cover, by the words in its name,
and the summary says which was used. A recording that matches no chart, or
two equally, is listed, never guessed.
"""

from __future__ import annotations

import csv
import json
import logging
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .audio import AUDIO_SUFFIXES, SAMPLE_RATE, AudioError, load_audio
from .chart import FORMAT, FORMAT_VERSION, LIMITS, ChartError, read_chart
from .pipeline import MIN_CONFIDENCE, Result, run
from .report import build_report
from .sources import ChartSource, collect, load_sources
from .suggest import suggestions_file
from .tonality import signed_shift, transpose_key

log = logging.getLogger(__name__)

#: The combined import file and the summary, in the output folder.
COMBINED = "aligned-charts.json"
SUMMARY = "summary.md"
#: Charts per import file: an Inharmonia file holds up to 500 items.
PER_FILE = LIMITS["items"]

#: Words in a file name that make a recording more likely the original, or a cover.
_ORIGINAL_WORDS = {"official": 2, "mv": 2, "videoclip": 2, "original": 1}
_ORIGINAL_PHRASES = {("music", "video"): 2, ("video", "clip"): 2, ("official", "audio"): 1}
_COVER_WORDS = {
    "cover": -3,
    "karaoke": -3,
    "tutorial": -3,
    "akustik": -2,
    "acoustic": -2,
    "remix": -2,
    "instrumental": -2,
    "live": -1,
    "capo": -1,
    "naik": -1,
    "turun": -1,
    "petik": -1,
}
#: "Nada asli" is "in the original key": a cover that keeps the key, not the original recording.
_COVER_PHRASES = {("nada", "asli"): -2}
#: A one-word title this short must have the artist in the name too.
SHORT_TITLE = 3


def words(text: str) -> list[str]:
    """Lower-case words and numbers, accents and punctuation gone.

    "Kisah_Romantis (2005)" → kisah, romantis, 2005.
    """
    plain = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    return re.findall(r"[a-z0-9]+", plain.lower())


def slug(text: str) -> str:
    """A file-name slug, as the app's ``slugify``."""
    return "-".join(words(text))[:48].strip("-") or "untitled"


def _has_phrase(tokens: list[str], phrase: list[str]) -> bool:
    n = len(phrase)
    return n > 0 and any(tokens[i : i + n] == phrase for i in range(len(tokens) - n + 1))


def rank(name: str, artist: str | None = None) -> int:
    """How likely a recording is the original, from its file name: official/MV up, covers down."""
    tokens = words(name)
    score = sum(_ORIGINAL_WORDS.get(t, 0) + _COVER_WORDS.get(t, 0) for t in tokens)
    for phrases in (_ORIGINAL_PHRASES, _COVER_PHRASES):
        score += sum(v for p, v in phrases.items() if _has_phrase(tokens, list(p)))
    if artist and _has_phrase(tokens, words(artist)):
        score += 1
    return score


@dataclass(frozen=True)
class Match:
    """A recording's chart, or why it has none."""

    audio: Path
    chart: ChartSource | None
    #: "manifest" or "name"; for no chart, the reason.
    how: str


def match_name(audio: Path, charts: list[ChartSource]) -> Match:
    """The chart whose title the file name holds; the artist breaks a tie, the longest title wins."""
    tokens = words(audio.stem)
    scored: list[tuple[tuple[bool, int], ChartSource]] = []
    for c in charts:
        title = words(c.title)
        if not _has_phrase(tokens, title):
            continue
        by_artist = bool(c.artist) and _has_phrase(tokens, words(c.artist or ""))
        if len(title) == 1 and len(title[0]) <= SHORT_TITLE and not by_artist:
            continue
        scored.append(((by_artist, len(title)), c))
    if not scored:
        return Match(audio, None, "no chart's title is in its name")
    best = max(s for s, _ in scored)
    top = [c for s, c in scored if s == best]
    names = sorted({_song(c) for c in top})
    if len(names) > 1:
        return Match(audio, None, f"it could be {' or '.join(names)}; name it in a manifest")
    return Match(audio, top[0], "name")


def _song(c: ChartSource) -> str:
    return f"{c.title} ({c.artist})" if c.artist else c.title


class ManifestError(ValueError):
    """The manifest cannot be read."""


def read_manifest(path: Path) -> list[tuple[str, str]]:
    """(audio, chart) rows of a CSV with the header ``audio,chart``."""
    try:
        text = path.read_text(encoding="utf-8-sig")
    except (OSError, UnicodeDecodeError) as e:
        raise ManifestError(f"{path.name}: could not read it ({e})") from None
    reader = csv.DictReader(text.splitlines())
    if reader.fieldnames is None or {"audio", "chart"} - {f.strip() for f in reader.fieldnames}:
        raise ManifestError(f"{path.name}: the first line should be the header audio,chart")
    rows = []
    for n, row in enumerate(reader, start=2):
        clean = {(k or "").strip(): (v or "").strip() for k, v in row.items()}
        if not clean.get("audio") or not clean.get("chart"):
            raise ManifestError(f"{path.name}, line {n}: needs both an audio file and a chart")
        rows.append((clean["audio"], clean["chart"]))
    return rows


def _find_chart(name: str, charts: list[ChartSource], bases: list[Path]) -> ChartSource | None:
    """A chart named by id, by file (relative to ``bases``), or by title ("Title" or "Title (Artist)")."""
    for c in charts:
        if c.item_id == name:
            return c
    for base in bases:
        p = (base / name).resolve()
        found = [c for c in charts if c.path.resolve() == p]
        if found:
            return found[0]
    key = words(name)
    found = [c for c in charts if words(_song(c)) == key or words(c.title) == key]
    return found[0] if len(found) == 1 else None


def _find_audio(name: str, bases: list[Path]) -> Path | None:
    p = Path(name)
    if p.is_absolute():
        return p if p.is_file() else None
    return next((b / p for b in bases if (b / p).is_file()), None)


def match_all(
    audio_files: list[Path],
    charts: list[ChartSource],
    manifest: list[tuple[str, str]] | None = None,
    *,
    audio_dir: Path | None = None,
    charts_dir: Path | None = None,
    manifest_dir: Path | None = None,
) -> list[Match]:
    """A match for every recording: the manifest's pairs first, the rest by name.

    A manifest row's audio may also be outside the audio folder; it is added.
    """
    by_audio: dict[Path, Match] = {}
    audio_bases = [b for b in (audio_dir, manifest_dir) if b is not None]
    chart_bases = [b for b in (charts_dir, manifest_dir) if b is not None]
    for audio_name, chart_name in manifest or []:
        audio = _find_audio(audio_name, audio_bases)
        if audio is None:
            by_audio[Path(audio_name)] = Match(Path(audio_name), None, "the manifest names a file not found")
            continue
        chart = _find_chart(chart_name, charts, chart_bases)
        if chart is None:
            by_audio[audio.resolve()] = Match(audio, None, f'the manifest names no chart "{chart_name}"')
        else:
            by_audio[audio.resolve()] = Match(audio, chart, "manifest")
    for audio in audio_files:
        if audio.resolve() not in by_audio:
            by_audio[audio.resolve()] = match_name(audio, charts)
    return list(by_audio.values())


@dataclass
class Song:
    """One chart and the recordings that matched it: the one used first."""

    chart: ChartSource
    recordings: list[Match]

    @property
    def used(self) -> Match:
        """The recording aligned."""
        return self.recordings[0]


def songs(matches: list[Match]) -> list[Song]:
    """Matches grouped by chart, each with its recordings best first.

    A manifest's pair beats a match by name; then the most official-sounding
    name wins, then the file name, so the choice is the same every run.
    """
    groups: dict[tuple[Path, str], list[Match]] = {}
    for m in matches:
        if m.chart is not None:
            groups.setdefault((m.chart.path, m.chart.item_id), []).append(m)
    out = []
    for ms in groups.values():
        chart = ms[0].chart
        assert chart is not None
        ms.sort(key=lambda m: (m.how != "manifest", -rank(m.audio.stem, chart.artist), m.audio.name))
        out.append(Song(chart, ms))
    return sorted(out, key=lambda s: _song(s.chart).lower())


def audio_in(path: Path) -> list[Path]:
    """The recordings to align: the file itself, or those in the folder (not its subfolders)."""
    if path.is_file():
        return [path]
    if not path.is_dir():
        raise AudioError(f"no such file or folder: {path}")
    return sorted(p for p in path.iterdir() if p.is_file() and p.suffix.lower() in AUDIO_SUFFIXES)


@dataclass
class Row:
    """One line of the summary."""

    song: str
    recording: str
    others: list[str] = field(default_factory=list)
    report: str | None = None
    result: Result | None = None
    error: str | None = None


def _key_cell(r: Result) -> str:
    chart = r.chart
    shift = signed_shift(r.shift)
    text = f"{chart.key_tonic} {chart.key_mode}; {shift:+d}"
    if shift:
        text += f" (sounds as {transpose_key(chart.key_tonic, chart.key_mode, r.shift)} {chart.key_mode})"
    return text


def _skipped_cell(r: Result) -> str:
    kept = [f"{s.label}: {s.skipped}" for s in r.sections if s.skipped]
    return "; ".join(kept) or "–"


def _cell(text: str) -> str:
    return text.replace("|", "\\|").replace("\n", " ")


def summary(
    rows: list[Row],
    unmatched: list[Match],
    unread: list[tuple[Path, str]],
    counts: str,
) -> str:
    """``summary.md``: a line per song, then the recordings not matched and the charts not read."""
    lines = ["# Batch alignment", "", counts, ""]
    lines += [
        "| Song | Recording used | Tempo | Key and transposition | Confidence | Sections written "
        "| Suggestions | Skipped |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for row in rows:
        song = f"[{_cell(row.song)}]({row.report})" if row.report else _cell(row.song)
        used = _cell(row.recording)
        if row.others:
            used += f" (preferred over {_cell(', '.join(row.others))})"
        r = row.result
        if r is None:
            lines.append(f"| {song} | {used} | – | – | – | – | – | {_cell(row.error or '?')} |")
            continue
        written = sum(s.bars is not None for s in r.sections)
        n = len(r.suggestions)
        sugg = str(n) + (" (applied)" if n and any(s.applied for s in r.suggestions) else "")
        lines.append(
            f"| {song} | {used} | {r.tempo} bpm | {_key_cell(r)} | {r.confidence:.0%} | "
            f"{written} of {len(r.sections)} | {sugg} | {_cell(_skipped_cell(r))} |"
        )
    if not rows:
        lines.append("| – | – | – | – | – | – | – | no recording matched a chart |")
    lines += ["", "## Recordings not matched", ""]
    lines += [f"- {m.audio.name}: {m.how}." for m in unmatched] or ["None."]
    lines += ["", "## Chart files not read", ""]
    lines += [f"- {p.name}: {why}." for p, why in unread] or ["None."]
    lines.append("")
    return "\n".join(lines)


@dataclass(frozen=True)
class Options:
    """The alignment options every song in the batch gets."""

    set_key: bool = False
    min_confidence: float = MIN_CONFIDENCE
    lengths_trusted: bool = False
    apply_suggestions: bool = False


def align_song(song: Song, opts: Options) -> Result:
    """Read the chart and the recording, and align them."""
    chart = read_chart(song.chart.data, song.chart.item_id)
    samples = load_audio(song.used.audio)
    return run(
        chart,
        samples,
        SAMPLE_RATE,
        set_key=opts.set_key,
        min_confidence=opts.min_confidence,
        lengths_trusted=opts.lengths_trusted,
        apply_suggestions=opts.apply_suggestions,
    )


def combined(items: list[dict[str, Any]]) -> dict[str, Any]:
    """One Inharmonia file holding these aligned charts, ids made unique."""
    seen: set[str] = set()
    out = []
    for item in items:
        base = str(item["id"])
        new, n = base, 2
        while new in seen:
            new, n = f"{base[:76]}-{n}", n + 1
        seen.add(new)
        out.append({**item, "id": new})
    now = datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    return {"format": FORMAT, "version": FORMAT_VERSION, "exportedAt": now, "items": out}


def import_files(items: list[dict[str, Any]], per: int | None = None) -> list[tuple[str, dict[str, Any]]]:
    """The files to import: one, or, past ``PER_FILE`` charts, ``aligned-charts-1.json`` on."""
    every = combined(items)["items"]  # ids unique across all the files
    per = per or PER_FILE
    if len(every) <= per:
        return [(COMBINED, combined(every))]
    stem = COMBINED.removesuffix(".json")
    starts = range(0, len(every), per)
    return [(f"{stem}-{k + 1}.json", combined(every[i : i + per])) for k, i in enumerate(starts)]


@dataclass
class Batch:
    """What a batch did: the songs, the recordings not matched, the charts read and the files written."""

    rows: list[Row]
    unmatched: list[Match]
    charts: int
    written: list[str]


def run_batch(
    audio: Path,
    charts_path: Path,
    out_dir: Path,
    *,
    manifest: Path | None = None,
    opts: Options | None = None,
) -> Batch:
    """Match, align and write everything into ``out_dir``.

    That is: a report and suggestions per song, the combined file, and the summary.
    """
    opts = opts or Options()
    pairs = read_manifest(manifest) if manifest else None
    files = collect(charts_path)
    charts, unread = load_sources(files)
    audio_files = audio_in(audio)
    matches = match_all(
        audio_files,
        charts,
        pairs,
        audio_dir=audio if audio.is_dir() else audio.parent,
        charts_dir=charts_path if charts_path.is_dir() else charts_path.parent,
        manifest_dir=manifest.parent if manifest else None,
    )
    unmatched = [m for m in matches if m.chart is None]
    out_dir.mkdir(parents=True, exist_ok=True)
    rows: list[Row] = []
    items: list[dict[str, Any]] = []
    names: set[str] = set()
    for song in songs(matches):
        name, n = slug(_song(song.chart)), 2
        while name in names:
            name, n = f"{slug(_song(song.chart))}-{n}", n + 1
        names.add(name)
        row = Row(_song(song.chart), song.used.audio.name, [m.audio.name for m in song.recordings[1:]])
        log.info("aligning song %d", len(rows) + 1)
        try:
            result = align_song(song, opts)
        except (ChartError, AudioError, ValueError) as e:
            row.error = str(e)
            rows.append(row)
            continue
        row.result = result
        row.report = f"{name}.report.md"
        (out_dir / row.report).write_text(
            build_report(result, min_confidence=opts.min_confidence), encoding="utf-8"
        )
        (out_dir / f"{name}.suggestions.json").write_text(
            json.dumps(suggestions_file(result), indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        items.append(result.output()["items"][result.chart.item_index])
        rows.append(row)
    written = []
    for name, data in import_files(items) if items else []:
        (out_dir / name).write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        written.append(name)
    counts = f"{len(audio_files)} recordings, {len(charts)} charts read. {len(rows)} songs matched"
    if len(written) == 1:
        counts += f"; aligned charts in {written[0]}."
    elif written:
        counts += (
            f"; aligned charts in {len(written)} files, as one file holds up to {PER_FILE}: "
            f"{', '.join(written)}. Import each."
        )
    else:
        counts += "; nothing aligned."
    if not charts:
        counts += (
            f"\n\n**No charts were read** from {charts_path}: {len(files)} .json or .txt files found"
            + (", none of them a chart (see “Chart files not read”)." if files else ".")
        )
    (out_dir / SUMMARY).write_text(summary(rows, unmatched, unread, counts), encoding="utf-8")
    return Batch(rows, unmatched, len(charts), written)
