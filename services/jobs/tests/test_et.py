# pyright: reportUnknownMemberType=false
import json
from collections.abc import Iterator
from datetime import date
from typing import Any, cast

import pytest
from earth_offline import offline
from idea_agro_jobs import et


@pytest.fixture(autouse=True)
def earth_engine() -> Iterator[None]:
    with offline():
        yield


def constants(graph: str) -> list[object]:
    """Every constant in a serialized graph."""
    found: list[object] = []

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            for key, value in cast(dict[str, Any], node).items():
                if key == "constantValue":
                    found.extend(cast(list[object], value) if isinstance(value, list) else [value])
                walk(value)
        elif isinstance(node, list):
            for value in cast(list[Any], node):
                walk(value)

    walk(json.loads(graph))
    return found


def test_times_are_midnight_utc() -> None:
    assert et.millis(date(2024, 1, 9)) == 1704758400000


def test_a_composite_is_computed_as_the_owners_script_does() -> None:
    found = constants(et.composite(date(2024, 1, 9)).serialize())

    # MOD16A2's ET of the composite's calendar year, without its last day, inside Uruguay's outline.
    assert {et.SOURCE, et.OUTLINE, "ET", "2024-01-01", "2024-12-31"} <= set(map(str, found))
    # Times 0.1, filled from up to 72 days away with -9999 where it cannot, then divided by 8.
    assert {0.1, 72 * 86_400_000, -9999, 8} <= {value for value in found if isinstance(value, int | float)}
    # The composite is picked by its start.
    assert 1704758400000 in found


def test_published_composites_are_listed_up_to_the_last_day_included() -> None:
    found = constants(et.starts(date(2024, 1, 1), date(2024, 12, 31)).serialize())

    assert {et.SOURCE, "2024-01-01", "2025-01-01", "system:time_start"} <= set(map(str, found))
