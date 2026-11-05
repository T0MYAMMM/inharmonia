"""Read, check and write the chart inside an Inharmonia file.

Mirrors the checks of ``src/core/format/read.ts`` for chart items, so a bad file
is refused here, at the boundary, before any audio is read. The output is proven
importable by ``check-output.ts``, which runs the app's own reader.
"""

from __future__ import annotations

import copy
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .symbols import is_no_chord, parse_symbol

FORMAT = "inharmonia"
FORMAT_VERSION = 3

#: From src/core/charts/types.ts (LIMITS) and src/core/format/types.ts (FILE_LIMITS).
LIMITS = {
    "items": 500,
    "title": 80,
    "notes": 500,
    "sections": 24,
    "bars_per_section": 32,
    "expanded_bars": 400,
    "chords_per_bar": 4,
    "repeat": 8,
    "label": 24,
    "lyric": 120,
    "bar_text": 80,
    "bytes": 64 * 1024 * 1024,
}
MAJOR_KEYS = ("C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B")
MINOR_KEYS = ("C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B")

_ID_RE = re.compile(r"^[a-z0-9-]{1,80}$", re.IGNORECASE)
_SECTION_ID_RE = re.compile(r"^[a-z0-9-]{1,40}$", re.IGNORECASE)


class ChartError(ValueError):
    """The file is not a chart this tool can read; ``field`` says where."""

    def __init__(self, field_path: str, message: str) -> None:
        super().__init__(f"{field_path}: {message}" if field_path else message)
        self.field = field_path
        self.message = message


@dataclass(frozen=True)
class Chord:
    """A chord as written in the chart, lasting ``beats``."""

    symbol: str
    beats: float


@dataclass
class Section:
    """A chart section: its bars, entered once, played ``repeat`` times."""

    id: str
    label: str
    repeat: int
    bars: list[list[Chord]]
    has_lyrics: bool = False

    def merged(self) -> list[Chord]:
        """One pass of the section with repeated neighbouring chords joined.

        ``| C | C | F |`` becomes C for 8 beats then F: the boundary between two
        identical chords cannot be heard, and rebuilding the bars repeats the
        symbol at the barline anyway.
        """
        out: list[Chord] = []
        for bar in self.bars:
            for chord in bar:
                if out and out[-1].symbol == chord.symbol:
                    out[-1] = Chord(chord.symbol, out[-1].beats + chord.beats)
                else:
                    out.append(chord)
        return out


@dataclass
class Chart:
    """The one chart this run works on, and the file it came from."""

    data: dict[str, Any]
    item_index: int
    item_id: str
    key_tonic: str
    key_mode: str
    tempo: float
    meter: int
    sections: list[Section]
    form: list[str]
    #: Form ids that name no section; the app skips them, and so do we.
    missing_form_ids: list[str] = field(default_factory=list)

    def section(self, section_id: str) -> Section:
        """The section with this id."""
        return next(s for s in self.sections if s.id == section_id)


@dataclass(frozen=True)
class Event:
    """One chord in the played sequence."""

    symbol: str
    chart_beats: float
    section_id: str
    #: Which time this section is played (0-based), counting every pass.
    occurrence: int
    #: Index into ``Section.merged()``.
    position: int


def even_beats(count: int, beats_per_bar: int) -> list[float]:
    """Even splits of a bar, as ``evenBeats`` in src/core/charts/types.ts."""
    n = max(1, min(LIMITS["chords_per_bar"], count))
    if beats_per_bar == 3:
        return [[3], [2, 1], [1, 1, 1], [1, 1, 0.5, 0.5]][n - 1]
    return [[4], [2, 2], [2, 1, 1], [1, 1, 1, 1]][n - 1]


def parse_bar(text: str, beats_per_bar: int, where: str) -> list[Chord]:
    """Read one bar of chart syntax: ``"Am F"``, ``"C . . G"``, ``"N.C."``."""
    tokens = text.split()
    if not tokens:
        raise ChartError(where, "is an empty bar")
    slots: list[list[Any]] = []
    for token in tokens:
        if re.fullmatch(r"\.+", token) or token == "/":
            if not slots:
                raise ChartError(where, "dots add beats to the chord before them")
            slots[-1][1] += 1 if token == "/" else len(token)
            continue
        if is_no_chord(token):
            slots.append([token, 0])
            continue
        match = re.fullmatch(r"(.*?)(\.*)", token)
        assert match is not None
        symbol, dots = match.group(1), match.group(2)
        try:
            parse_symbol(symbol)
        except ValueError:
            raise ChartError(where, f'"{symbol}" is not a chord') from None
        slots.append([symbol, len(dots)])
    if len(slots) > LIMITS["chords_per_bar"]:
        raise ChartError(where, f"a bar holds up to {LIMITS['chords_per_bar']} chords")
    if any(dots for _, dots in slots):
        beats = [1 + dots for _, dots in slots]
        if sum(beats) != beats_per_bar:
            raise ChartError(where, f"lasts {sum(beats)} beats, not {beats_per_bar}")
    else:
        beats = even_beats(len(slots), beats_per_bar)
    return [Chord(s, float(b)) for (s, _), b in zip(slots, beats, strict=True)]


def format_bar(chords: list[Chord], beats_per_bar: int) -> str:
    """Write one bar back as syntax; uneven splits use dots, as ``formatBars``."""
    even = even_beats(len(chords), beats_per_bar)
    if [c.beats for c in chords] == even:
        return " ".join(c.symbol for c in chords)
    parts: list[str] = []
    for c in chords:
        parts.append(c.symbol)
        parts.extend(["."] * (int(c.beats) - 1))
    return " ".join(parts)


def _is_obj(x: Any) -> bool:
    return isinstance(x, dict)


def _is_num(x: Any, lo: float, hi: float) -> bool:
    return isinstance(x, int | float) and not isinstance(x, bool) and lo <= x <= hi


def load_file(path: Path) -> dict[str, Any]:
    """Read an Inharmonia file's JSON and check its envelope."""
    if path.stat().st_size > LIMITS["bytes"]:
        raise ChartError("", "this file is too large to be an Inharmonia export")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise ChartError("", "this is not JSON, so it cannot be an Inharmonia export") from None
    if not _is_obj(data) or data.get("format") != FORMAT:
        raise ChartError("", "this is not an Inharmonia export")
    version = data.get("version")
    if not isinstance(version, int) or version < 2 or version > FORMAT_VERSION:
        raise ChartError("version", f"should be 2 to {FORMAT_VERSION}")
    items = data.get("items")
    if not isinstance(items, list) or not items:
        raise ChartError("items", "this export has no items")
    if len(items) > LIMITS["items"]:
        raise ChartError("items", f"holds more than {LIMITS['items']} items")
    return data


def read_chart(data: dict[str, Any], item_id: str | None = None) -> Chart:
    """Find and check the chart item (the first chart, unless ``item_id`` names one)."""
    items = data["items"]
    index = next(
        (
            i
            for i, it in enumerate(items)
            if _is_obj(it) and it.get("kind") == "chart" and (item_id is None or it.get("id") == item_id)
        ),
        None,
    )
    if index is None:
        what = f'chart with id "{item_id}"' if item_id else "chart"
        raise ChartError("items", f"has no {what}")
    item = items[index]
    where = f"items[{index}]"
    if not isinstance(item.get("id"), str) or not _ID_RE.match(item["id"]):
        raise ChartError(f"{where}.id", "should be a short id (letters, digits, dashes)")
    title = item.get("title")
    if not isinstance(title, str) or not title.strip() or len(title) > LIMITS["title"]:
        raise ChartError(f"{where}.title", f"should be a name up to {LIMITS['title']} characters")
    raw = item.get("chart")
    if not _is_obj(raw):
        raise ChartError(f"{where}.chart", "is missing")
    where = f"{where}.chart"

    key = raw.get("key")
    if not _is_obj(key) or key.get("mode") not in ("major", "minor"):
        raise ChartError(f"{where}.key", "needs a tonic and a mode (major or minor)")
    tonics = MAJOR_KEYS if key["mode"] == "major" else MINOR_KEYS
    if key.get("tonic") not in tonics:
        raise ChartError(f"{where}.key.tonic", f"is not a {key['mode']} key")
    meter = raw.get("meter")
    if not _is_obj(meter) or meter.get("beats") not in (3, 4) or meter.get("unit") != 4:
        raise ChartError(f"{where}.meter", "must be 3/4 or 4/4")
    beats_per_bar = int(meter["beats"])
    if not _is_num(raw.get("tempo"), 30, 240):
        raise ChartError(f"{where}.tempo", "should be 30 to 240 bpm")
    notes = raw.get("notes", "")
    if not isinstance(notes, str) or len(notes) > LIMITS["notes"]:
        raise ChartError(f"{where}.notes", f"should be text up to {LIMITS['notes']} characters")

    raw_sections = raw.get("sections")
    if not isinstance(raw_sections, list) or not 1 <= len(raw_sections) <= LIMITS["sections"]:
        raise ChartError(f"{where}.sections", f"needs 1 to {LIMITS['sections']} sections")
    sections: list[Section] = []
    for si, s in enumerate(raw_sections):
        sw = f"{where}.sections[{si}]"
        if not _is_obj(s):
            raise ChartError(sw, "is not a section")
        if not isinstance(s.get("id"), str) or not _SECTION_ID_RE.match(s["id"]):
            raise ChartError(f"{sw}.id", "should be a short id (letters, digits, dashes)")
        if any(x.id == s["id"] for x in sections):
            raise ChartError(f"{sw}.id", "two sections share an id")
        label = s.get("label")
        if not isinstance(label, str) or not label.strip() or len(label) > LIMITS["label"]:
            raise ChartError(f"{sw}.label", f"should be a name up to {LIMITS['label']} characters")
        repeat = s.get("repeat")
        if not isinstance(repeat, int) or isinstance(repeat, bool):
            raise ChartError(f"{sw}.repeat", f"should be 1 to {LIMITS['repeat']}")
        if not 1 <= repeat <= LIMITS["repeat"]:
            raise ChartError(f"{sw}.repeat", f"should be 1 to {LIMITS['repeat']}")
        raw_bars = s.get("bars")
        if not isinstance(raw_bars, list) or not 1 <= len(raw_bars) <= LIMITS["bars_per_section"]:
            raise ChartError(f"{sw}.bars", f"needs 1 to {LIMITS['bars_per_section']} bars")
        bars: list[list[Chord]] = []
        for bi, b in enumerate(raw_bars):
            bw = f"{sw}.bars[{bi}]"
            if not isinstance(b, str) or len(b) > LIMITS["bar_text"] or "|" in b or "\n" in b:
                raise ChartError(bw, 'should be one bar of chords, like "Am F"')
            bars.append(parse_bar(b, beats_per_bar, bw))
        lyrics = s.get("lyrics")
        if lyrics is not None and (not isinstance(lyrics, list) or len(lyrics) != len(bars)):
            raise ChartError(f"{sw}.lyrics", "should list one line of lyrics per bar")
        sections.append(Section(s["id"], label.strip(), repeat, bars, lyrics is not None))

    form = raw.get("form")
    if not isinstance(form, list) or not all(isinstance(x, str) for x in form):
        raise ChartError(f"{where}.form", "should list section ids")
    ids = {s.id for s in sections}
    chart = Chart(
        data=data,
        item_index=index,
        item_id=item["id"],
        key_tonic=key["tonic"],
        key_mode=key["mode"],
        tempo=float(raw["tempo"]),
        meter=beats_per_bar,
        sections=sections,
        form=list(form),
        missing_form_ids=[x for x in form if x not in ids],
    )
    if not expand_form(chart):
        raise ChartError(f"{where}.form", "plays no sections")
    return chart


def expand_form(chart: Chart) -> list[Event]:
    """The chords in play order, each section played ``repeat`` times."""
    events: list[Event] = []
    seen: dict[str, int] = {}
    for section_id in chart.form:
        if section_id in chart.missing_form_ids:
            continue
        section = chart.section(section_id)
        merged = section.merged()
        for _ in range(section.repeat):
            occurrence = seen.get(section_id, 0)
            seen[section_id] = occurrence + 1
            events.extend(
                Event(c.symbol, c.beats, section_id, occurrence, pos) for pos, c in enumerate(merged)
            )
    return events


def bars_from_lengths(symbols: list[str], lengths: list[int], beats_per_bar: int) -> list[list[Chord]]:
    """Lay chords end to end from a downbeat, splitting any that cross a barline.

    A split chord repeats its symbol in the next bar. ``sum(lengths)`` must be a
    whole number of bars.
    """
    if len(symbols) != len(lengths) or any(n < 1 for n in lengths):
        raise ValueError("every chord needs a length of at least one beat")
    if sum(lengths) % beats_per_bar:
        raise ValueError("the chords do not fill whole bars")
    bars: list[list[Chord]] = [[]]
    room = beats_per_bar
    for symbol, length in zip(symbols, lengths, strict=True):
        left = length
        while left:
            if room == 0:
                bars.append([])
                room = beats_per_bar
            take = min(left, room)
            bars[-1].append(Chord(symbol, float(take)))
            left -= take
            room -= take
    return bars


def replace_symbols(bars: list[list[Chord]], changes: dict[int, str]) -> list[list[Chord]]:
    """The bars with the chords at these positions (of ``Section.merged()``) renamed.

    Positions count as ``merged`` does: a chord repeated across a barline is one.
    """
    out: list[list[Chord]] = []
    pos, prev = -1, None
    for bar in bars:
        out.append([])
        for chord in bar:
            if chord.symbol != prev:
                pos += 1
                prev = chord.symbol
            out[-1].append(Chord(changes.get(pos, chord.symbol), chord.beats))
    return out


def written_bars(bars: list[list[Chord]], beats_per_bar: int) -> list[str]:
    """Bars as the strings the file holds."""
    return [format_bar(b, beats_per_bar) for b in bars]


def write_chart(
    chart: Chart,
    *,
    section_bars: dict[str, list[str]],
    tempo: int,
    key: tuple[str, str] | None = None,
    transpose: int | None = None,
) -> dict[str, Any]:
    """A copy of the file with this chart's bars, tempo and (if asked) key or view changed.

    Everything else, the chart's ``notes`` and the other items included, is left
    exactly as it was.
    """
    data = copy.deepcopy(chart.data)
    item = data["items"][chart.item_index]
    raw = item["chart"]
    raw["tempo"] = tempo
    for s in raw["sections"]:
        if s["id"] in section_bars:
            s["bars"] = section_bars[s["id"]]
    if key is not None:
        raw["key"] = {"tonic": key[0], "mode": key[1]}
    if transpose is not None:
        view = item.get("view") if _is_obj(item.get("view")) else {}
        item["view"] = {**view, "transpose": transpose}
    return data
