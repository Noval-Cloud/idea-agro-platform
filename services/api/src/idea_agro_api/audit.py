"""What admins did to accounts, and editors to the site's texts: who, what, to whom or which, and when."""

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
    TEXT_PUBLISHED = "text_published"
    TEXT_DRAFTED = "text_drafted"
    TEXT_DRAFT_DISCARDED = "text_draft_discarded"
    TEXT_RESTORED = "text_restored"
    ARTICLE_SAVED = "article_saved"
    ARTICLE_DELETED = "article_deleted"
    CITATIONS_CHANGED = "citations_changed"
    ARTICLES_SEEDED = "articles_seeded"


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

    def latest(self, limit: int, since: datetime | None = None, until: datetime | None = None) -> list[AuditEntry]:
        """Newest first; `since` and `until` keep the actions from and before those times."""
        ...


class MemoryAudit:
    def __init__(self) -> None:
        self._entries: list[AuditEntry] = []

    def record(self, entry: AuditEntry) -> None:
        self._entries.append(entry)

    def latest(self, limit: int, since: datetime | None = None, until: datetime | None = None) -> list[AuditEntry]:
        within = [e for e in self._entries if (since is None or e.at >= since) and (until is None or e.at < until)]
        return sorted(within, key=lambda e: e.at, reverse=True)[:limit]


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

    def latest(self, limit: int, since: datetime | None = None, until: datetime | None = None) -> list[AuditEntry]:
        query: Any = self._entries
        if since is not None:
            query = query.where(filter=firestore.FieldFilter("at", ">=", since))
        if until is not None:
            query = query.where(filter=firestore.FieldFilter("at", "<", until))
        query = query.order_by("at", direction=firestore.Query.DESCENDING).limit(limit)
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
