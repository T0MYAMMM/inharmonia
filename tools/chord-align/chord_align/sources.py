"""Charts from your own files: Inharmonia exports, pasted sheets (.txt) and research JSON.

Inharmonia files are read here. A sheet or a research JSON goes through
``to-file.ts``, which runs the app's own Paste reader (with the lyric timing)
and file writer, so the chart is exactly what pasting it into the app makes.
It is run with an argument list, never a shell. Lyrics are dropped as the
sheet is read.
"""

from __future__ import annotations

import copy
import json
import logging
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .chart import LIMITS, ChartError, load_file

log = logging.getLogger(__name__)

TOOL = Path(__file__).resolve().parents[1]
REPO = TOOL.parents[1]
BRIDGE = TOOL / "to-file.ts"
#: Files in a charts folder that hold no chart: indexes, and the tool's own outputs.
_NOT_CHARTS = ("index.json",)
_NOT_CHART_ENDINGS = (".official-key.json", ".suggestions.json", ".aligned.json")
#: Research JSON files are small; anything larger is not one.
MAX_SOURCE_BYTES = 1024 * 1024
#: Seconds the bridge may take (it reads hundreds of files in one go).
BRIDGE_TIMEOUT = 300


@dataclass(frozen=True)
class ChartSource:
    """One chart and where it came from: its file, its item id, its title and artist."""

    path: Path
    item_id: str
    title: str
    artist: str | None
    #: The Inharmonia file data holding the chart (lyrics already removed).
    data: dict[str, Any]


def kind_of(path: Path) -> str:
    """What the file holds: ``"inharmonia"``, ``"research"`` or ``"sheet"``; ``ChartError`` otherwise."""
    suffix = path.suffix.lower()
    if suffix == ".txt":
        return "sheet"
    if suffix != ".json":
        raise ChartError("", f"{path.name}: a chart is an Inharmonia .json, a research .json or a .txt sheet")
    if path.stat().st_size > LIMITS["bytes"]:
        raise ChartError("", f"{path.name}: this file is too large to be a chart")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise ChartError("", f"{path.name}: this is not JSON") from None
    if isinstance(data, dict) and data.get("format") == "inharmonia":
        return "inharmonia"
    if isinstance(data, dict) and isinstance(data.get("chart"), str):
        return "research"
    raise ChartError("", f"{path.name}: neither an Inharmonia export nor a research chart")


def without_lyrics(data: dict[str, Any]) -> dict[str, Any]:
    """A copy of an Inharmonia file with every chart section's lyrics taken out."""
    out = copy.deepcopy(data)
    for item in out.get("items", []):
        chart = item.get("chart") if isinstance(item, dict) else None
        sections = chart.get("sections") if isinstance(chart, dict) else None
        for s in sections if isinstance(sections, list) else []:
            if isinstance(s, dict):
                s.pop("lyrics", None)
    return out


def split_title(title: str) -> tuple[str, str | None]:
    """A title and the artist in brackets after it, as the app names a research chart.

    "Laskar Pelangi (Nidji)" → ("Laskar Pelangi", "Nidji").
    """
    t = title.strip()
    if t.endswith(")") and " (" in t:
        head, _, tail = t[:-1].rpartition(" (")
        if head.strip() and tail.strip():
            return head.strip(), tail.strip()
    return t, None


def collect(path: Path) -> list[Path]:
    """Chart files: the file itself, or every .json and .txt under a folder (sorted)."""
    if path.is_file():
        return [path]
    if not path.is_dir():
        raise ChartError("", f"no such file or folder: {path}")
    found = []
    for p in sorted(path.rglob("*")):
        name = p.name.lower()
        if not p.is_file() or p.suffix.lower() not in (".json", ".txt"):
            continue
        if name in _NOT_CHARTS or name.endswith(_NOT_CHART_ENDINGS) or name.startswith("."):
            continue
        found.append(p)
    return found


def bridge_command(out: Path, inputs: list[Path]) -> list[str]:
    """The ``npx tsx`` argument list that runs the app's reader on ``inputs``."""
    npx = shutil.which("npx")
    if npx is None:
        raise ChartError("", "Node (npx) is needed to read a .txt sheet or a research JSON")
    return [npx, "tsx", "--tsconfig", "tsconfig.app.json", str(BRIDGE), str(out), *map(str, inputs)]


def convert(inputs: list[Path]) -> tuple[list[ChartSource], list[tuple[Path, str]]]:
    """Sheets and research JSON into charts, by the app's reader: (charts, (file, why skipped))."""
    if not inputs:
        return [], []
    skipped: list[tuple[Path, str]] = []
    readable = []
    for p in inputs:
        if p.stat().st_size > MAX_SOURCE_BYTES:
            skipped.append((p, "too large to be a chord sheet"))
        else:
            readable.append(p.resolve())
    if not readable:
        return [], skipped
    with tempfile.TemporaryDirectory(prefix="chord-align-") as tmp:
        out = Path(tmp) / "charts.json"
        try:
            done = subprocess.run(
                bridge_command(out, readable),
                cwd=REPO,
                capture_output=True,
                text=True,
                check=False,
                timeout=BRIDGE_TIMEOUT,
            )
        except subprocess.TimeoutExpired:
            raise ChartError("", "reading the sheets took too long") from None
        try:
            told = json.loads(done.stdout.strip().splitlines()[-1]) if done.stdout.strip() else None
        except json.JSONDecodeError:
            told = None
        if not isinstance(told, dict):
            detail = done.stderr.strip().splitlines()
            raise ChartError("", f"the app's sheet reader failed: {detail[-1] if detail else '?'}")
        skipped += [(Path(s["source"]), str(s["reason"])) for s in told.get("skipped", [])]
        if not told.get("items"):
            return [], skipped
        data = load_file(out)
    charts = [
        ChartSource(Path(it["source"]), it["id"], it["title"], it.get("artist"), data) for it in told["items"]
    ]
    return charts, skipped


def from_inharmonia(path: Path) -> list[ChartSource]:
    """Every chart in an Inharmonia file, lyrics removed."""
    data = without_lyrics(load_file(path))
    out = []
    for item in data["items"]:
        if isinstance(item, dict) and item.get("kind") == "chart" and isinstance(item.get("title"), str):
            title, artist = split_title(item["title"])
            out.append(ChartSource(path, str(item.get("id")), title, artist, data))
    return out


def load_sources(paths: list[Path]) -> tuple[list[ChartSource], list[tuple[Path, str]]]:
    """Every chart in these files: (charts, (file, why it was skipped))."""
    charts: list[ChartSource] = []
    skipped: list[tuple[Path, str]] = []
    to_convert: list[Path] = []
    for p in paths:
        try:
            kind = kind_of(p)
        except ChartError as e:
            skipped.append((p, e.message))
            continue
        if kind == "inharmonia":
            try:
                charts += from_inharmonia(p)
            except ChartError as e:
                skipped.append((p, str(e)))
        else:
            to_convert.append(p)
    converted, why = convert(to_convert)
    log.info("read %d charts, %d of them converted", len(charts) + len(converted), len(converted))
    return charts + converted, skipped + why


def load_one(path: Path, item_id: str | None = None) -> tuple[dict[str, Any], str | None]:
    """The file data and item id for a single run: an Inharmonia file as it is, or a converted sheet."""
    kind = kind_of(path)
    if kind == "inharmonia":
        return load_file(path), item_id
    charts, skipped = convert([path])
    if not charts:
        raise ChartError("", skipped[0][1] if skipped else "no chart found")
    return charts[0].data, charts[0].item_id
