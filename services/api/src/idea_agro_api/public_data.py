"""The public data the API serves as it is stored: the catalog, the divisions, their values, parcels and maps.

The data jobs write these files from Earth Engine; until they run, `scripts/seed_public_data.py` writes them from
the prototype's data. Large files are served as stored, without parsing them on every request.
"""

import time
from enum import StrEnum
from threading import Lock

from idea_agro_api.zones import Department, Division, Files


class Indicator(StrEnum):
    """An indicator with a map and values per zone."""

    APAR = "apar"
    COB = "cob"
    PPNA = "ppna"
    COMPN = "compn"
    RH = "rh"
    ET = "et"
    IOSE = "iose"
    DIVTFE = "divtfe"
    CSUE = "csue"
    AHPPN = "ahppn"


class MapSize(StrEnum):
    FULL = "full"
    LITE = "lite"


class Theme(StrEnum):
    LIGHT = "light"
    DARK = "dark"


CATALOG = "catalog.json"
ZONE_INDEX = "zone-index.json"
PADRON_INDEX = "padrones/index.json"


def division_zones(division: Division) -> str:
    return f"divisions/{division}.geojson"


def zone(division: Division, id: str) -> str:
    return f"divisions/{division}/{id}.json"


def series(division: Division, id: str) -> str:
    return f"series/{division}/{id}.json"


def values(division: Division, indicator: Indicator) -> str:
    return f"values/{division}/{indicator}.json"


def padrones(department: Department) -> str:
    return f"padrones/{department}.geojson"


def map_image(indicator: Indicator, period: str, size: MapSize) -> str:
    return f"maps/{indicator}/{'lite/' if size == MapSize.LITE else ''}{period}.webp"


def thumbnail(indicator: Indicator, theme: Theme) -> str:
    return f"maps/thumbnails/{indicator}-{theme}.webp"


class PublicData:
    """Reads the public files, keeping the small ones that every page asks for in memory for a while."""

    KEPT = frozenset({CATALOG, ZONE_INDEX, PADRON_INDEX})

    def __init__(self, files: Files, keep_seconds: float = 300) -> None:
        self._files = files
        self._keep_seconds = keep_seconds
        self._kept: dict[str, tuple[float, bytes | None]] = {}
        self._lock = Lock()

    def read(self, name: str) -> bytes | None:
        if name not in self.KEPT:
            return self._files.read(name)
        now = time.monotonic()
        with self._lock:
            kept = self._kept.get(name)
            if kept and now - kept[0] < self._keep_seconds:
                return kept[1]
        content = self._files.read(name)
        with self._lock:
            self._kept[name] = (now, content)
        return content
