"""Accounts: our own record of each person, linked to the identity their provider vouches for."""

import uuid
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any, Protocol, cast

from google.api_core.exceptions import Conflict
from google.cloud import firestore  # pyright: ignore[reportMissingTypeStubs]

from idea_agro_api.auth import Identity


class Role(StrEnum):
    """Roles beyond `client`, which every account has. They combine: admin does not imply editor."""

    EDITOR = "editor"
    ADMIN = "admin"


@dataclass(frozen=True)
class Account:
    id: str
    identity: str
    email: str | None
    name: str | None
    picture: str | None
    created_at: datetime
    roles: frozenset[Role] = field(default_factory=frozenset[Role])
    sessions_valid_after: datetime | None = None
    disabled: bool = False

    def accepts(self, identity: Identity) -> bool:
        """Whether a token of this account still counts: not disabled, and issued after the last log-out."""
        valid_after = self.sessions_valid_after
        return not self.disabled and (valid_after is None or identity.issued_at >= valid_after)


def identity_key(identity: Identity) -> str:
    return f"{identity.issuer}|{identity.subject}"


def account_id(identity: Identity) -> str:
    """Derived from the identity, so two first requests at once cannot create two accounts."""
    return str(uuid.uuid5(uuid.NAMESPACE_URL, identity_key(identity)))


def new_account(identity: Identity) -> Account:
    return Account(
        id=account_id(identity),
        identity=identity_key(identity),
        email=identity.email,
        name=identity.name,
        picture=identity.picture,
        created_at=datetime.now(UTC),
    )


class AccountStore(Protocol):
    def get(self, id: str) -> Account | None: ...

    def create(self, account: Account) -> Account:
        """Stores a new account; when one with its id already exists, returns that one untouched."""
        ...

    def save(self, account: Account) -> None: ...


class MemoryAccounts:
    """Accounts kept in memory: for tests and local runs."""

    def __init__(self) -> None:
        self._accounts: dict[str, Account] = {}

    def get(self, id: str) -> Account | None:
        return self._accounts.get(id)

    def create(self, account: Account) -> Account:
        return self._accounts.setdefault(account.id, account)

    def save(self, account: Account) -> None:
        self._accounts[account.id] = account


# google-cloud-firestore is only partly typed; this class is its only user.
class FirestoreAccounts:
    def __init__(self, database: str) -> None:
        self._accounts = firestore.Client(database=database).collection("accounts")  # pyright: ignore[reportUnknownMemberType]

    def get(self, id: str) -> Account | None:
        document = self._accounts.document(id).get()  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
        if not document.exists:  # pyright: ignore[reportUnknownMemberType]
            return None
        return _from_document(id, cast(dict[str, Any], document.to_dict()))  # pyright: ignore[reportUnknownMemberType]

    def create(self, account: Account) -> Account:
        try:
            self._accounts.document(account.id).create(_to_document(account))  # pyright: ignore[reportUnknownMemberType]
        except Conflict:
            return self.get(account.id) or account
        return account

    def save(self, account: Account) -> None:
        self._accounts.document(account.id).set(_to_document(account))  # pyright: ignore[reportUnknownMemberType]


def _to_document(account: Account) -> dict[str, Any]:
    return {
        "identity": account.identity,
        "email": account.email,
        "name": account.name,
        "picture": account.picture,
        "created_at": account.created_at,
        "roles": sorted(account.roles),
        "sessions_valid_after": account.sessions_valid_after,
        "disabled": account.disabled,
    }


def _from_document(id: str, data: dict[str, Any]) -> Account:
    return Account(
        id=id,
        identity=data["identity"],
        email=data.get("email"),
        name=data.get("name"),
        picture=data.get("picture"),
        created_at=data["created_at"],
        roles=frozenset(Role(r) for r in data.get("roles", [])),
        sessions_valid_after=data.get("sessions_valid_after"),
        disabled=data.get("disabled", False),
    )


def accounts_from(source: str) -> AccountStore:
    """`firestore://<database>` for Firestore, `memory://` for a store that lives as long as the process."""
    if source.startswith("firestore://"):
        return FirestoreAccounts(source.removeprefix("firestore://"))
    if source == "memory://":
        return MemoryAccounts()
    raise ValueError(f"Unknown accounts source: {source}")


def refreshed(account: Account, identity: Identity) -> Account:
    """The account with the profile the provider reports now."""
    return replace(account, email=identity.email, name=identity.name, picture=identity.picture)
