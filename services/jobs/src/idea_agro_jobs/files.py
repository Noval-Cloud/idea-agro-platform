"""Where the public files are read from and written to: the API's bucket, or a local folder."""

from collections.abc import Callable
from pathlib import Path
from typing import Protocol

from google.api_core.exceptions import NotFound, PreconditionFailed
from google.cloud import storage  # pyright: ignore[reportMissingTypeStubs]

MEDIA_TYPES = {".json": "application/json", ".geojson": "application/geo+json", ".webp": "image/webp"}


def media_type(name: str) -> str:
    return MEDIA_TYPES[Path(name).suffix]


class Files(Protocol):
    def read(self, name: str) -> bytes | None:
        """The file's bytes, or None when it does not exist."""
        ...

    def exists(self, name: str) -> bool: ...

    def write(self, name: str, content: bytes) -> None: ...

    def update(self, name: str, change: Callable[[bytes | None], bytes]) -> None:
        """Rewrites the file from its current content, even when another run writes it meanwhile."""
        ...


class LocalFiles:
    def __init__(self, root: Path) -> None:
        self._root = root

    def read(self, name: str) -> bytes | None:
        path = self._root / name
        return path.read_bytes() if path.is_file() else None

    def exists(self, name: str) -> bool:
        return (self._root / name).is_file()

    def write(self, name: str, content: bytes) -> None:
        path = self._root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)

    def update(self, name: str, change: Callable[[bytes | None], bytes]) -> None:
        self.write(name, change(self.read(name)))


# google-cloud-storage is only partly typed; this class is its only user.
class BucketFiles:
    ATTEMPTS = 5

    def __init__(self, bucket: str) -> None:
        self._bucket = storage.Client().bucket(bucket)  # pyright: ignore[reportUnknownMemberType]

    def read(self, name: str) -> bytes | None:
        try:
            return self._bucket.blob(name).download_as_bytes()  # pyright: ignore[reportUnknownMemberType]
        except NotFound:
            return None

    def exists(self, name: str) -> bool:
        return bool(self._bucket.blob(name).exists())  # pyright: ignore[reportUnknownMemberType]

    def write(self, name: str, content: bytes) -> None:
        self._bucket.blob(name).upload_from_string(content, content_type=media_type(name))  # pyright: ignore[reportUnknownMemberType]

    def update(self, name: str, change: Callable[[bytes | None], bytes]) -> None:
        for _ in range(self.ATTEMPTS):
            blob = self._bucket.get_blob(name)  # pyright: ignore[reportUnknownMemberType]
            # Generation 0 means the file must not exist yet.
            generation = (blob.generation or 0) if blob else 0  # pyright: ignore[reportUnknownMemberType]
            try:
                current = blob.download_as_bytes(if_generation_match=generation) if blob else None  # pyright: ignore[reportUnknownMemberType]
                self._bucket.blob(name).upload_from_string(  # pyright: ignore[reportUnknownMemberType]
                    change(current), content_type=media_type(name), if_generation_match=generation
                )
                return
            except PreconditionFailed:
                continue
        raise RuntimeError(f"{name} kept changing while it was updated")


def files_from(target: str) -> Files:
    """`gs://<bucket>` is Cloud Storage; any other value is a local folder."""
    if target.startswith("gs://"):
        return BucketFiles(target.removeprefix("gs://").rstrip("/"))
    return LocalFiles(Path(target))
