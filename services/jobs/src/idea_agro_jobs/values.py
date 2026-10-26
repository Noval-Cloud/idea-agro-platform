"""The values task: adds to BigQuery the periods it is missing, then publishes the files the API serves from it."""

import json
import logging
from collections.abc import Callable, Iterable
from datetime import date, timedelta
from itertools import batched
from typing import Any, cast

from idea_agro_jobs.domain import SEASONAL, SUMMARIZED, YEARLY, Division, Indicator, Period, Table, ZoneValues
from idea_agro_jobs.files import Files
from idea_agro_jobs.sources import Source
from idea_agro_jobs.store import ValueStore

log = logging.getLogger(__name__)

CATALOG = "catalog.json"
# Periods computed at once: what one Earth Engine request handles for every zone of a division.
CHUNK = 100
# A seasonal indicator whose latest composite started longer ago than this has stopped arriving.
STALE_AFTER = timedelta(days=45)


def values_file(division: Division, indicator: Indicator) -> str:
    return f"values/{division}/{indicator}.json"


def encode(value: object) -> bytes:
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode()


def _add_missing[P: Period](
    store: ValueStore,
    table: Table,
    division: Division,
    indicator: Indicator,
    available: list[P],
    stored: set[Period],
    compute: Callable[[Division, Indicator, list[P]], ZoneValues],
) -> bool:
    missing = [period for period in available if period not in stored]
    for chunk in batched(missing, CHUNK, strict=False):
        store.add(table, division, indicator, compute(division, indicator, list(chunk)))
        log.info("%s %s %s: %d periods added, up to %s", table, division, indicator, len(chunk), chunk[-1])
    return bool(missing)


def year_file(values: ZoneValues) -> dict[str, Any]:
    years = sorted({cast(int, year) for periods in values.values() for year in periods})
    return {
        "years": years,
        "values": {zone: [values[zone].get(year) for year in years] for zone in sorted(values)},
    }


def summary_file(indicator: Indicator, values: ZoneValues) -> dict[str, Any]:
    if indicator == Indicator.COMPN:
        # Each class's share of the zone, by class.
        return {"years": None, "values": {zone: values[zone] for zone in sorted(values)}}
    return {
        "years": None,
        "values": {zone: {s: values[zone].get(s) for s in ("mean", "p25", "p75")} for zone in sorted(values)},
    }


def calendars(stored: dict[tuple[Division, Indicator], set[Period]]) -> dict[str, list[str]]:
    """The composites every division has, for each seasonal indicator."""
    calendar: dict[str, list[str]] = {}
    for indicator in SEASONAL:
        shared = set[Period].intersection(*(stored.get((division, indicator), set()) for division in Division))
        calendar[indicator.value] = [start.isoformat() for start in sorted(cast(Iterable[date], shared))]
    return calendar


def stale(calendar: dict[str, list[str]], today: date) -> list[str]:
    """The seasonal indicators with no composite started within `STALE_AFTER` of `today`."""
    return [i for i, starts in calendar.items() if not starts or today - date.fromisoformat(starts[-1]) > STALE_AFTER]


def refresh(source: Source, store: ValueStore, files: Files, today: date | None = None) -> None:
    composites = store.stored(Table.COMPOSITES)
    years = store.stored(Table.YEARS)
    summaries = store.stored(Table.SUMMARIES)
    for division in Division:
        for indicator in SEASONAL:
            _add_missing(
                store,
                Table.COMPOSITES,
                division,
                indicator,
                source.composites(indicator),
                composites.get((division, indicator), set()),
                source.composite_values,
            )
        for indicator in YEARLY:
            available = source.years(indicator)
            stored = years.get((division, indicator), set())
            if _add_missing(store, Table.YEARS, division, indicator, available, stored, source.year_values):
                content = year_file(store.read(Table.YEARS, division, indicator))
                files.write(values_file(division, indicator), encode(content))
        for indicator in SUMMARIZED:
            if (division, indicator) not in summaries:
                store.add(Table.SUMMARIES, division, indicator, source.summary(division, indicator))
                content = summary_file(indicator, store.read(Table.SUMMARIES, division, indicator))
                files.write(values_file(division, indicator), encode(content))
                log.info("%s %s %s: summarized", Table.SUMMARIES, division, indicator)

    # Only once every division has them do new composites reach the catalog, which the zone pages follow.
    calendar = calendars(store.stored(Table.COMPOSITES))

    def with_calendar(content: bytes | None) -> bytes:
        catalog = cast(dict[str, Any], json.loads(content)) if content else {}
        return encode(catalog | {"seasonal": calendar})

    files.update(CATALOG, with_calendar)
    log.info("catalog: %s", {indicator: len(dates) for indicator, dates in calendar.items()})
    # An error alerts by email (the jobs README says how).
    for indicator in stale(calendar, today or date.today()):
        latest = calendar[indicator][-1] if calendar[indicator] else "none"
        log.error("%s: no new composite for over %d days; the latest starts %s", indicator, STALE_AFTER.days, latest)
