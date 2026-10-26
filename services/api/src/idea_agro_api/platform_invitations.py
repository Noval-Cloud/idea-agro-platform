"""Invitations to the platform itself: someone asks an email to join, and sees whether it did.

Such an invitation grants nothing, so it needs no code: it is accepted when an account with that verified email
is created before it expires.
"""

import uuid
from dataclasses import dataclass, replace
from datetime import datetime
from typing import Any, Literal, Protocol, cast

from google.api_core.exceptions import NotFound
from google.cloud import firestore  # pyright: ignore[reportMissingTypeStubs]

Language = Literal["es", "en", "pt"]


@dataclass(frozen=True)
class PlatformInvitation:
    id: str
    inviter: str
    email: str
    language: Language
    created_at: datetime
    # When it was last emailed, and until when it can be accepted.
    invited_at: datetime
    invited_until: datetime
    accepted_at: datetime | None = None
    # Every time it was emailed, which a person's daily budget counts, and when its sender dropped it.
    sent: tuple[datetime, ...] = ()
    deleted_at: datetime | None = None

    def state(self, now: datetime) -> Literal["pending", "accepted", "expired"]:
        if self.accepted_at:
            return "accepted"
        return "pending" if now < self.invited_until else "expired"


def new_invitation_id() -> str:
    return str(uuid.uuid4())


class PlatformInvitationStore(Protocol):
    def of_inviter(self, inviter: str) -> list[PlatformInvitation]:
        """Newest first, deleted ones too: they still count against their sender's budget."""
        ...

    def get(self, id: str) -> PlatformInvitation | None: ...

    def add(self, invitation: PlatformInvitation) -> None: ...

    def update(self, id: str, **fields: Any) -> PlatformInvitation | None: ...

    def delete(self, id: str) -> None: ...

    def accept(self, email: str, at: datetime) -> None:
        """Every invitation of that email still pending at `at` is accepted."""
        ...


class MemoryPlatformInvitations:
    def __init__(self) -> None:
        self._invitations: dict[str, PlatformInvitation] = {}

    def of_inviter(self, inviter: str) -> list[PlatformInvitation]:
        found = (i for i in self._invitations.values() if i.inviter == inviter)
        return sorted(found, key=lambda i: i.created_at, reverse=True)

    def get(self, id: str) -> PlatformInvitation | None:
        return self._invitations.get(id)

    def add(self, invitation: PlatformInvitation) -> None:
        self._invitations[invitation.id] = invitation

    def update(self, id: str, **fields: Any) -> PlatformInvitation | None:
        if id not in self._invitations:
            return None
        self._invitations[id] = replace(self._invitations[id], **fields)
        return self._invitations[id]

    def delete(self, id: str) -> None:
        self._invitations.pop(id, None)

    def accept(self, email: str, at: datetime) -> None:
        for invitation in list(self._invitations.values()):
            if invitation.email == email and invitation.state(at) == "pending" and not invitation.deleted_at:
                self._invitations[invitation.id] = replace(invitation, accepted_at=at)


# google-cloud-firestore is only partly typed; this class is its only user here.
class FirestorePlatformInvitations:
    def __init__(self, database: str) -> None:
        self._invitations = firestore.Client(database=database).collection("platform_invitations")  # pyright: ignore[reportUnknownMemberType]

    def _where(self, field: str, value: str) -> list[PlatformInvitation]:
        query = self._invitations.where(filter=firestore.FieldFilter(field, "==", value))  # pyright: ignore[reportUnknownMemberType]
        return [_from_record(d.id, cast(dict[str, Any], d.to_dict())) for d in query.stream()]

    def of_inviter(self, inviter: str) -> list[PlatformInvitation]:
        return sorted(self._where("inviter", inviter), key=lambda i: i.created_at, reverse=True)

    def get(self, id: str) -> PlatformInvitation | None:
        record = self._invitations.document(id).get()  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
        if not record.exists:  # pyright: ignore[reportUnknownMemberType]
            return None
        return _from_record(id, cast(dict[str, Any], record.to_dict()))  # pyright: ignore[reportUnknownMemberType]

    def add(self, invitation: PlatformInvitation) -> None:
        self._invitations.document(invitation.id).create(_to_record(invitation))  # pyright: ignore[reportUnknownMemberType]

    def update(self, id: str, **fields: Any) -> PlatformInvitation | None:
        found = self.get(id)
        if found is None:
            return None
        stored: dict[str, Any] = {
            name: list(cast(tuple[Any, ...], value)) if isinstance(value, tuple) else value
            for name, value in fields.items()
        }
        try:
            self._invitations.document(id).update(stored)  # pyright: ignore[reportUnknownMemberType]
        except NotFound:
            return None
        return replace(found, **fields)

    def delete(self, id: str) -> None:
        self._invitations.document(id).delete()  # pyright: ignore[reportUnknownMemberType]

    def accept(self, email: str, at: datetime) -> None:
        for invitation in self._where("email", email):
            if invitation.state(at) == "pending" and not invitation.deleted_at:
                self._invitations.document(invitation.id).update({"accepted_at": at})  # pyright: ignore[reportUnknownMemberType]


def _to_record(invitation: PlatformInvitation) -> dict[str, Any]:
    return {
        "inviter": invitation.inviter,
        "email": invitation.email,
        "language": invitation.language,
        "created_at": invitation.created_at,
        "invited_at": invitation.invited_at,
        "invited_until": invitation.invited_until,
        "accepted_at": invitation.accepted_at,
        "sent": list(invitation.sent),
        "deleted_at": invitation.deleted_at,
    }


def _from_record(id: str, data: dict[str, Any]) -> PlatformInvitation:
    return PlatformInvitation(
        id=id,
        inviter=data["inviter"],
        email=data["email"],
        language=data["language"],
        created_at=data["created_at"],
        invited_at=data["invited_at"],
        invited_until=data["invited_until"],
        accepted_at=data.get("accepted_at"),
        sent=tuple(cast(list[datetime], data.get("sent", []))),
        deleted_at=data.get("deleted_at"),
    )


def platform_invitations_from(source: str) -> PlatformInvitationStore:
    """`firestore://<database>`, or `memory://`."""
    if source.startswith("firestore://"):
        return FirestorePlatformInvitations(source.removeprefix("firestore://"))
    if source == "memory://":
        return MemoryPlatformInvitations()
    raise ValueError(f"Unknown records source: {source}")
