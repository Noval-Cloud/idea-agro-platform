import json
import logging
from datetime import date
from pathlib import Path
from typing import Any

import pytest
from idea_agro_jobs import saved
from idea_agro_jobs.domain import SEASONAL, Indicator
from idea_agro_jobs.files import LocalFiles

OUTLINE = "zones/z1/v1-abc.geojson"
POLYGON = {"type": "Polygon", "coordinates": [[[-56, -32], [-55.9, -32], [-55.9, -32.1], [-56, -32]]]}
STARTS = [date(2025, 1, 1), date(2025, 1, 17)]


class FakeOutlines:
    def __init__(self, starts: list[date], failing: str | None = None) -> None:
        self.starts = starts
        self.failing = failing
        self.computed: list[tuple[Indicator, list[date]]] = []

    def composites(self, indicator: Indicator) -> list[date]:
        return self.starts

    def outline_values(
        self, indicator: Indicator, outline: dict[str, Any], starts: list[date]
    ) -> dict[date, float | None]:
        if self.failing and outline["type"] == self.failing:
            raise RuntimeError("Earth Engine refused it")
        self.computed.append((indicator, starts))
        return {start: float(start.day) for start in starts}


@pytest.fixture
def files(tmp_path: Path) -> LocalFiles:
    found = LocalFiles(tmp_path)
    found.write(OUTLINE, json.dumps(POLYGON).encode())
    return found


def read(files: LocalFiles, name: str) -> Any:
    content = files.read(name)
    assert content is not None
    return json.loads(content)


def test_a_new_outline_gets_every_composite(files: LocalFiles) -> None:
    saved.refresh(FakeOutlines(STARTS), files)

    assert read(files, "zones/z1/v1-abc.series.json") == {
        indicator: {"2025-01-01": 1.0, "2025-01-17": 17.0} for indicator in SEASONAL
    }


def test_a_series_gets_only_the_composites_it_lacks(files: LocalFiles) -> None:
    saved.refresh(FakeOutlines(STARTS), files)
    source = FakeOutlines([*STARTS, date(2025, 2, 2)])

    saved.refresh(source, files)

    assert source.computed == [(indicator, [date(2025, 2, 2)]) for indicator in SEASONAL]
    assert read(files, "zones/z1/v1-abc.series.json")["ppna"]["2025-02-02"] == 2.0


def test_a_current_series_costs_nothing(files: LocalFiles) -> None:
    saved.refresh(FakeOutlines(STARTS), files)
    source = FakeOutlines(STARTS)

    saved.refresh(source, files)

    assert source.computed == []


def test_an_outline_that_fails_holds_back_no_other(files: LocalFiles, caplog: pytest.LogCaptureFixture) -> None:
    files.write("zones/z2/v1-def.geojson", json.dumps({"type": "Point", "coordinates": [-56, -32]}).encode())

    with caplog.at_level(logging.ERROR):
        saved.refresh(FakeOutlines(STARTS, failing="Point"), files)

    assert files.exists("zones/z1/v1-abc.series.json")
    assert not files.exists("zones/z2/v1-def.series.json")
    assert any("zones/z2/v1-def.geojson could not be computed" in r.getMessage() for r in caplog.records)


def test_the_series_of_a_removed_outline_is_deleted(files: LocalFiles) -> None:
    saved.refresh(FakeOutlines(STARTS), files)
    files.delete(OUTLINE)

    saved.refresh(FakeOutlines(STARTS), files)

    assert not files.exists("zones/z1/v1-abc.series.json")


def test_only_each_zones_latest_version_is_kept_current(files: LocalFiles) -> None:
    files.write("zones/z1/v2-def.geojson", json.dumps(POLYGON).encode())
    source = FakeOutlines(STARTS)

    saved.refresh(source, files)

    assert files.exists("zones/z1/v2-def.series.json")
    assert not files.exists("zones/z1/v1-abc.series.json")
    assert len(source.computed) == len(SEASONAL)


def test_a_run_asked_for_some_outlines_computes_only_those(files: LocalFiles) -> None:
    files.write("zones/z2/v1-def.geojson", json.dumps(POLYGON).encode())
    files.write("zones/z3/v1-ghi.series.json", b"{}")

    saved.refresh(FakeOutlines(STARTS), files, only=["zones/z2/v1-def.geojson"])

    assert files.exists("zones/z2/v1-def.series.json")
    assert not files.exists("zones/z1/v1-abc.series.json")
    # Only a full run cleans up.
    assert files.exists("zones/z3/v1-ghi.series.json")
