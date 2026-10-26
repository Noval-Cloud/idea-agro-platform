"""What happened in each project: who changed what, and when."""

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Any, Protocol, cast

from google.cloud import firestore  # pyright: ignore[reportMissingTypeStubs]


class Action(StrEnum):
    CREATED = "created"
    RENAMED = "renamed"
    DESCRIBED = "described"
    ZONE_ADDED = "zone_added"
    ZONE_REMOVED = "zone_removed"
    OUTLINE_CHANGED = "outline_changed"
    OUTLINE_RESTORED = "outline_restored"
    MEMBER_INVITED = "member_invited"
    MEMBER_JOINED = "member_joined"
    MEMBER_DECLINED = "member_declined"
    MEMBER_ROLE_CHANGED = "member_role_changed"
    MEMBER_REMOVED = "member_removed"
    MEMBER_LEFT = "member_left"


@dataclass(frozen=True)
class Activity:
    project: str
    at: datetime
    actor: str
    # The actor's name at the time, so the log reads the same after a profile changes.
    actor_name: str
    action: Action
    # An item key or a member's email.
    subject: str = ""
    # A saved zone's name at the time, or a role.
    detail: str = ""


class ActivityStore(Protocol):
    def record(self, entries: list[Activity]) -> None: ...

    def of_project(
        self, project: str, limit: int, before: datetime | None = None, since: datetime | None = None
    ) -> list[Activity]:
        """The latest entries before `before` and from `since` on, newest first."""
        ...

    def forget_project(self, project: str) -> None: ...


class MemoryActivity:
    def __init__(self) -> None:
        self._entries: list[Activity] = []

    def record(self, entries: list[Activity]) -> None:
        self._entries.extend(entries)

    def of_project(
        self, project: str, limit: int, before: datetime | None = None, since: datetime | None = None
    ) -> list[Activity]:
        found = [
            e
            for e in self._entries
            if e.project == project and (before is None or e.at < before) and (since is None or e.at >= since)
        ]
        return sorted(found, key=lambda e: e.at, reverse=True)[:limit]

    def forget_project(self, project: str) -> None:
        self._entries = [e for e in self._entries if e.project != project]


# google-cloud-firestore is only partly typed; this class is its only user here.
class FirestoreActivity:
    def __init__(self, database: str) -> None:
        self._client = firestore.Client(database=database)  # pyright: ignore[reportUnknownMemberType]
        self._entries = self._client.collection("activity")  # pyright: ignore[reportUnknownMemberType]

    def _of(self, project: str) -> Any:
        return self._entries.where(filter=firestore.FieldFilter("project", "==", project))  # pyright: ignore[reportUnknownMemberType]

    def record(self, entries: list[Activity]) -> None:
        batch = self._client.batch()  # pyright: ignore[reportUnknownMemberType]
        for entry in entries:
            batch.create(self._entries.document(), _to_document(entry))  # pyright: ignore[reportUnknownMemberType]
        batch.commit()  # pyright: ignore[reportUnknownMemberType]

    def of_project(
        self, project: str, limit: int, before: datetime | None = None, since: datetime | None = None
    ) -> list[Activity]:
        query = self._of(project)
        if before is not None:
            query = query.where(filter=firestore.FieldFilter("at", "<", before))  # pyright: ignore[reportUnknownMemberType]
        if since is not None:
            query = query.where(filter=firestore.FieldFilter("at", ">=", since))  # pyright: ignore[reportUnknownMemberType]
        query = query.order_by("at", direction=firestore.Query.DESCENDING).limit(limit)  # pyright: ignore[reportUnknownMemberType]
        return [_from_document(cast(dict[str, Any], d.to_dict())) for d in query.stream()]

    def forget_project(self, project: str) -> None:
        documents = list(self._of(project).stream())
        for start in range(0, len(documents), 500):
            batch = self._client.batch()  # pyright: ignore[reportUnknownMemberType]
            for document in documents[start : start + 500]:
                batch.delete(document.reference)  # pyright: ignore[reportUnknownMemberType]
            batch.commit()  # pyright: ignore[reportUnknownMemberType]


def _to_document(entry: Activity) -> dict[str, Any]:
    return {
        "project": entry.project,
        "at": entry.at,
        "actor": entry.actor,
        "actor_name": entry.actor_name,
        "action": entry.action.value,
        "subject": entry.subject,
        "detail": entry.detail,
    }


def _from_document(data: dict[str, Any]) -> Activity:
    return Activity(
        project=data["project"],
        at=data["at"],
        actor=data["actor"],
        actor_name=data["actor_name"],
        action=Action(data["action"]),
        subject=data.get("subject", ""),
        detail=data.get("detail", ""),
    )


def activity_from(source: str) -> ActivityStore:
    """`firestore://<database>`, or `memory://`."""
    if source.startswith("firestore://"):
        return FirestoreActivity(source.removeprefix("firestore://"))
    if source == "memory://":
        return MemoryActivity()
    raise ValueError(f"Unknown records source: {source}")
