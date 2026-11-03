from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def chart_data() -> dict[str, Any]:
    return json.loads((FIXTURES / "chart.json").read_text(encoding="utf-8"))
