import json
from datetime import date
from pathlib import Path
from typing import Any

import pytest
from fakes import FakeSource, MemoryStore
from idea_agro_jobs import values
from idea_agro_jobs.domain import SEASONAL, SUMMARIZED, YEARLY, Division, Indicator, Table
from idea_agro_jobs.files import LocalFiles

STARTS = [date(2025, 1, 1), date(2025, 1, 17)]


@pytest.fixture
def files(tmp_path: Path) -> LocalFiles:
    (tmp_path / "catalog.json").write_text(json.dumps({"size": [1600, 1400], "seasonal": {}}))
    return LocalFiles(tmp_path)


def read(files: LocalFiles, name: str) -> Any:
    content = files.read(name)
    assert content is not None
    return json.loads(content)


def test_a_first_run_adds_every_period_and_publishes_them(files: LocalFiles) -> None:
    store = MemoryStore()

    values.refresh(FakeSource(STARTS, [2023, 2024]), store, files)

    assert store.stored(Table.COMPOSITES)[(Division.CUENCAS_5, Indicator.ET)] == set(STARTS)
    assert read(files, "values/seccionales/rh.json") == {
        "years": [2023, 2024],
        "values": {"1": [2023.0, 2024.0], "2": [2023.0, 2024.0]},
    }
    assert read(files, "values/cuencas-1/csue.json")["values"]["1"] == {"mean": 1.0, "p25": 0.5, "p75": 1.5}
    assert read(files, "values/cuencas-1/compn.json")["values"]["2"] == {"3": 10.0, "5": 2.0}
    catalog = read(files, "catalog.json")
    assert catalog["size"] == [1600, 1400]
    assert catalog["seasonal"]["ppna"] == ["2025-01-01", "2025-01-17"]


def test_a_run_computes_only_what_is_missing(files: LocalFiles) -> None:
    store = MemoryStore()
    values.refresh(FakeSource(STARTS, [2023]), store, files)
    source = FakeSource([*STARTS, date(2025, 2, 2)], [2023, 2024])

    values.refresh(source, store, files)

    composites = [(d, i, p) for kind, d, i, p in source.computed if kind == "composites"]
    years = [(d, i, p) for kind, d, i, p in source.computed if kind == "years"]
    assert composites == [(d, i, [date(2025, 2, 2)]) for d in Division for i in SEASONAL]
    assert years == [(d, i, [2024]) for d in Division for i in YEARLY]
    assert not [c for c in source.computed if c[0] == "summary"]
    assert read(files, "values/seccionales/ppna.json")["years"] == [2023, 2024]
    assert read(files, "catalog.json")["seasonal"]["et"][-1] == "2025-02-02"


def test_a_run_with_nothing_new_changes_nothing(files: LocalFiles) -> None:
    store = MemoryStore()
    values.refresh(FakeSource(STARTS, [2024]), store, files)
    source = FakeSource(STARTS, [2024])

    values.refresh(source, store, files)

    assert source.computed == []


def test_periods_are_computed_in_chunks(files: LocalFiles, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(values, "CHUNK", 1)
    source = FakeSource(STARTS, [])

    values.refresh(source, MemoryStore(), files)

    assert [p for kind, d, i, p in source.computed if (kind, d, i) == ("composites", Division.SECCIONALES, "ppna")] == [
        [STARTS[0]],
        [STARTS[1]],
    ]


def test_the_catalog_lists_only_composites_every_division_has(files: LocalFiles) -> None:
    store = MemoryStore()
    for division in Division:
        for indicator in SEASONAL:
            store.add(Table.COMPOSITES, division, indicator, {"1": {STARTS[0]: 1.0}})
    store.add(Table.COMPOSITES, Division.SECCIONALES, Indicator.PPNA, {"1": {STARTS[1]: 1.0}})

    assert values.calendars(store.stored(Table.COMPOSITES))["ppna"] == ["2025-01-01"]


def test_summaries_are_published_once(files: LocalFiles) -> None:
    store = MemoryStore()
    values.refresh(FakeSource([], []), store, files)
    source = FakeSource([], [])

    values.refresh(source, store, files)

    assert source.computed == []
    assert {i for (t, _, i) in store.rows if t == Table.SUMMARIES} == set(SUMMARIZED)
