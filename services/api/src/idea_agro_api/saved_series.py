"""A saved zone's seasonal series: the data job computes it for each outline file and keeps it next to it."""

import json
from datetime import date
from typing import cast

from idea_agro_api.geometries import GeometryStore
from idea_agro_api.series import Series
from idea_agro_api.zones import SeasonalIndicator


def series_file(outline: str) -> str:
    """`zones/<zone>/v2-<id>.geojson` has its series in `zones/<zone>/v2-<id>.series.json`."""
    return outline.removesuffix(".geojson") + ".series.json"


def saved_seasonal(
    geometries: GeometryStore, outline: str, calendar: dict[SeasonalIndicator, list[date]]
) -> dict[SeasonalIndicator, Series] | None:
    """Each indicator's values on the catalog's calendar, or None until the job has computed the outline."""
    content = geometries.get(series_file(outline))
    if content is None:
        return None
    stored = cast(dict[str, dict[str, float | None]], json.loads(content))
    return {
        indicator: (calendar[indicator], [stored[indicator].get(day.isoformat()) for day in calendar[indicator]])
        for indicator in SeasonalIndicator
        if indicator in stored
    }
