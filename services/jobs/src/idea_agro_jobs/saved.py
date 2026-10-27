"""The saved task: each saved zone's seasonal series, kept next to its outline in the API's private bucket.

An outline is `zones/<zone>/<version>.geojson`, a GeoJSON geometry that never changes once written; its series is
`zones/<zone>/<version>.series.json`, each seasonal indicator's value by composite start. A run adds the composites
the current outlines' series lack, and deletes the series whose outline is gone.
"""

import json
import logging
import re
from collections.abc import Iterable
from datetime import date
from typing import Any, Protocol, cast

from idea_agro_jobs.domain import SEASONAL, Indicator
from idea_agro_jobs.files import Files
from idea_agro_jobs.values import encode

log = logging.getLogger(__name__)

PREFIX = "zones/"
OUTLINE = ".geojson"
SERIES = ".series.json"
# `zones/<zone>/v<version>-<id>.geojson`, as the API names outlines.
VERSION = re.compile(r"zones/([^/]+)/v(\d+)-[^/]+\.geojson")

type Series = dict[str, dict[str, float | None]]


class OutlineSource(Protocol):
    def composites(self, indicator: Indicator) -> list[date]: ...

    def outline_values(
        self, indicator: Indicator, outline: dict[str, Any], starts: list[date]
    ) -> dict[date, float | None]: ...


def series_name(outline: str) -> str:
    return outline.removesuffix(OUTLINE) + SERIES


def current(outlines: list[str]) -> list[str]:
    """Each zone's latest version: the one the API serves. Earlier versions keep the series they had."""
    versions = {outline: match for outline in outlines if (match := VERSION.fullmatch(outline))}
    latest: dict[str, int] = {}
    for match in versions.values():
        latest[match[1]] = max(latest.get(match[1], 0), int(match[2]))
    return [outline for outline, match in versions.items() if int(match[2]) == latest[match[1]]]


def refresh(
    source: OutlineSource, files: Files, only: list[str] | None = None, recompute: Iterable[Indicator] = ()
) -> None:
    """Every zone's current outline, or `only` those outlines (the ones the API just wrote).

    An indicator to `recompute`, whose asset history was rewritten, is computed again for each outline.
    """
    redone = set(recompute)
    names = files.names(PREFIX)
    outlines = [name for name in names if name.endswith(OUTLINE)]
    chosen = [outline for outline in outlines if outline in only] if only else current(outlines)
    available = {indicator: source.composites(indicator) for indicator in SEASONAL}
    updated = 0
    for outline in chosen:
        name = series_name(outline)
        content = files.read(name)
        series = cast(Series, json.loads(content)) if content else {}
        series = {indicator: values for indicator, values in series.items() if indicator not in redone}
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
            # An error alerts; the other outlines go on, and the next run tries this one again.
            log.exception("saved: %s could not be computed", outline)
            continue
        files.write(name, encode(series))
        updated += 1
    gone: list[str] = []
    if not only:
        kept = {series_name(outline) for outline in outlines}
        gone = [name for name in names if name.endswith(SERIES) and name not in kept]
        for name in gone:
            files.delete(name)
    log.info("saved: %d of %d outlines updated, %d series of removed outlines deleted", updated, len(chosen), len(gone))
