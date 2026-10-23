"""Saved zones: the outlines a person keeps in their library, apart from any project."""

import uuid
from dataclasses import dataclass, replace
from datetime import datetime
from enum import StrEnum
from typing import Any, Protocol, cast

from google.api_core.exceptions import NotFound
from google.cloud import firestore  # pyright: ignore[reportMissingTypeStubs]


class Source(StrEnum):
    DRAWN = "drawn"
    UPLOADED = "uploaded"


@dataclass(frozen=True)
class SavedZone:
    id: str
    owner: str
    name: str
    source: Source
    version: int
    area_ha: float
    bbox: tuple[float, float, float, float]
    department: str | None
    # Bytes of the stored outline, so a library's total size is known without reading it.
    size: int
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class Usage:
    zones: int
    bytes: int


def new_zone_id() -> str:
    return str(uuid.uuid4())


class SavedZoneStore(Protocol):
    def owned_by(self, owner: str) -> list[SavedZone]: ...

    def usage(self, owner: str) -> Usage:
        """How many zones the owner keeps, and their outlines' total size."""
        ...

    def get(self, id: str) -> SavedZone | None: ...

    def get_many(self, ids: list[str]) -> dict[str, SavedZone]:
        """The zones that exist among `ids`, by id."""
        ...

    def add(self, zones: list[SavedZone]) -> None:
        """Every zone, or none."""
        ...

    def update(self, id: str, **fields: Any) -> SavedZone | None:
        """Changes only the fields given; None when the zone no longer exists."""
        ...

    def delete(self, id: str) -> None: ...


class MemorySavedZones:
    def __init__(self) -> None:
        self._zones: dict[str, SavedZone] = {}

    def owned_by(self, owner: str) -> list[SavedZone]:
        return [z for z in self._zones.values() if z.owner == owner]

    def usage(self, owner: str) -> Usage:
        owned = self.owned_by(owner)
        return Usage(zones=len(owned), bytes=sum(z.size for z in owned))

    def get(self, id: str) -> SavedZone | None:
        return self._zones.get(id)

    def get_many(self, ids: list[str]) -> dict[str, SavedZone]:
        return {id: self._zones[id] for id in ids if id in self._zones}

    def add(self, zones: list[SavedZone]) -> None:
        self._zones.update({z.id: z for z in zones})

    def update(self, id: str, **fields: Any) -> SavedZone | None:
        if id not in self._zones:
            return None
        self._zones[id] = replace(self._zones[id], **fields)
        return self._zones[id]

    def delete(self, id: str) -> None:
        self._zones.pop(id, None)


# google-cloud-firestore is only partly typed; this class is its only user here.
class FirestoreSavedZones:
    def __init__(self, database: str) -> None:
        self._client = firestore.Client(database=database)  # pyright: ignore[reportUnknownMemberType]
        self._zones = self._client.collection("saved_zones")  # pyright: ignore[reportUnknownMemberType]

    def _of(self, owner: str) -> Any:
        return self._zones.where(filter=firestore.FieldFilter("owner", "==", owner))  # pyright: ignore[reportUnknownMemberType]

    def owned_by(self, owner: str) -> list[SavedZone]:
        return [_from_document(d.id, cast(dict[str, Any], d.to_dict())) for d in self._of(owner).stream()]

    def usage(self, owner: str) -> Usage:
        # Aggregations are billed by index entries, not by the documents they count.
        results = self._of(owner).count(alias="zones").sum("size", alias="bytes").get()
        found = {r.alias: r.value for r in results[0]}
        return Usage(zones=int(found.get("zones") or 0), bytes=int(found.get("bytes") or 0))

    def get(self, id: str) -> SavedZone | None:
        document = self._zones.document(id).get()  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
        if not document.exists:  # pyright: ignore[reportUnknownMemberType]
            return None
        return _from_document(id, cast(dict[str, Any], document.to_dict()))  # pyright: ignore[reportUnknownMemberType]

    def get_many(self, ids: list[str]) -> dict[str, SavedZone]:
        if not ids:
            return {}
        documents = self._client.get_all([self._zones.document(id) for id in ids])  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
        return {
            d.id: _from_document(d.id, cast(dict[str, Any], d.to_dict()))  # pyright: ignore[reportUnknownMemberType, reportUnknownArgumentType]
            for d in documents  # pyright: ignore[reportUnknownVariableType]
            if d.exists  # pyright: ignore[reportUnknownMemberType]
        }

    def add(self, zones: list[SavedZone]) -> None:
        batch = self._client.batch()  # pyright: ignore[reportUnknownMemberType]
        for zone in zones:
            batch.create(self._zones.document(zone.id), _to_document(zone))  # pyright: ignore[reportUnknownMemberType]
        batch.commit()  # pyright: ignore[reportUnknownMemberType]

    def update(self, id: str, **fields: Any) -> SavedZone | None:
        try:
            self._zones.document(id).update(fields)  # pyright: ignore[reportUnknownMemberType]
        except NotFound:
            return None
        return self.get(id)

    def delete(self, id: str) -> None:
        self._zones.document(id).delete()  # pyright: ignore[reportUnknownMemberType]


def _to_document(zone: SavedZone) -> dict[str, Any]:
    return {
        "owner": zone.owner,
        "name": zone.name,
        "source": zone.source.value,
        "version": zone.version,
        "area_ha": zone.area_ha,
        "bbox": list(zone.bbox),
        "department": zone.department,
        "size": zone.size,
        "created_at": zone.created_at,
        "updated_at": zone.updated_at,
    }


def _from_document(id: str, data: dict[str, Any]) -> SavedZone:
    west, south, east, north = data["bbox"]
    return SavedZone(
        id=id,
        owner=data["owner"],
        name=data["name"],
        source=Source(data["source"]),
        version=data["version"],
        area_ha=data["area_ha"],
        bbox=(west, south, east, north),
        department=data.get("department"),
        size=data.get("size", 0),
        created_at=data["created_at"],
        updated_at=data["updated_at"],
    )


def saved_zones_from(source: str) -> SavedZoneStore:
    """`firestore://<database>`, or `memory://`."""
    if source.startswith("firestore://"):
        return FirestoreSavedZones(source.removeprefix("firestore://"))
    if source == "memory://":
        return MemorySavedZones()
    raise ValueError(f"Unknown records source: {source}")
