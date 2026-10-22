from datetime import date, timedelta
from typing import Any

import board


def iterations(*starts: date) -> dict[str, Any]:
    items = [
        {"id": str(i), "title": f"Sprint {i}", "startDate": s.isoformat(), "duration": 14} for i, s in enumerate(starts)
    ]
    return {"configuration": {"iterations": items}}


def test_current_iteration_is_the_one_covering_today() -> None:
    today = date.today()
    field = iterations(today - timedelta(days=20), today - timedelta(days=6), today + timedelta(days=8))
    current = board.current_iteration(field)
    assert current is not None
    assert current["title"] == "Sprint 1"


def test_no_current_iteration_between_sprints() -> None:
    field = iterations(date.today() + timedelta(days=1))
    assert board.current_iteration(field) is None
