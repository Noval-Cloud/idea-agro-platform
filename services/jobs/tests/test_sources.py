import json
from datetime import date
from pathlib import Path

import pytest
from idea_agro_jobs.domain import Division, Indicator
from idea_agro_jobs.files import LocalFiles
from idea_agro_jobs.sources import PublicFiles

FILES = {
    "catalog.json": {
        "seasonal": {"ppna": ["2025-01-01", "2025-01-17"]},
        "indicators": {"rh": {"years": [2020, 2021]}, "csue": {"years": None}},
    },
    "divisions/seccionales.geojson": {
        "type": "FeatureCollection",
        "features": [{"properties": {"id": "0101"}}, {"properties": {"id": "0102"}}],
    },
    "series/seccionales/0101.json": {"ppna": [10.5, None], "et": [1.0]},
    "values/seccionales/rh.json": {"years": [2020, 2021], "values": {"0101": [300.0, None]}},
    "values/seccionales/csue.json": {"years": None, "values": {"0101": {"mean": 1.0, "p25": 0.5, "p75": 2.0}}},
    "values/seccionales/compn.json": {"years": None, "values": {"0101": {"3": 12.0}, "0102": None}},
}


@pytest.fixture
def source(tmp_path: Path) -> PublicFiles:
    for name, content in FILES.items():
        (tmp_path / name).parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / name).write_text(json.dumps(content))
    return PublicFiles(LocalFiles(tmp_path))


def test_the_calendars_and_years_come_from_the_catalog(source: PublicFiles) -> None:
    assert source.composites(Indicator.PPNA) == [date(2025, 1, 1), date(2025, 1, 17)]
    assert source.years(Indicator.RH) == [2020, 2021]
    assert source.years(Indicator.CSUE) == []


def test_composites_come_from_each_zones_series(source: PublicFiles) -> None:
    values = source.composite_values(Division.SECCIONALES, Indicator.PPNA, [date(2025, 1, 17), date(2025, 1, 1)])

    # Zone 0102 has no series file: it has no composites.
    assert values == {"0101": {date(2025, 1, 17): None, date(2025, 1, 1): 10.5}}


def test_years_and_summaries_come_from_the_values_files(source: PublicFiles) -> None:
    assert source.year_values(Division.SECCIONALES, Indicator.RH, [2021]) == {"0101": {2021: None}}
    assert source.summary(Division.SECCIONALES, Indicator.CSUE) == {"0101": {"mean": 1.0, "p25": 0.5, "p75": 2.0}}
    assert source.summary(Division.SECCIONALES, Indicator.COMPN) == {"0101": {"3": 12.0}}
