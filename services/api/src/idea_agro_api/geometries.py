"""Where saved zones' outlines live: one file per version, never changed once written."""

from contextlib import suppress
from typing import Protocol

from google.api_core.exceptions import NotFound, PreconditionFailed
from google.cloud import storage  # pyright: ignore[reportMissingTypeStubs]


class VersionTaken(Exception):
    """That version of the outline exists already: someone else changed it first."""


class GeometryStore(Protocol):
    def put(self, zone: str, version: int, content: bytes) -> None:
        """Writes a new version, or raises VersionTaken."""
        ...

    def delete(self, zone: str, version: int) -> None: ...

    def get(self, zone: str, version: int) -> bytes | None: ...

    def delete_all(self, zone: str) -> None:
        """Every version of the zone."""
        ...


def _name(zone: str, version: int) -> str:
    return f"zones/{zone}/v{version}.geojson"


class MemoryGeometries:
    def __init__(self) -> None:
        self._files: dict[str, bytes] = {}

    def put(self, zone: str, version: int, content: bytes) -> None:
        if _name(zone, version) in self._files:
            raise VersionTaken
        self._files[_name(zone, version)] = content

    def delete(self, zone: str, version: int) -> None:
        self._files.pop(_name(zone, version), None)

    def get(self, zone: str, version: int) -> bytes | None:
        return self._files.get(_name(zone, version))

    def delete_all(self, zone: str) -> None:
        for name in [n for n in self._files if n.startswith(f"zones/{zone}/")]:
            del self._files[name]


# google-cloud-storage is only partly typed; this class is its only user here.
class BucketGeometries:
    def __init__(self, bucket: str) -> None:
        self._bucket = storage.Client().bucket(bucket)  # pyright: ignore[reportUnknownMemberType]

    def put(self, zone: str, version: int, content: bytes) -> None:
        blob = self._bucket.blob(_name(zone, version))  # pyright: ignore[reportUnknownMemberType]
        # Versions are written once: refuse to overwrite one that exists.
        try:
            blob.upload_from_string(content, content_type="application/geo+json", if_generation_match=0)  # pyright: ignore[reportUnknownMemberType]
        except PreconditionFailed as error:
            raise VersionTaken from error

    def delete(self, zone: str, version: int) -> None:
        with suppress(NotFound):
            self._bucket.blob(_name(zone, version)).delete()  # pyright: ignore[reportUnknownMemberType]

    def get(self, zone: str, version: int) -> bytes | None:
        try:
            return self._bucket.blob(_name(zone, version)).download_as_bytes()  # pyright: ignore[reportUnknownMemberType]
        except NotFound:
            return None

    def delete_all(self, zone: str) -> None:
        for blob in self._bucket.list_blobs(prefix=f"zones/{zone}/"):  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
            blob.delete()  # pyright: ignore[reportUnknownMemberType]


def geometries_from(source: str) -> GeometryStore:
    """`gs://<bucket>`, or `memory://` for a store that lives as long as the process."""
    if source.startswith("gs://"):
        return BucketGeometries(source.removeprefix("gs://").rstrip("/"))
    if source == "memory://":
        return MemoryGeometries()
    raise ValueError(f"Unknown geometries source: {source}")
