"""Where the values task gets the zones' values from."""

import json
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from typing import Any, Protocol, cast

from idea_agro_jobs.domain import Division, Indicator, ZoneValues
from idea_agro_jobs.files import Files


class Source(Protocol):
    def composites(self, indicator: Indicator) -> list[date]:
        """The start dates of the indicator's composites, in order."""
        ...

    def years(self, indicator: Indicator) -> list[int]:
        """The indicator's complete years, in order."""
        ...

    def composite_values(self, division: Division, indicator: Indicator, starts: list[date]) -> ZoneValues: ...

    def year_values(self, division: Division, indicator: Indicator, years: list[int]) -> ZoneValues: ...

    def summary(self, division: Division, indicator: Indicator) -> ZoneValues:
        """The indicator's statistics in each zone, for an indicator measured once."""
        ...


class PublicFiles:
    """The values the public files hold: those of the prototype, until Earth Engine computes them."""

    READERS = 16

    def __init__(self, files: Files) -> None:
        self._files = files
        self._catalog: dict[str, Any] | None = None
        # One division's series at a time: the task asks for them division by division.
        self._series: tuple[Division, dict[str, dict[str, list[float | None]]]] | None = None

    def _json(self, name: str, default: Any = None) -> Any:
        content = self._files.read(name)
        if content is None:
            if default is not None:
                return default
            raise FileNotFoundError(name)
        return json.loads(content)

    def _read_catalog(self) -> dict[str, Any]:
        if self._catalog is None:
            self._catalog = cast(dict[str, Any], self._json("catalog.json"))
        return self._catalog

    def composites(self, indicator: Indicator) -> list[date]:
        return [date.fromisoformat(d) for d in self._read_catalog()["seasonal"].get(indicator, [])]

    def years(self, indicator: Indicator) -> list[int]:
        return list(self._read_catalog()["indicators"][indicator]["years"] or [])

    def _division_series(self, division: Division) -> dict[str, dict[str, list[float | None]]]:
        if self._series is None or self._series[0] != division:
            # A division the prototype did not have has no files, and so no values.
            empty: dict[str, list[Any]] = {"features": []}
            features = cast(list[dict[str, Any]], self._json(f"divisions/{division}.geojson", empty)["features"])
            zones = [str(f["properties"]["id"]) for f in features]

            def read(zone: str) -> bytes | None:
                return self._files.read(f"series/{division}/{zone}.json")

            with ThreadPoolExecutor(self.READERS) as pool:
                contents = list(pool.map(read, zones))
            self._series = (division, {z: json.loads(c) for z, c in zip(zones, contents, strict=True) if c})
        return self._series[1]

    def composite_values(self, division: Division, indicator: Indicator, starts: list[date]) -> ZoneValues:
        position = {start: i for i, start in enumerate(self.composites(indicator))}
        return {
            zone: {start: series[indicator][position[start]] for start in starts}
            for zone, series in self._division_series(division).items()
            if indicator in series
        }

    def _values(self, division: Division, indicator: Indicator) -> dict[str, Any]:
        return cast(dict[str, Any], self._json(f"values/{division}/{indicator}.json", {"years": [], "values": {}}))

    def year_values(self, division: Division, indicator: Indicator, years: list[int]) -> ZoneValues:
        file = self._values(division, indicator)
        position = {year: i for i, year in enumerate(file["years"])}
        values: ZoneValues = {}
        for zone, row in cast(dict[str, list[float | None]], file["values"]).items():
            values[zone] = {year: row[position[year]] for year in years}
        return values

    def summary(self, division: Division, indicator: Indicator) -> ZoneValues:
        values: ZoneValues = {}
        zones = cast(dict[str, dict[str, float | None] | None], self._values(division, indicator)["values"])
        for zone, statistics in zones.items():
            if statistics:
                values[zone] = {statistic: value for statistic, value in statistics.items()}
        return values
