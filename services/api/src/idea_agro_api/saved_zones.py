"""Saved zones: the outlines a person keeps in their library, apart from any project."""

import uuid
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Any, Protocol, cast

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
    created_at: datetime
    updated_at: datetime


def new_zone_id() -> str:
    return str(uuid.uuid4())


class SavedZoneStore(Protocol):
    def owned_by(self, owner: str) -> list[SavedZone]: ...

    def get(self, id: str) -> SavedZone | None: ...

    def save(self, zone: SavedZone) -> None: ...

    def delete(self, id: str) -> None: ...


class MemorySavedZones:
    def __init__(self) -> None:
        self._zones: dict[str, SavedZone] = {}

    def owned_by(self, owner: str) -> list[SavedZone]:
        return [z for z in self._zones.values() if z.owner == owner]

    def get(self, id: str) -> SavedZone | None:
        return self._zones.get(id)

    def save(self, zone: SavedZone) -> None:
        self._zones[zone.id] = zone

    def delete(self, id: str) -> None:
        self._zones.pop(id, None)


# google-cloud-firestore is only partly typed; this class is its only user here.
class FirestoreSavedZones:
    def __init__(self, database: str) -> None:
        self._zones = firestore.Client(database=database).collection("saved_zones")  # pyright: ignore[reportUnknownMemberType]

    def owned_by(self, owner: str) -> list[SavedZone]:
        query = self._zones.where(filter=firestore.FieldFilter("owner", "==", owner))  # pyright: ignore[reportUnknownMemberType]
        return [_from_document(d.id, cast(dict[str, Any], d.to_dict())) for d in query.stream()]  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType, reportUnknownArgumentType]

    def get(self, id: str) -> SavedZone | None:
        document = self._zones.document(id).get()  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
        if not document.exists:  # pyright: ignore[reportUnknownMemberType]
            return None
        return _from_document(id, cast(dict[str, Any], document.to_dict()))  # pyright: ignore[reportUnknownMemberType]

    def save(self, zone: SavedZone) -> None:
        self._zones.document(zone.id).set(_to_document(zone))  # pyright: ignore[reportUnknownMemberType]

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
