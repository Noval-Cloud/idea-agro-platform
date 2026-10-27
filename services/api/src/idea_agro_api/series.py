"""A zone's seasonal series: one file per zone in the public bucket, built from BigQuery when missing or behind."""

import json
import logging
from collections.abc import Iterable
from datetime import date
from typing import Protocol, cast

from google.api_core.exceptions import GoogleAPIError
from google.cloud import bigquery

from idea_agro_api import public_data
from idea_agro_api.public_data import CATALOG, PublicData
from idea_agro_api.zones import Division, Files, SeasonalIndicator

log = logging.getLogger(__name__)

type Series = tuple[list[date], list[float | None]]
type Composites = dict[SeasonalIndicator, dict[date, float | None]]


class ValueSource(Protocol):
    def composites(self, division: Division, zone: str) -> Composites:
        """The zone's value of every composite, by indicator; empty when the zone has none."""
        ...


class BigQueryValues:
    """The `composites` table the data jobs keep."""

    def __init__(self, project: str, dataset: str) -> None:
        self._client = bigquery.Client(project=project)
        self._table = f"{project}.{dataset}.composites"

    def composites(self, division: Division, zone: str) -> Composites:
        rows = self._client.query_and_wait(  # pyright: ignore[reportUnknownMemberType]
            f"SELECT indicator, start, value FROM `{self._table}` WHERE division = @division AND zone = @zone",
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("division", "STRING", division),
                    bigquery.ScalarQueryParameter("zone", "STRING", zone),
                ]
            ),
        )
        found: Composites = {}
        for row in cast(Iterable[bigquery.Row], rows):
            if row["indicator"] in SeasonalIndicator:
                found.setdefault(SeasonalIndicator(row["indicator"]), {})[row["start"]] = row["value"]
        return found


def values_from(source: str) -> ValueSource | None:
    """`bigquery://<project>/<dataset>`, or `none` to serve the files as they are."""
    if source == "none":
        return None
    project, _, dataset = source.removeprefix("bigquery://").partition("/")
    if not source.startswith("bigquery://") or not project or not dataset:
        raise ValueError(f"Not a value source: {source}")
    return BigQueryValues(project, dataset)


class ZoneStore:
    """Whether a zone exists, and its seasonal series aligned with the catalog's calendars."""

    def __init__(self, files: Files, values: ValueSource | None = None) -> None:
        self._files = files
        self._data = PublicData(files)
        self._values = values

    def calendar(self) -> dict[SeasonalIndicator, list[date]]:
        catalog = self._data.read(CATALOG)
        if catalog is None:
            raise RuntimeError("The public data has no catalog.json")
        dates = cast(dict[str, list[str]], json.loads(catalog)["seasonal"])
        # An indicator the job has not published yet has no composites.
        return {i: [date.fromisoformat(d) for d in dates.get(i, [])] for i in SeasonalIndicator}

    def exists(self, division: Division, zone: str) -> bool:
        return self._files.read(public_data.zone(division, zone)) is not None

    def seasonal(self, division: Division, zone: str) -> dict[SeasonalIndicator, Series] | None:
        """Each indicator's dates and values in the zone, or None when the zone does not exist."""
        calendar = self.calendar()
        name = public_data.series(division, zone)
        content = self._files.read(name)
        stored = cast(dict[str, list[float | None]], json.loads(content)) if content else None
        # A file shorter than a calendar, or without one of its indicators, was written before the catalog had them.
        behind = stored is None or any(len(stored.get(i, [])) < len(calendar[i]) for i in SeasonalIndicator)
        if behind and self._values:
            try:
                composites = self._values.composites(division, zone)
            except GoogleAPIError:
                if stored is None:
                    raise
                log.exception("Serving %s as it is: its values could not be read", name)
            else:
                if not composites:
                    return None
                # Every indicator is kept, so a zone without data for one is not read again on each request.
                stored = {i: [composites.get(i, {}).get(day) for day in calendar[i]] for i in SeasonalIndicator}
                self._files.write(name, json.dumps(stored, separators=(",", ":")).encode())
        if stored is None:
            return None
        series: dict[SeasonalIndicator, Series] = {}
        for indicator in SeasonalIndicator:
            dates = calendar[indicator]
            values = stored.get(indicator, [])[: len(dates)]
            if any(value is not None for value in values):
                series[indicator] = (dates, values + [None] * (len(dates) - len(values)))
        return series
