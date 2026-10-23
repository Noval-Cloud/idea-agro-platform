"""The per-zone files the API serves: where they are read from and how they are shaped."""

import json
from datetime import date, timedelta
from enum import StrEnum
from functools import cached_property
from pathlib import Path
from typing import Protocol, cast

from google.api_core.exceptions import NotFound
from google.cloud import storage  # pyright: ignore[reportMissingTypeStubs]


class Division(StrEnum):
    """A predefined division of Uruguay into zones."""

    SECCIONALES = "seccionales"
    CUENCAS_1 = "cuencas-1"
    CUENCAS_2 = "cuencas-2"
    CUENCAS_3 = "cuencas-3"
    CUENCAS_4 = "cuencas-4"
    CUENCAS_5 = "cuencas-5"


class SeasonalIndicator(StrEnum):
    """An indicator with a seasonal series per zone."""

    PPNA = "ppna"
    APAR = "apar"
    ET = "et"


class Files(Protocol):
    def read(self, name: str) -> bytes | None:
        """The file's bytes, or None when it does not exist."""
        ...


class LocalFiles:
    def __init__(self, root: Path) -> None:
        self._root = root

    def read(self, name: str) -> bytes | None:
        path = self._root / name
        return path.read_bytes() if path.is_file() else None


# google-cloud-storage is only partly typed; this class is its only user.
class BucketFiles:
    def __init__(self, bucket: str) -> None:
        self._bucket = storage.Client().bucket(bucket)  # pyright: ignore[reportUnknownMemberType]

    def read(self, name: str) -> bytes | None:
        try:
            return self._bucket.blob(name).download_as_bytes()  # pyright: ignore[reportUnknownMemberType]
        except NotFound:
            return None


def files_from(source: str) -> Files:
    """`gs://<bucket>` reads from Cloud Storage; any other value is a local folder."""
    if source.startswith("gs://"):
        return BucketFiles(source.removeprefix("gs://").rstrip("/"))
    return LocalFiles(Path(source))


def composite_start(band: str) -> date:
    """The first day of a composite: `b2001-17` starts on day 17 of 2001."""
    year, day = band.removeprefix("b").split("-")
    return date(int(year), 1, 1) + timedelta(days=int(day) - 1)


type Series = tuple[list[date], list[float | None]]


class ZoneStore:
    """The calendar in `manifest.json`, and one file per zone in `series/<division>/<zone>.json`."""

    def __init__(self, files: Files) -> None:
        self._files = files

    @cached_property
    def calendar(self) -> dict[SeasonalIndicator, list[date]]:
        manifest = self._files.read("manifest.json")
        if manifest is None:
            raise RuntimeError("The zone store has no manifest.json")
        bands = cast(dict[str, list[str]], json.loads(manifest)["seasonal"])
        return {indicator: [composite_start(band) for band in bands[indicator]] for indicator in SeasonalIndicator}

    def seasonal(self, division: Division, zone: str) -> dict[SeasonalIndicator, Series] | None:
        """Each indicator's dates and values in the zone, or None when the zone does not exist."""
        content = self._files.read(f"series/{division}/{zone}.json")
        if content is None:
            return None
        values = cast(dict[str, list[float | None]], json.loads(content))
        return {
            indicator: (self.calendar[indicator], values[indicator])
            for indicator in SeasonalIndicator
            if indicator in values
        }
