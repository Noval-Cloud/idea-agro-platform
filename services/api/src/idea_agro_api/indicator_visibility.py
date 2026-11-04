"""Whether each indicator is shown on the site and in the public API, as editors decide.

An indicator is shown until an editor hides it while its data is reviewed. The content database keeps one record per
indicator ever switched. The data jobs never read it: a hidden indicator keeps being computed.
"""

import time
from dataclasses import dataclass
from datetime import datetime
from threading import Lock
from typing import Any, Protocol, cast

from google.cloud import firestore  # pyright: ignore[reportMissingTypeStubs]

from idea_agro_api.site_texts import Author

COLLECTION = "indicator_visibility"


@dataclass(frozen=True)
class Visibility:
    indicator: str
    shown: bool
    updated_at: datetime | None = None
    updated_by: Author | None = None


class VisibilityStore(Protocol):
    def all(self) -> dict[str, Visibility]:
        """By indicator, the ones ever switched."""
        ...

    def put(self, visibility: Visibility) -> None: ...


class MemoryVisibility:
    def __init__(self) -> None:
        self._records: dict[str, Visibility] = {}

    def all(self) -> dict[str, Visibility]:
        return dict(self._records)

    def put(self, visibility: Visibility) -> None:
        self._records[visibility.indicator] = visibility


# google-cloud-firestore is only partly typed; this class is its only user here.
class FirestoreVisibility:
    def __init__(self, database: str) -> None:
        self._records = firestore.Client(database=database).collection(COLLECTION)  # pyright: ignore[reportUnknownMemberType]

    @staticmethod
    def _visibility(indicator: str, record: dict[str, Any]) -> Visibility:
        by = cast(dict[str, str] | None, record.get("updated_by"))
        return Visibility(
            indicator, record.get("shown", True), record.get("updated_at"), Author(by["id"], by["name"]) if by else None
        )

    def all(self) -> dict[str, Visibility]:
        return {
            d.id: self._visibility(d.id, cast(dict[str, Any], d.to_dict()))  # pyright: ignore[reportUnknownMemberType, reportUnknownArgumentType]
            for d in self._records.stream()  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
        }

    def put(self, visibility: Visibility) -> None:
        by = visibility.updated_by
        self._records.document(visibility.indicator).set(  # pyright: ignore[reportUnknownMemberType]
            {
                "shown": visibility.shown,
                "updated_at": visibility.updated_at,
                "updated_by": {"id": by.id, "name": by.name} if by else None,
            }
        )


def visibility_from(source: str) -> VisibilityStore:
    """`firestore://<database>`, or `memory://`."""
    if source.startswith("firestore://"):
        return FirestoreVisibility(source.removeprefix("firestore://"))
    if source == "memory://":
        return MemoryVisibility()
    raise ValueError(f"Unknown records source: {source}")


class IndicatorVisibility:
    """The switches, with the hidden indicators kept for a few seconds: public routes ask on every request."""

    def __init__(self, store: VisibilityStore, keep_seconds: float = 10) -> None:
        self._store = store
        self._keep_seconds = keep_seconds
        self._kept: tuple[float, frozenset[str]] | None = None
        self._lock = Lock()

    def hidden(self) -> frozenset[str]:
        now = time.monotonic()
        with self._lock:
            if self._kept and now - self._kept[0] < self._keep_seconds:
                return self._kept[1]
        found = frozenset(v.indicator for v in self._store.all().values() if not v.shown)
        with self._lock:
            self._kept = (now, found)
        return found

    def all(self) -> dict[str, Visibility]:
        return self._store.all()

    def put(self, visibility: Visibility) -> None:
        self._store.put(visibility)
        with self._lock:
            self._kept = None
