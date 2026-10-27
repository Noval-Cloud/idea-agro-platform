"""The divisions and departments zones belong to, and where the public files are read from."""

from enum import StrEnum
from pathlib import Path
from typing import Protocol

from google.api_core.exceptions import NotFound
from google.cloud import storage  # pyright: ignore[reportMissingTypeStubs]


class Division(StrEnum):
    """A predefined division of Uruguay into zones; `uruguay` is the whole country as one zone, `1`."""

    SECCIONALES = "seccionales"
    CUENCAS_1 = "cuencas-1"
    CUENCAS_2 = "cuencas-2"
    CUENCAS_3 = "cuencas-3"
    CUENCAS_4 = "cuencas-4"
    CUENCAS_5 = "cuencas-5"
    URUGUAY = "uruguay"


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
    RH = "rh"


class Files(Protocol):
    def read(self, name: str) -> bytes | None:
        """The file's bytes, or None when it does not exist."""
        ...

    def write(self, name: str, content: bytes) -> None: ...


class LocalFiles:
    def __init__(self, root: Path) -> None:
        self._root = root

    def read(self, name: str) -> bytes | None:
        path = self._root / name
        return path.read_bytes() if path.is_file() else None

    def write(self, name: str, content: bytes) -> None:
        path = self._root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)


# google-cloud-storage is only partly typed; this class is its only user.
class BucketFiles:
    def __init__(self, bucket: str) -> None:
        self._bucket = storage.Client().bucket(bucket)  # pyright: ignore[reportUnknownMemberType]

    def read(self, name: str) -> bytes | None:
        try:
            return self._bucket.blob(name).download_as_bytes()  # pyright: ignore[reportUnknownMemberType]
        except NotFound:
            return None

    def write(self, name: str, content: bytes) -> None:
        self._bucket.blob(name).upload_from_string(content, content_type="application/json")  # pyright: ignore[reportUnknownMemberType]


def files_from(source: str) -> Files:
    """`gs://<bucket>` reads from Cloud Storage; any other value is a local folder."""
    if source.startswith("gs://"):
        return BucketFiles(source.removeprefix("gs://").rstrip("/"))
    return LocalFiles(Path(source))
