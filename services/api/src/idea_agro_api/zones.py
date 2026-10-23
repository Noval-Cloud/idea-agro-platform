"""The per-zone files the API serves: where they are read from and how they are shaped."""

import json
from datetime import date
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


class Department(StrEnum):
    """A department of Uruguay, as cadastral parcels are filed by."""

    ARTIGAS = "artigas"
    CANELONES = "canelones"
    CERRO_LARGO = "cerro-largo"
    COLONIA = "colonia"
    DURAZNO = "durazno"
    FLORES = "flores"
    FLORIDA = "florida"
    LAVALLEJA = "lavalleja"
    MALDONADO = "maldonado"
    MONTEVIDEO = "montevideo"
    PAYSANDU = "paysandu"
    RIO_NEGRO = "rio-negro"
    RIVERA = "rivera"
    ROCHA = "rocha"
    SALTO = "salto"
    SAN_JOSE = "san-jose"
    SORIANO = "soriano"
    TACUAREMBO = "tacuarembo"
    TREINTA_Y_TRES = "treinta-y-tres"


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


type Series = tuple[list[date], list[float | None]]


class ZoneStore:
    """The calendar in `catalog.json`, and one file per zone in `series/<division>/<zone>.json`."""

    def __init__(self, files: Files) -> None:
        self._files = files

    @cached_property
    def calendar(self) -> dict[SeasonalIndicator, list[date]]:
        catalog = self._files.read("catalog.json")
        if catalog is None:
            raise RuntimeError("The zone store has no catalog.json")
        dates = cast(dict[str, list[str]], json.loads(catalog)["seasonal"])
        return {indicator: [date.fromisoformat(d) for d in dates[indicator]] for indicator in SeasonalIndicator}

    def exists(self, division: Division, zone: str) -> bool:
        return self._files.read(f"series/{division}/{zone}.json") is not None

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
