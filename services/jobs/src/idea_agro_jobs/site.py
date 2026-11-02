"""The site task: starts the website's build once the texts editors published have settled.

The API records when a text was last published (`site_state/texts` in Firestore). Run every few minutes, this task asks
for a build once no text has been published for `QUIET`, so a batch of changes is one build. Asking means publishing
a message to the topic the website's build trigger listens to: the job cannot start builds itself.
"""

import base64
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Protocol, cast

import google.auth
from google.auth.credentials import Credentials
from google.auth.transport.requests import AuthorizedSession
from google.cloud import firestore  # pyright: ignore[reportMissingTypeStubs]

log = logging.getLogger(__name__)

QUIET = timedelta(minutes=5)
COLLECTION, DOCUMENT = "site_state", "texts"
PUBSUB_SCOPE = "https://www.googleapis.com/auth/pubsub"


@dataclass(frozen=True)
class Rebuild:
    # When a text was last published, and when the latest build was asked for.
    published_at: datetime | None
    started_at: datetime | None


class SiteState(Protocol):
    def read(self) -> Rebuild: ...

    def started(self, at: datetime) -> None: ...


class Builds(Protocol):
    def start(self) -> None:
        """Asks for the website's build."""
        ...


def due(state: Rebuild, now: datetime) -> bool:
    """Whether texts were published since the latest build was asked for, and none in the last `QUIET`."""
    if state.published_at is None or now - state.published_at < QUIET:
        return False
    return state.started_at is None or state.published_at > state.started_at


def refresh(state: SiteState, builds: Builds, now: datetime | None = None) -> None:
    at = now or datetime.now(UTC)
    found = state.read()
    if not due(found, at):
        log.info("site: nothing to build")
        return
    builds.start()
    state.started(at)
    log.info("site: build asked for the texts published at %s", found.published_at)


# google-cloud-firestore is only partly typed; this class is its only user here.
class FirestoreSiteState:
    def __init__(self, database: str) -> None:
        client = firestore.Client(database=database)  # pyright: ignore[reportUnknownMemberType]
        self._document = client.collection(COLLECTION).document(DOCUMENT)  # pyright: ignore[reportUnknownMemberType]

    def read(self) -> Rebuild:
        record = self._document.get()  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
        found: dict[str, Any] = (record.to_dict() or {}) if record.exists else {}  # pyright: ignore[reportUnknownMemberType]
        return Rebuild(found.get("published_at"), found.get("started_at"))

    def started(self, at: datetime) -> None:
        self._document.set({"started_at": at}, merge=True)  # pyright: ignore[reportUnknownMemberType]


class PubSubBuilds:
    def __init__(self, topic: str) -> None:
        """`topic` is the topic's full name, `projects/<project>/topics/<name>`."""
        self._topic = topic
        credentials = cast(Credentials, google.auth.default(scopes=[PUBSUB_SCOPE])[0])  # pyright: ignore[reportUnknownMemberType]
        self._session = AuthorizedSession(credentials)

    def start(self) -> None:
        message = {"data": base64.b64encode(b"texts published").decode(), "attributes": {"reason": "texts"}}
        response = self._session.post(
            f"https://pubsub.googleapis.com/v1/{self._topic}:publish", json={"messages": [message]}, timeout=30
        )
        response.raise_for_status()
