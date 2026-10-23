"""Accounts: our own record of each person, linked to the identities their providers vouch for."""

import hashlib
import uuid
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any, Protocol, cast

from google.cloud import firestore  # pyright: ignore[reportMissingTypeStubs]

from idea_agro_api.auth import Identity


class Role(StrEnum):
    """Roles beyond `client`, which every account has. They combine: admin does not imply editor."""

    EDITOR = "editor"
    ADMIN = "admin"


@dataclass(frozen=True)
class Account:
    id: str
    email: str | None
    name: str | None
    picture: str | None
    created_at: datetime
    roles: frozenset[Role] = field(default_factory=frozenset[Role])
    sessions_valid_after: datetime | None = None
    disabled: bool = False
    # Set once the configured first-admin list has made this account an admin: it never does again.
    bootstrapped: bool = False

    @property
    def display_name(self) -> str:
        return self.name or self.email or ""

    def accepts(self, identity: Identity) -> bool:
        """Whether a token of this account still counts: not disabled, and from a sign-in after the last log-out.

        The sign-in time (`auth_time`) is what counts: tokens refreshed from an older sign-in keep it.
        """
        valid_after = self.sessions_valid_after
        signed_in = identity.auth_time or identity.issued_at
        return not self.disabled and (valid_after is None or signed_in > valid_after)


PROFILE_FIELDS = ("email", "name", "picture")


def search_key(text: str) -> str:
    return text.strip().casefold()


def search_keys(account: Account) -> dict[str, str]:
    """What searches by email or name compare with: the start of each, ignoring case."""
    return {"email_key": search_key(account.email or ""), "name_key": search_key(account.name or "")}


def identity_key(identity: Identity) -> str:
    """A fixed-length key for an identity: the issuer and subject, hashed."""
    return hashlib.sha256(f"{identity.issuer}|{identity.subject}".encode()).hexdigest()


def new_account(identity: Identity) -> Account:
    """A new account with an id of its own, so another provider can be linked to it later."""
    return Account(
        id=str(uuid.uuid4()),
        email=identity.email,
        name=identity.name,
        picture=identity.picture,
        created_at=datetime.now(UTC),
    )


def profile_changes(account: Account, identity: Identity) -> dict[str, Any]:
    """The profile fields the provider now reports differently."""
    now = {"email": identity.email, "name": identity.name, "picture": identity.picture}
    return {key: value for key, value in now.items() if getattr(account, key) != value}


class AccountStore(Protocol):
    def by_identity(self, identity: Identity) -> Account | None: ...

    def get(self, id: str) -> Account | None: ...

    def create(self, account: Account, identity: Identity) -> Account:
        """Stores the account linked to the identity; when one is already linked to it, returns that one."""
        ...

    def update(self, id: str, **fields: Any) -> Account:
        """Changes only the fields given, so concurrent changes to other fields are kept."""
        ...

    def newest(self, limit: int) -> list[Account]:
        """The latest accounts, newest first."""
        ...

    def search(self, text: str, limit: int) -> list[Account]:
        """Accounts whose email or name starts with the text, ignoring case."""
        ...

    def subjects(self, id: str) -> list[str]:
        """The provider subjects of the identities linked to the account."""
        ...


class MemoryAccounts:
    """Accounts kept in memory: for tests and local runs."""

    def __init__(self) -> None:
        self._accounts: dict[str, Account] = {}
        self._identities: dict[str, str] = {}
        self._subjects: dict[str, str] = {}

    def by_identity(self, identity: Identity) -> Account | None:
        id = self._identities.get(identity_key(identity))
        return self._accounts.get(id) if id else None

    def get(self, id: str) -> Account | None:
        return self._accounts.get(id)

    def create(self, account: Account, identity: Identity) -> Account:
        id = self._identities.setdefault(identity_key(identity), account.id)
        self._subjects[identity_key(identity)] = identity.subject
        return self._accounts.setdefault(id, account)

    def update(self, id: str, **fields: Any) -> Account:
        account = replace(self._accounts[id], **fields)
        self._accounts[id] = account
        return account

    def newest(self, limit: int) -> list[Account]:
        return sorted(self._accounts.values(), key=lambda a: a.created_at, reverse=True)[:limit]

    def search(self, text: str, limit: int) -> list[Account]:
        key = search_key(text)
        found = [a for a in self._accounts.values() if any(k.startswith(key) for k in search_keys(a).values())]
        return sorted(found, key=lambda a: a.created_at, reverse=True)[:limit]

    def subjects(self, id: str) -> list[str]:
        return [self._subjects[key] for key, account in self._identities.items() if account == id]


# google-cloud-firestore is only partly typed; this class is its only user here.
class FirestoreAccounts:
    def __init__(self, database: str) -> None:
        self._client = firestore.Client(database=database)  # pyright: ignore[reportUnknownMemberType]
        self._accounts = self._client.collection("accounts")  # pyright: ignore[reportUnknownMemberType]
        self._identities = self._client.collection("identities")  # pyright: ignore[reportUnknownMemberType]

    def by_identity(self, identity: Identity) -> Account | None:
        link = self._identities.document(identity_key(identity)).get()  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
        if not link.exists:  # pyright: ignore[reportUnknownMemberType]
            return None
        return self.get(cast(str, link.get("account")))  # pyright: ignore[reportUnknownMemberType]

    def get(self, id: str) -> Account | None:
        document = self._accounts.document(id).get()  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
        if not document.exists:  # pyright: ignore[reportUnknownMemberType]
            return None
        return _from_document(id, cast(dict[str, Any], document.to_dict()))  # pyright: ignore[reportUnknownMemberType]

    def create(self, account: Account, identity: Identity) -> Account:
        link = self._identities.document(identity_key(identity))  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
        target = self._accounts.document(account.id)  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]

        @firestore.transactional  # pyright: ignore[reportUnknownMemberType, reportUntypedFunctionDecorator]
        def link_or_create(transaction: Any) -> str:
            existing = link.get(transaction=transaction)  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
            if existing.exists:  # pyright: ignore[reportUnknownMemberType]
                return cast(str, existing.get("account"))  # pyright: ignore[reportUnknownMemberType]
            transaction.create(target, _to_document(account))
            transaction.create(link, {"account": account.id, "issuer": identity.issuer, "subject": identity.subject})
            return account.id

        id = link_or_create(self._client.transaction())  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
        return self.get(cast(str, id)) or account

    def update(self, id: str, **fields: Any) -> Account:
        values = {key: sorted(value) if key == "roles" else value for key, value in fields.items()}
        # The search keys follow the profile they come from.
        values |= {f"{key}_key": search_key(fields[key] or "") for key in ("email", "name") if key in fields}
        self._accounts.document(id).update(values)  # pyright: ignore[reportUnknownMemberType]
        found = self.get(id)
        if found is None:
            raise KeyError(id)
        return found

    def search(self, text: str, limit: int) -> list[Account]:
        key = search_key(text)
        found: dict[str, Account] = {}
        for indexed in ("email_key", "name_key"):
            query = (
                self._accounts.where(filter=firestore.FieldFilter(indexed, ">=", key))  # pyright: ignore[reportUnknownMemberType]
                .where(filter=firestore.FieldFilter(indexed, "<", f"{key}\uf8ff"))
                .limit(limit)
            )
            for d in query.stream():  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
                found[d.id] = _from_document(d.id, cast(dict[str, Any], d.to_dict()))  # pyright: ignore[reportUnknownMemberType, reportUnknownArgumentType]
        return sorted(found.values(), key=lambda a: a.created_at, reverse=True)[:limit]

    def newest(self, limit: int) -> list[Account]:
        query = self._accounts.order_by("created_at", direction=firestore.Query.DESCENDING).limit(limit)  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
        return [_from_document(d.id, cast(dict[str, Any], d.to_dict())) for d in query.stream()]  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType, reportUnknownArgumentType]

    def subjects(self, id: str) -> list[str]:
        query = self._identities.where(filter=firestore.FieldFilter("account", "==", id))  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
        return [cast(str, d.get("subject")) for d in query.stream()]  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]


def _to_document(account: Account) -> dict[str, Any]:
    return {
        "email": account.email,
        "name": account.name,
        "picture": account.picture,
        "created_at": account.created_at,
        "roles": sorted(account.roles),
        "sessions_valid_after": account.sessions_valid_after,
        "disabled": account.disabled,
        "bootstrapped": account.bootstrapped,
    } | search_keys(account)


def _from_document(id: str, data: dict[str, Any]) -> Account:
    return Account(
        id=id,
        email=data.get("email"),
        name=data.get("name"),
        picture=data.get("picture"),
        created_at=data["created_at"],
        roles=frozenset(Role(r) for r in data.get("roles", [])),
        sessions_valid_after=data.get("sessions_valid_after"),
        disabled=data.get("disabled", False),
        bootstrapped=data.get("bootstrapped", False),
    )


def accounts_from(source: str) -> AccountStore:
    """`firestore://<database>`, or `memory://` for a store that lives as long as the process."""
    if source.startswith("firestore://"):
        return FirestoreAccounts(source.removeprefix("firestore://"))
    if source == "memory://":
        return MemoryAccounts()
    raise ValueError(f"Unknown records source: {source}")
