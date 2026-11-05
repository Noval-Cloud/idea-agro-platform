import logging
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

import pytest
from earth_offline import offline_earth
from idea_agro_jobs.collection import COLLECTIONS, StoredImage
from idea_agro_jobs.comparison import (
    CHUNK,
    DIVISION,
    PIXELS,
    SEED,
    ZONE_SCALE,
    Composite,
    Pair,
    Stats,
    compare,
    pairs,
    stats,
)
from idea_agro_jobs.domain import Division, Indicator
from idea_agro_jobs.files import LocalFiles

ET = COLLECTIONS[Indicator.ET]
NOW = datetime(2026, 11, 6, 10, 30, 5, tzinfo=UTC)
NEW = "projects/pastizalesrou/assets/idea-agro/et"


def test_statistics_count_values_in_only_one_and_differences_within_the_tolerance() -> None:
    found = stats([(1.0, 1.004), (2.0, 2.5), (3.0, None), (None, 4.0), (None, None)], 0.01)

    assert found.sampled == 4
    assert (found.only_old, found.only_new) == (1, 1)
    assert found.mean_abs == pytest.approx(0.252)
    assert found.max_abs == pytest.approx(0.5)
    assert found.within == 0.25


def test_statistics_of_nothing_are_empty() -> None:
    assert stats([(None, None)], 0.01) == Stats(0, 0, 0, None, None, None)


def test_pairs_are_read_by_position() -> None:
    composites = [Composite(date(2024, 1, 1), "b2024-1", "x/2024_01_01"), Composite(date(2024, 1, 9), "b2024-9", "y")]
    rows = [{"o0": 1.0, "n0": 1.5, "o1": 2, "n1": None}, {"codcuenca": 4, "o1": 3.0}]

    assert pairs(rows, composites) == {
        date(2024, 1, 1): [(1.0, 1.5), (None, None)],
        date(2024, 1, 9): [(2.0, None), (3.0, None)],
    }


class FakeEarth:
    """The old asset holds 2023-12-27 to 2024-01-25, the collection 2024-01-01 to 2024-02-02; 2024-01-09 differs."""

    def __init__(self) -> None:
        self.read: list[tuple[str, list[date]]] = []

    def asset_composites(self, asset: str) -> dict[date, str]:
        starts = [date(2023, 12, 27), date(2024, 1, 1), date(2024, 1, 9), date(2024, 1, 17), date(2024, 1, 25)]
        return {start: f"b{start.year}-{start.timetuple().tm_yday}" for start in starts}

    def collection_images(self, asset: str) -> list[StoredImage]:
        starts = [date(2024, 1, 1), date(2024, 1, 9), date(2024, 1, 17), date(2024, 1, 25), date(2024, 2, 2)]
        return [StoredImage(f"{asset}/{start:%Y_%m_%d}", start, frozenset()) for start in starts]

    def _pairs(self, kind: str, composites: list[Composite]) -> dict[date, list[Pair]]:
        self.read.append((kind, [composite.start for composite in composites]))
        return {
            c.start: [(1.0, 1.2), (2.0, 2.0)] if c.start == date(2024, 1, 9) else [(1.0, 1.0), (2.0, 2.005)]
            for c in composites
        }

    def zone_pairs(
        self, old: str, composites: list[Composite], division: Division, scale: int
    ) -> dict[date, list[Pair]]:
        assert (division, scale) == (DIVISION, ZONE_SCALE)
        return self._pairs("zones", composites)

    def pixel_pairs(self, old: str, composites: list[Composite], count: int, seed: int) -> dict[date, list[Pair]]:
        assert (count, seed) == (PIXELS, SEED)
        return self._pairs("pixels", composites)


def test_a_year_is_compared_into_a_report_kept_with_the_earlier_ones(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    files = LocalFiles(tmp_path)
    earth = FakeEarth()

    with caplog.at_level(logging.INFO):
        names = compare(earth, files, [ET], since=date(2024, 1, 1), until=date(2024, 12, 31), now=NOW)

    assert names == ["jobs/comparisons/et/2024-01-01_2024-12-31_20261106T103005Z.md"]
    report = (tmp_path / names[0]).read_text()
    assert report.startswith(f"# et: `{ET.current}` against `{NEW}`\n")
    assert "- Composites: 4 in both, 0 only in the old asset, 1 only in the collection." in report
    assert "- Zones within the tolerance: 87.5%, the lowest 50.0% on 2024-01-09; largest difference 0.2000." in report
    assert "| 2024-01-01 | 2 | 100.0% | 0.0025 | 0.0050 | 0 | 0 | 2 | 100.0% | 0.0025 | 0.0050 | 0 | 0 |" in report
    assert "| 2024-01-09 | 2 | 50.0% | 0.1000 | 0.2000 | 0 | 0 |" in report
    assert "| 2024-02-02 | Only in the collection |" in report
    # Only the composites in both are read, and the one before the range is left out.
    both = [date(2024, 1, 1), date(2024, 1, 9), date(2024, 1, 17), date(2024, 1, 25)]
    assert earth.read == [("zones", both), ("pixels", both)]
    assert "4 composites in both, 1 in only one; within 0.01 mm/day: zones 87.5%, pixels 87.5%" in caplog.text
    assert caplog.records[-1].levelno == logging.WARNING

    later = compare(earth, files, [ET], since=date(2024, 1, 1), until=date(2024, 12, 31), now=NOW.replace(hour=11))
    assert sorted(files.names("jobs/comparisons/et/")) == sorted(names + later)


def test_other_assets_can_be_compared(tmp_path: Path) -> None:
    earth = FakeEarth()

    [name] = compare(earth, LocalFiles(tmp_path), [ET], old="old", new="new", now=NOW)

    assert name == "jobs/comparisons/et/2001-01-01_2026-11-06_20261106T103005Z.md"
    assert (tmp_path / name).read_text().startswith("# et: `old` against `new`\n")
    assert "| 2023-12-27 | Only in the old asset |" in (tmp_path / name).read_text()


def test_composites_are_read_a_few_at_a_time(tmp_path: Path) -> None:
    assert CHUNK >= 2

    class Many(FakeEarth):
        def asset_composites(self, asset: str) -> dict[date, str]:
            return {date(2024, 1, 1 + n): f"b2024-{1 + n}" for n in range(CHUNK + 1)}

        def collection_images(self, asset: str) -> list[StoredImage]:
            return [StoredImage(f"{n}", date(2024, 1, 1 + n), frozenset()) for n in range(CHUNK + 1)]

    earth = Many()
    compare(earth, LocalFiles(tmp_path), [ET], now=NOW)

    assert [len(starts) for kind, starts in earth.read if kind == "zones"] == [CHUNK, 1]


def test_earth_engine_reads_zones_and_pixels_of_both() -> None:
    graphs: list[str] = []

    def compute(computed: Any) -> dict[str, Any]:
        graphs.append(computed.serialize())
        return {"features": [{"properties": {"o0": 1.0, "n0": 1.25}}, {"properties": {"o0": 2.0}}]}

    composites = [Composite(date(2024, 1, 9), "b2024-9", f"{NEW}/2024_01_09")]
    with offline_earth(computeValue=compute) as earth:
        zones = earth.zone_pairs(ET.current, composites, DIVISION, ZONE_SCALE)
        pixels = earth.pixel_pairs(ET.current, composites, PIXELS, SEED)

    assert zones == pixels == {date(2024, 1, 9): [(1.0, 1.25), (2.0, None)]}
    for graph in graphs:
        assert ET.current in graph
        assert f"{NEW}/2024_01_09" in graph
        assert '"b2024-9"' in graph
    assert "Seccionales_Policiales" in graphs[0]
    assert "limite_oficial_rou_km2" in graphs[1]
    assert f'"constantValue": {PIXELS}' in graphs[1]
