"""Projects: groups of zones an owner shares with members. Items reference zones by key and never copy them."""

import uuid
from collections.abc import Callable
from contextlib import suppress
from dataclasses import dataclass, field, replace
from datetime import datetime
from enum import StrEnum
from typing import Any, Literal, Protocol, cast

from google.api_core.exceptions import NotFound
from google.cloud import firestore  # pyright: ignore[reportMissingTypeStubs]


class MemberRole(StrEnum):
    COLLABORATOR = "collaborator"
    VIEWER = "viewer"


type ProjectRole = Literal["owner", "collaborator", "viewer"]


@dataclass(frozen=True)
class Member:
    # Lower case: invitations are by email.
    email: str
    role: MemberRole
    # None while the invitation is pending: it is accepted when that person opens their projects.
    account: str | None = None


@dataclass(frozen=True)
class Project:
    id: str
    owner: str
    name: str
    description: str
    # Item keys in the order they were added: `saved:<id>`, `<division>:<id>` or `padron:<department>:<number>`.
    items: tuple[str, ...]
    created_at: datetime
    updated_at: datetime
    members: tuple[Member, ...] = field(default_factory=tuple[Member, ...])

    def role_of(self, account: str) -> ProjectRole | None:
        if account == self.owner:
            return "owner"
        return next((m.role.value for m in self.members if m.account == account), None)

    def can_edit(self, account: str) -> bool:
        return self.role_of(account) in ("owner", "collaborator")

    def others_can_edit(self, account: str) -> bool:
        """Whether anyone else can change the outlines of the zones `account` adds."""
        collaborators = (m for m in self.members if m.role == MemberRole.COLLABORATOR and m.account != account)
        return self.owner != account or any(collaborators)


class TooManyItems(Exception):
    pass


class NotAllowed(Exception):
    """The caller lost the right to the change while it was on its way."""


def new_project_id() -> str:
    return str(uuid.uuid4())


def saved_item(zone: str) -> str:
    return f"saved:{zone}"


class ProjectStore(Protocol):
    def owned_by(self, owner: str) -> list[Project]: ...

    def shared_with(self, account: str) -> list[Project]: ...

    def invited(self, email: str) -> list[Project]:
        """Projects with a pending invitation for the email."""
        ...

    def containing(self, item: str) -> list[Project]: ...

    def count_owned(self, owner: str) -> int: ...

    def get(self, id: str) -> Project | None: ...

    def add(self, project: Project) -> None: ...

    def update(self, id: str, **fields: Any) -> Project | None:
        """Changes only the fields given; None when the project no longer exists."""
        ...

    def change(self, id: str, apply: Callable[[Project], Project]) -> Project | None:
        """Applies `apply` to the latest project in one transaction; it may raise to cancel. None without it."""
        ...

    def remove_item(self, id: str, item: str, at: datetime) -> Project | None: ...

    def remove_everywhere(self, item: str) -> list[str]:
        """Takes the item out of every project, as when its zone is deleted, and answers which ones held it."""
        ...

    def delete(self, id: str) -> None: ...


class MemoryProjects:
    def __init__(self) -> None:
        self._projects: dict[str, Project] = {}

    def owned_by(self, owner: str) -> list[Project]:
        return [p for p in self._projects.values() if p.owner == owner]

    def shared_with(self, account: str) -> list[Project]:
        return [p for p in self._projects.values() if any(m.account == account for m in p.members)]

    def invited(self, email: str) -> list[Project]:
        return [p for p in self._projects.values() if any(m.email == email and not m.account for m in p.members)]

    def containing(self, item: str) -> list[Project]:
        return [p for p in self._projects.values() if item in p.items]

    def count_owned(self, owner: str) -> int:
        return len(self.owned_by(owner))

    def get(self, id: str) -> Project | None:
        return self._projects.get(id)

    def add(self, project: Project) -> None:
        self._projects[project.id] = project

    def update(self, id: str, **fields: Any) -> Project | None:
        if id not in self._projects:
            return None
        self._projects[id] = replace(self._projects[id], **fields)
        return self._projects[id]

    def change(self, id: str, apply: Callable[[Project], Project]) -> Project | None:
        if id not in self._projects:
            return None
        self._projects[id] = apply(self._projects[id])
        return self._projects[id]

    def remove_item(self, id: str, item: str, at: datetime) -> Project | None:
        project = self._projects.get(id)
        if project is None:
            return None
        return self.update(id, items=tuple(i for i in project.items if i != item), updated_at=at)

    def remove_everywhere(self, item: str) -> list[str]:
        held = self.containing(item)
        for project in held:
            self.update(project.id, items=tuple(i for i in project.items if i != item))
        return [p.id for p in held]

    def delete(self, id: str) -> None:
        self._projects.pop(id, None)


# google-cloud-firestore is only partly typed; this class is its only user here.
class FirestoreProjects:
    def __init__(self, database: str) -> None:
        self._client = firestore.Client(database=database)  # pyright: ignore[reportUnknownMemberType]
        self._projects = self._client.collection("projects")  # pyright: ignore[reportUnknownMemberType]

    def _where(self, field: str, op: str, value: str) -> list[Project]:
        query = self._projects.where(filter=firestore.FieldFilter(field, op, value))  # pyright: ignore[reportUnknownMemberType]
        return [_from_document(d.id, cast(dict[str, Any], d.to_dict())) for d in query.stream()]  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType, reportUnknownArgumentType]

    def owned_by(self, owner: str) -> list[Project]:
        return self._where("owner", "==", owner)

    def shared_with(self, account: str) -> list[Project]:
        return self._where("member_ids", "array_contains", account)

    def invited(self, email: str) -> list[Project]:
        return self._where("invited_emails", "array_contains", email)

    def containing(self, item: str) -> list[Project]:
        return self._where("items", "array_contains", item)

    def count_owned(self, owner: str) -> int:
        query: Any = self._projects.where(filter=firestore.FieldFilter("owner", "==", owner))  # pyright: ignore[reportUnknownMemberType]
        return int(query.count(alias="projects").get()[0][0].value)

    def get(self, id: str) -> Project | None:
        document = self._projects.document(id).get()  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
        if not document.exists:  # pyright: ignore[reportUnknownMemberType]
            return None
        return _from_document(id, cast(dict[str, Any], document.to_dict()))  # pyright: ignore[reportUnknownMemberType]

    def add(self, project: Project) -> None:
        self._projects.document(project.id).create(_to_document(project))  # pyright: ignore[reportUnknownMemberType]

    def update(self, id: str, **fields: Any) -> Project | None:
        values: dict[str, Any] = {
            key: list(cast(tuple[str, ...], value)) if isinstance(value, tuple) else value
            for key, value in fields.items()
        }
        try:
            self._projects.document(id).update(values)  # pyright: ignore[reportUnknownMemberType]
        except NotFound:
            return None
        return self.get(id)

    def change(self, id: str, apply: Callable[[Project], Project]) -> Project | None:
        reference: Any = self._projects.document(id)  # pyright: ignore[reportUnknownMemberType]

        @firestore.transactional  # pyright: ignore[reportUntypedFunctionDecorator, reportUnknownMemberType]
        def run(transaction: Any) -> Project | None:
            snapshot = reference.get(transaction=transaction)
            if not snapshot.exists:
                return None
            before = _from_document(id, cast(dict[str, Any], snapshot.to_dict()))
            after = apply(before)
            if after != before:
                transaction.set(reference, _to_document(after))
            return after

        return cast(Project | None, run(self._client.transaction()))  # pyright: ignore[reportUnknownMemberType]

    def remove_item(self, id: str, item: str, at: datetime) -> Project | None:
        return self.update(id, items=firestore.ArrayRemove([item]), updated_at=at)

    def remove_everywhere(self, item: str) -> list[str]:
        held = self.containing(item)
        for project in held:
            # A project deleted meanwhile has nothing left to clean.
            with suppress(NotFound):
                self._projects.document(project.id).update({"items": firestore.ArrayRemove([item])})  # pyright: ignore[reportUnknownMemberType]
        return [p.id for p in held]

    def delete(self, id: str) -> None:
        self._projects.document(id).delete()  # pyright: ignore[reportUnknownMemberType]


def _to_document(project: Project) -> dict[str, Any]:
    return {
        "owner": project.owner,
        "name": project.name,
        "description": project.description,
        "items": list(project.items),
        "members": [{"email": m.email, "role": m.role.value, "account": m.account} for m in project.members],
        # For the queries of shared projects and pending invitations.
        "member_ids": [m.account for m in project.members if m.account],
        "invited_emails": [m.email for m in project.members if not m.account],
        "created_at": project.created_at,
        "updated_at": project.updated_at,
    }


def _from_document(id: str, data: dict[str, Any]) -> Project:
    members = cast(list[dict[str, Any]], data.get("members", []))
    return Project(
        id=id,
        owner=data["owner"],
        name=data["name"],
        description=data.get("description", ""),
        items=tuple(data.get("items", [])),
        created_at=data["created_at"],
        updated_at=data["updated_at"],
        members=tuple(Member(m["email"], MemberRole(m["role"]), m.get("account")) for m in members),
    )


def projects_from(source: str) -> ProjectStore:
    """`firestore://<database>`, or `memory://`."""
    if source.startswith("firestore://"):
        return FirestoreProjects(source.removeprefix("firestore://"))
    if source == "memory://":
        return MemoryProjects()
    raise ValueError(f"Unknown records source: {source}")
