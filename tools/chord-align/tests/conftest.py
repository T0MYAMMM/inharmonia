from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any

import pytest

from chord_align.evaluate import Score, score
from chord_align.pipeline import Result
from chord_align.renders import RENDERS

TOOL = Path(__file__).resolve().parents[1]
REPO = TOOL.parents[1]
FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def chart_data() -> dict[str, Any]:
    return json.loads((FIXTURES / "chart.json").read_text(encoding="utf-8"))


_SCORES: dict[str, tuple[Score, Result]] = {}


def scored(name: str) -> tuple[Score, Result]:
    """Render, align and score once per test session."""
    if name not in _SCORES:
        _SCORES[name] = score(next(r for r in RENDERS if r.name == name))
    return _SCORES[name]


def check_output(*files: Path) -> subprocess.CompletedProcess[str]:
    """Run the app's own reader on output files; skip if Node is not set up here.

    Set CHORD_ALIGN_REQUIRE_NODE=1 (CI does) to fail instead of skipping.
    """
    npx = shutil.which("npx")
    if npx is None or not (REPO / "node_modules").is_dir():
        if os.environ.get("CHORD_ALIGN_REQUIRE_NODE") == "1":
            pytest.fail("Node and the repo's node_modules are needed for check-output")
        pytest.skip("Node or node_modules missing: run `npm ci` at the repo root")
    return subprocess.run(
        [
            npx,
            "tsx",
            "--tsconfig",
            "tsconfig.app.json",
            "tools/chord-align/check-output.ts",
            *[str(f) for f in files],
        ],
        cwd=REPO,
        capture_output=True,
        text=True,
        check=False,
    )
