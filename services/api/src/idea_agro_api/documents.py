"""Documents kept with a saved zone, such as soil studies: their records, and their files in the private bucket."""

import unicodedata
import uuid
from contextlib import suppress
from dataclasses import dataclass
from datetime import datetime
from pathlib import PurePath
from typing import Any, Protocol, cast

from google.api_core.exceptions import NotFound
from google.cloud import firestore, storage  # pyright: ignore[reportMissingTypeStubs]

# What may be attached, by extension; files are served with the type their extension names, never the sender's.
MEDIA_TYPES = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".txt": "text/plain",
    ".csv": "text/csv",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xls": "application/vnd.ms-excel",
    ".ods": "application/vnd.oasis.opendocument.spreadsheet",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".odt": "application/vnd.oasis.opendocument.text",
}


# Already compressed, or nearly: the API sends them as they are.
COMPRESSED = (
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.oasis.opendocument.spreadsheet",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.oasis.opendocument.text",
)


def media_type(name: str) -> str | None:
    return MEDIA_TYPES.get(PurePath(name).suffix.lower())


def readable(name: str) -> bool:
    """No control or formatting characters, which break headers or disguise an extension."""
    return not any(unicodedata.category(c) in ("Cc", "Cf") for c in name)


@dataclass(frozen=True)
class Document:
    id: str
    zone: str
    owner: str
    name: str
    media_type: str
    size: int
    uploaded_at: datetime
    uploaded_by: str | None


def new_document_id() -> str:
    return str(uuid.uuid4())


def file_name(zone: str, document: str) -> str:
    """Under `documents/`, apart from the outlines the data job reads under `zones/`."""
    return f"documents/{zone}/{document}"


class DocumentStore(Protocol):
    def of_zone(self, zone: str) -> list[Document]:
        """Oldest first."""
        ...

    def bytes_of(self, owner: str) -> int:
        """What the owner's documents take in all."""
        ...

    def get(self, id: str) -> Document | None: ...

    def add(self, document: Document) -> None: ...

    def delete(self, id: str) -> None: ...

    def delete_zone(self, zone: str) -> None: ...


class MemoryDocuments:
    def __init__(self) -> None:
        self._documents: dict[str, Document] = {}

    def of_zone(self, zone: str) -> list[Document]:
        return sorted((d for d in self._documents.values() if d.zone == zone), key=lambda d: d.uploaded_at)

    def bytes_of(self, owner: str) -> int:
        return sum(d.size for d in self._documents.values() if d.owner == owner)

    def get(self, id: str) -> Document | None:
        return self._documents.get(id)

    def add(self, document: Document) -> None:
        self._documents[document.id] = document

    def delete(self, id: str) -> None:
        self._documents.pop(id, None)

    def delete_zone(self, zone: str) -> None:
        for id in [d.id for d in self._documents.values() if d.zone == zone]:
            del self._documents[id]


# google-cloud-firestore is only partly typed; this class is its only user here.
class FirestoreDocuments:
    def __init__(self, database: str) -> None:
        self._documents = firestore.Client(database=database).collection("zone_documents")  # pyright: ignore[reportUnknownMemberType]

    def _where(self, field: str, value: str) -> Any:
        return self._documents.where(filter=firestore.FieldFilter(field, "==", value))  # pyright: ignore[reportUnknownMemberType]

    def of_zone(self, zone: str) -> list[Document]:
        found = [_from_record(d.id, cast(dict[str, Any], d.to_dict())) for d in self._where("zone", zone).stream()]
        return sorted(found, key=lambda d: d.uploaded_at)

    def bytes_of(self, owner: str) -> int:
        # Adding them up here needs no composite index; an upload reads one record per document of the account.
        return sum(int(d.to_dict()["size"]) for d in self._where("owner", owner).select(["size"]).stream())

    def get(self, id: str) -> Document | None:
        record = self._documents.document(id).get()  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
        if not record.exists:  # pyright: ignore[reportUnknownMemberType]
            return None
        return _from_record(id, cast(dict[str, Any], record.to_dict()))  # pyright: ignore[reportUnknownMemberType]

    def add(self, document: Document) -> None:
        self._documents.document(document.id).create(_to_record(document))  # pyright: ignore[reportUnknownMemberType]

    def delete(self, id: str) -> None:
        self._documents.document(id).delete()  # pyright: ignore[reportUnknownMemberType]

    def delete_zone(self, zone: str) -> None:
        for record in self._where("zone", zone).stream():
            record.reference.delete()


def _to_record(document: Document) -> dict[str, Any]:
    return {
        "zone": document.zone,
        "owner": document.owner,
        "name": document.name,
        "media_type": document.media_type,
        "size": document.size,
        "uploaded_at": document.uploaded_at,
        "uploaded_by": document.uploaded_by,
    }


def _from_record(id: str, data: dict[str, Any]) -> Document:
    return Document(
        id=id,
        zone=data["zone"],
        owner=data["owner"],
        name=data["name"],
        media_type=data["media_type"],
        size=data["size"],
        uploaded_at=data["uploaded_at"],
        uploaded_by=data.get("uploaded_by"),
    )


def documents_from(source: str) -> DocumentStore:
    """`firestore://<database>`, or `memory://`."""
    if source.startswith("firestore://"):
        return FirestoreDocuments(source.removeprefix("firestore://"))
    if source == "memory://":
        return MemoryDocuments()
    raise ValueError(f"Unknown records source: {source}")


class DocumentFiles(Protocol):
    def put(self, name: str, content: bytes, media_type: str) -> None: ...

    def get(self, name: str) -> bytes | None: ...

    def delete(self, name: str) -> None: ...

    def delete_zone(self, zone: str) -> None: ...


class MemoryDocumentFiles:
    def __init__(self) -> None:
        self.files: dict[str, bytes] = {}

    def put(self, name: str, content: bytes, media_type: str) -> None:
        self.files[name] = content

    def get(self, name: str) -> bytes | None:
        return self.files.get(name)

    def delete(self, name: str) -> None:
        self.files.pop(name, None)

    def delete_zone(self, zone: str) -> None:
        for name in [n for n in self.files if n.startswith(file_name(zone, ""))]:
            del self.files[name]


# google-cloud-storage is only partly typed; this class is its only user here.
class BucketDocumentFiles:
    def __init__(self, bucket: str) -> None:
        self._bucket = storage.Client().bucket(bucket)  # pyright: ignore[reportUnknownMemberType]

    def put(self, name: str, content: bytes, media_type: str) -> None:
        self._bucket.blob(name).upload_from_string(content, content_type=media_type, if_generation_match=0)  # pyright: ignore[reportUnknownMemberType]

    def get(self, name: str) -> bytes | None:
        try:
            return self._bucket.blob(name).download_as_bytes()  # pyright: ignore[reportUnknownMemberType]
        except NotFound:
            return None

    def delete(self, name: str) -> None:
        with suppress(NotFound):
            self._bucket.blob(name).delete()  # pyright: ignore[reportUnknownMemberType]

    def delete_zone(self, zone: str) -> None:
        for blob in self._bucket.list_blobs(prefix=file_name(zone, "")):  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
            blob.delete()  # pyright: ignore[reportUnknownMemberType]


def document_files_from(source: str) -> DocumentFiles:
    """`gs://<bucket>`, the saved zones' private bucket, or `memory://`."""
    if source.startswith("gs://"):
        return BucketDocumentFiles(source.removeprefix("gs://").rstrip("/"))
    if source == "memory://":
        return MemoryDocumentFiles()
    raise ValueError(f"Unknown documents source: {source}")
