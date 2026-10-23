"""Where saved zones' outlines live: one file per version, under a name of its own, never changed once written."""

import uuid
from contextlib import suppress
from typing import Protocol

from google.api_core.exceptions import NotFound
from google.cloud import storage  # pyright: ignore[reportMissingTypeStubs]


def new_file(zone: str, version: int) -> str:
    """A name no other write uses, so concurrent or failed writes never block each other."""
    return f"zones/{zone}/v{version}-{uuid.uuid4().hex[:12]}.geojson"


class GeometryStore(Protocol):
    def put(self, name: str, content: bytes) -> None: ...

    def get(self, name: str) -> bytes | None: ...

    def delete(self, name: str) -> None: ...

    def delete_all(self, zone: str) -> None:
        """Every file of the zone."""
        ...


class MemoryGeometries:
    def __init__(self) -> None:
        self._files: dict[str, bytes] = {}

    def put(self, name: str, content: bytes) -> None:
        self._files[name] = content

    def get(self, name: str) -> bytes | None:
        return self._files.get(name)

    def delete(self, name: str) -> None:
        self._files.pop(name, None)

    def delete_all(self, zone: str) -> None:
        for name in [n for n in self._files if n.startswith(f"zones/{zone}/")]:
            del self._files[name]


# google-cloud-storage is only partly typed; this class is its only user here.
class BucketGeometries:
    def __init__(self, bucket: str) -> None:
        self._bucket = storage.Client().bucket(bucket)  # pyright: ignore[reportUnknownMemberType]

    def put(self, name: str, content: bytes) -> None:
        blob = self._bucket.blob(name)  # pyright: ignore[reportUnknownMemberType]
        # Written once: the name is new, and nothing may replace it.
        blob.upload_from_string(content, content_type="application/geo+json", if_generation_match=0)  # pyright: ignore[reportUnknownMemberType]

    def get(self, name: str) -> bytes | None:
        try:
            return self._bucket.blob(name).download_as_bytes()  # pyright: ignore[reportUnknownMemberType]
        except NotFound:
            return None

    def delete(self, name: str) -> None:
        with suppress(NotFound):
            self._bucket.blob(name).delete()  # pyright: ignore[reportUnknownMemberType]

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
