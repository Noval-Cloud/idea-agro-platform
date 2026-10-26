"""The saved task: each saved zone's seasonal series, kept next to its outline in the API's private bucket.

An outline is `zones/<zone>/<version>.geojson`, a GeoJSON geometry that never changes once written; its series is
`zones/<zone>/<version>.series.json`, each seasonal indicator's value by composite start. A run adds the composites
a series lacks, and deletes the series whose outline is gone.
"""

import json
import logging
from datetime import date
from typing import Any, Protocol, cast

from idea_agro_jobs.domain import SEASONAL, Indicator
from idea_agro_jobs.files import Files
from idea_agro_jobs.values import encode

log = logging.getLogger(__name__)

PREFIX = "zones/"
OUTLINE = ".geojson"
SERIES = ".series.json"

type Series = dict[str, dict[str, float | None]]


class OutlineSource(Protocol):
    def composites(self, indicator: Indicator) -> list[date]: ...

    def outline_values(
        self, indicator: Indicator, outline: dict[str, Any], starts: list[date]
    ) -> dict[date, float | None]: ...


def series_name(outline: str) -> str:
    return outline.removesuffix(OUTLINE) + SERIES


def refresh(source: OutlineSource, files: Files) -> None:
    names = files.names(PREFIX)
    outlines = [name for name in names if name.endswith(OUTLINE)]
    available = {indicator: source.composites(indicator) for indicator in SEASONAL}
    updated = 0
    for outline in outlines:
        name = series_name(outline)
        content = files.read(name)
        series = cast(Series, json.loads(content)) if content else {}
        missing = {
            indicator: [start for start in available[indicator] if start.isoformat() not in series.get(indicator, {})]
            for indicator in SEASONAL
        }
        if not any(missing.values()):
            continue
        geometry = files.read(outline)
        if geometry is None:
            continue
        try:
            for indicator, starts in missing.items():
                if starts:
                    found = source.outline_values(indicator, json.loads(geometry), starts)
                    series.setdefault(indicator, {}).update({start.isoformat(): v for start, v in found.items()})
        except Exception:
            # One outline Earth Engine cannot read must not hold back the others; the next run tries again.
            log.warning("saved: %s could not be computed", outline, exc_info=True)
            continue
        files.write(name, encode(series))
        updated += 1
    kept = {series_name(outline) for outline in outlines}
    gone = [name for name in names if name.endswith(SERIES) and name not in kept]
    for name in gone:
        files.delete(name)
    log.info(
        "saved: %d of %d outlines updated, %d series of removed outlines deleted", updated, len(outlines), len(gone)
    )
