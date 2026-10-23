import json
from datetime import date
from pathlib import Path

import pytest
from google.api_core.exceptions import ServiceUnavailable
from idea_agro_api.series import Composites, ZoneStore
from idea_agro_api.zones import Division, LocalFiles, SeasonalIndicator

DAYS = [date(2026, 1, 1), date(2026, 1, 17)]
NAME = "series/seccionales/1406.json"


class FakeValues:
    def __init__(self, composites: Composites | None = None, failing: bool = False) -> None:
        self.found = composites or {}
        self.failing = failing
        self.asked = 0

    def composites(self, division: Division, zone: str) -> Composites:
        self.asked += 1
        if self.failing:
            raise ServiceUnavailable("BigQuery is down")
        return self.found if zone == "1406" else {}


@pytest.fixture
def files(tmp_path: Path) -> LocalFiles:
    seasonal = {"ppna": [d.isoformat() for d in DAYS], "apar": [], "et": []}
    (tmp_path / "catalog.json").write_text(json.dumps({"seasonal": seasonal}))
    return LocalFiles(tmp_path)


def stored(files: LocalFiles) -> object:
    content = files.read(NAME)
    return json.loads(content) if content else None


def test_a_current_file_is_served_without_asking_bigquery(files: LocalFiles) -> None:
    files.write(NAME, json.dumps({"ppna": [1.0, 2.0]}).encode())
    values = FakeValues()

    series = ZoneStore(files, values).seasonal(Division.SECCIONALES, "1406")

    assert series == {SeasonalIndicator.PPNA: (DAYS, [1.0, 2.0])}
    assert values.asked == 0


@pytest.mark.parametrize("before", [None, {"ppna": [1.0]}])
def test_a_missing_or_behind_file_is_built_from_bigquery_and_saved(files: LocalFiles, before: object) -> None:
    if before:
        files.write(NAME, json.dumps(before).encode())
    values = FakeValues({SeasonalIndicator.PPNA: {DAYS[1]: 7.5, DAYS[0]: None}})

    series = ZoneStore(files, values).seasonal(Division.SECCIONALES, "1406")

    assert series == {SeasonalIndicator.PPNA: (DAYS, [None, 7.5])}
    assert stored(files) == {"ppna": [None, 7.5]}


def test_a_zone_bigquery_does_not_know_does_not_exist(files: LocalFiles) -> None:
    assert ZoneStore(files, FakeValues()).seasonal(Division.SECCIONALES, "9999") is None


def test_a_behind_file_is_served_while_bigquery_fails(files: LocalFiles) -> None:
    files.write(NAME, json.dumps({"ppna": [1.0]}).encode())

    series = ZoneStore(files, FakeValues(failing=True)).seasonal(Division.SECCIONALES, "1406")

    assert series == {SeasonalIndicator.PPNA: (DAYS, [1.0, None])}


def test_without_bigquery_the_files_are_served_as_they_are(files: LocalFiles) -> None:
    files.write(NAME, json.dumps({"ppna": [1.0]}).encode())
    store = ZoneStore(files)

    assert store.seasonal(Division.SECCIONALES, "1406") == {SeasonalIndicator.PPNA: (DAYS, [1.0, None])}
    assert store.seasonal(Division.SECCIONALES, "9999") is None


def test_a_zone_exists_when_its_file_is_published(files: LocalFiles) -> None:
    files.write("divisions/seccionales/1406.json", b"{}")
    store = ZoneStore(files)

    assert store.exists(Division.SECCIONALES, "1406")
    assert not store.exists(Division.SECCIONALES, "9999")
