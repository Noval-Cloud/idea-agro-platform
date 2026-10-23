"""Projects: a person's groups of zones. Items reference zones by key and never copy them."""

import uuid
from contextlib import suppress
from dataclasses import dataclass, replace
from datetime import datetime
from typing import Any, Protocol, cast

from google.api_core.exceptions import NotFound
from google.cloud import firestore  # pyright: ignore[reportMissingTypeStubs]


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


class TooManyItems(Exception):
    pass


def new_project_id() -> str:
    return str(uuid.uuid4())


def saved_item(zone: str) -> str:
    return f"saved:{zone}"


class ProjectStore(Protocol):
    def owned_by(self, owner: str) -> list[Project]: ...

    def count_owned(self, owner: str) -> int: ...

    def get(self, id: str) -> Project | None: ...

    def add(self, project: Project) -> None: ...

    def update(self, id: str, **fields: Any) -> Project | None:
        """Changes only the fields given; None when the project no longer exists."""
        ...

    def add_item(self, id: str, item: str, limit: int, at: datetime) -> Project | None:
        """Adds the item unless it is there already, or raises TooManyItems; None without the project."""
        ...

    def remove_item(self, id: str, item: str, at: datetime) -> Project | None: ...

    def remove_everywhere(self, item: str) -> None:
        """Takes the item out of every project, as when its zone is deleted."""
        ...

    def delete(self, id: str) -> None: ...


class MemoryProjects:
    def __init__(self) -> None:
        self._projects: dict[str, Project] = {}

    def owned_by(self, owner: str) -> list[Project]:
        return [p for p in self._projects.values() if p.owner == owner]

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

    def add_item(self, id: str, item: str, limit: int, at: datetime) -> Project | None:
        project = self._projects.get(id)
        if project is None or item in project.items:
            return project
        if len(project.items) >= limit:
            raise TooManyItems
        return self.update(id, items=(*project.items, item), updated_at=at)

    def remove_item(self, id: str, item: str, at: datetime) -> Project | None:
        project = self._projects.get(id)
        if project is None:
            return None
        return self.update(id, items=tuple(i for i in project.items if i != item), updated_at=at)

    def remove_everywhere(self, item: str) -> None:
        for project in list(self._projects.values()):
            if item in project.items:
                self.update(project.id, items=tuple(i for i in project.items if i != item))

    def delete(self, id: str) -> None:
        self._projects.pop(id, None)


# google-cloud-firestore is only partly typed; this class is its only user here.
class FirestoreProjects:
    def __init__(self, database: str) -> None:
        self._client = firestore.Client(database=database)  # pyright: ignore[reportUnknownMemberType]
        self._projects = self._client.collection("projects")  # pyright: ignore[reportUnknownMemberType]

    def _of(self, owner: str) -> Any:
        return self._projects.where(filter=firestore.FieldFilter("owner", "==", owner))  # pyright: ignore[reportUnknownMemberType]

    def owned_by(self, owner: str) -> list[Project]:
        return [_from_document(d.id, cast(dict[str, Any], d.to_dict())) for d in self._of(owner).stream()]

    def count_owned(self, owner: str) -> int:
        return int(self._of(owner).count(alias="projects").get()[0][0].value)

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

    def add_item(self, id: str, item: str, limit: int, at: datetime) -> Project | None:
        reference: Any = self._projects.document(id)  # pyright: ignore[reportUnknownMemberType]

        # The limit and the "once per project" rule hold under concurrent adds.
        @firestore.transactional  # pyright: ignore[reportUntypedFunctionDecorator, reportUnknownMemberType]
        def run(transaction: Any) -> Project | None:
            snapshot = reference.get(transaction=transaction)
            if not snapshot.exists:
                return None
            project = _from_document(id, cast(dict[str, Any], snapshot.to_dict()))
            if item in project.items:
                return project
            if len(project.items) >= limit:
                raise TooManyItems
            transaction.update(reference, {"items": firestore.ArrayUnion([item]), "updated_at": at})
            return replace(project, items=(*project.items, item), updated_at=at)

        return cast(Project | None, run(self._client.transaction()))  # pyright: ignore[reportUnknownMemberType]

    def remove_item(self, id: str, item: str, at: datetime) -> Project | None:
        return self.update(id, items=firestore.ArrayRemove([item]), updated_at=at)

    def remove_everywhere(self, item: str) -> None:
        query = self._projects.where(filter=firestore.FieldFilter("items", "array_contains", item))  # pyright: ignore[reportUnknownMemberType]
        for document in query.stream():  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
            # A project deleted meanwhile has nothing left to clean.
            with suppress(NotFound):
                document.reference.update({"items": firestore.ArrayRemove([item])})  # pyright: ignore[reportUnknownMemberType]

    def delete(self, id: str) -> None:
        self._projects.document(id).delete()  # pyright: ignore[reportUnknownMemberType]


def _to_document(project: Project) -> dict[str, Any]:
    return {
        "owner": project.owner,
        "name": project.name,
        "description": project.description,
        "items": list(project.items),
        "created_at": project.created_at,
        "updated_at": project.updated_at,
    }


def _from_document(id: str, data: dict[str, Any]) -> Project:
    return Project(
        id=id,
        owner=data["owner"],
        name=data["name"],
        description=data.get("description", ""),
        items=tuple(data.get("items", [])),
        created_at=data["created_at"],
        updated_at=data["updated_at"],
    )


def projects_from(source: str) -> ProjectStore:
    """`firestore://<database>`, or `memory://`."""
    if source.startswith("firestore://"):
        return FirestoreProjects(source.removeprefix("firestore://"))
    if source == "memory://":
        return MemoryProjects()
    raise ValueError(f"Unknown records source: {source}")
