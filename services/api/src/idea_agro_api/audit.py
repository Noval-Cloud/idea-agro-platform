"""What admins did to accounts: who, what, to whom and when."""

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Any, Protocol, cast

from google.cloud import firestore  # pyright: ignore[reportMissingTypeStubs]


class AuditAction(StrEnum):
    ADMIN_BOOTSTRAPPED = "admin_bootstrapped"
    ROLES_CHANGED = "roles_changed"
    SESSIONS_REVOKED = "sessions_revoked"
    DISABLED = "disabled"
    ENABLED = "enabled"
    RECOVERY_SENT = "recovery_sent"


@dataclass(frozen=True)
class AuditEntry:
    at: datetime
    actor: str
    # Names and emails at the time, so the record reads the same after profiles change.
    actor_name: str
    action: AuditAction
    target: str
    target_email: str
    detail: str = ""


class AuditStore(Protocol):
    def record(self, entry: AuditEntry) -> None: ...

    def latest(self, limit: int) -> list[AuditEntry]:
        """Newest first."""
        ...


class MemoryAudit:
    def __init__(self) -> None:
        self._entries: list[AuditEntry] = []

    def record(self, entry: AuditEntry) -> None:
        self._entries.append(entry)

    def latest(self, limit: int) -> list[AuditEntry]:
        return sorted(self._entries, key=lambda e: e.at, reverse=True)[:limit]


# google-cloud-firestore is only partly typed; this class is its only user here.
class FirestoreAudit:
    def __init__(self, database: str) -> None:
        self._entries = firestore.Client(database=database).collection("audit")  # pyright: ignore[reportUnknownMemberType]

    def record(self, entry: AuditEntry) -> None:
        self._entries.document().create(  # pyright: ignore[reportUnknownMemberType]
            {
                "at": entry.at,
                "actor": entry.actor,
                "actor_name": entry.actor_name,
                "action": entry.action.value,
                "target": entry.target,
                "target_email": entry.target_email,
                "detail": entry.detail,
            }
        )

    def latest(self, limit: int) -> list[AuditEntry]:
        query: Any = self._entries.order_by("at", direction=firestore.Query.DESCENDING).limit(limit)  # pyright: ignore[reportUnknownMemberType]
        return [_from_document(cast(dict[str, Any], d.to_dict())) for d in query.stream()]


def _from_document(data: dict[str, Any]) -> AuditEntry:
    return AuditEntry(
        at=data["at"],
        actor=data["actor"],
        actor_name=data["actor_name"],
        action=AuditAction(data["action"]),
        target=data["target"],
        target_email=data.get("target_email", ""),
        detail=data.get("detail", ""),
    )


def audit_from(source: str) -> AuditStore:
    """`firestore://<database>`, or `memory://`."""
    if source.startswith("firestore://"):
        return FirestoreAudit(source.removeprefix("firestore://"))
    if source == "memory://":
        return MemoryAudit()
    raise ValueError(f"Unknown records source: {source}")
