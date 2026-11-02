"""When the website rebuilds with the texts editors published.

The API records each publish (`site_state/texts` in Firestore). The data job's `site` task asks for a build once they
settle, and an editor can ask at once. Asking publishes a message to the topic the website's build trigger listens
to: neither the API nor the job can start builds themselves.
"""

import base64
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Protocol, cast

import google.auth
from google.auth.credentials import Credentials
from google.auth.transport.requests import AuthorizedSession
from google.cloud import firestore  # pyright: ignore[reportMissingTypeStubs]

log = logging.getLogger(__name__)

COLLECTION, DOCUMENT = "site_state", "texts"
PUBSUB_SCOPE = "https://www.googleapis.com/auth/pubsub"


@dataclass(frozen=True)
class Rebuild:
    # When a text was last published, and when the latest build was asked for.
    published_at: datetime | None
    started_at: datetime | None


class RebuildUnavailable(RuntimeError):
    pass


class SiteRebuild(Protocol):
    def read(self) -> Rebuild: ...

    def published(self, at: datetime) -> None:
        """Records that a text was published: the site is behind until it rebuilds."""
        ...

    def start(self, at: datetime) -> None:
        """Asks for the build now, or raises `RebuildUnavailable` where nothing can build the site."""
        ...


@dataclass
class MemorySiteRebuild:
    """For local runs and tests: records the publishes and the builds asked for."""

    state: Rebuild = field(default_factory=lambda: Rebuild(None, None))
    builds: list[datetime] = field(default_factory=list[datetime])

    def read(self) -> Rebuild:
        return self.state

    def published(self, at: datetime) -> None:
        self.state = Rebuild(at, self.state.started_at)

    def start(self, at: datetime) -> None:
        self.builds.append(at)
        self.state = Rebuild(self.state.published_at, at)


# google-cloud-firestore and google-auth are only partly typed; this class is their only user here.
class CloudSiteRebuild:
    def __init__(self, database: str, topic: str) -> None:
        """`topic` is the build trigger's topic, `projects/<project>/topics/<name>`; empty where there is none."""
        client = firestore.Client(database=database)  # pyright: ignore[reportUnknownMemberType]
        self._document = client.collection(COLLECTION).document(DOCUMENT)  # pyright: ignore[reportUnknownMemberType]
        self._topic = topic
        self._session: AuthorizedSession | None = None

    def read(self) -> Rebuild:
        record = self._document.get()  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
        found: dict[str, Any] = (record.to_dict() or {}) if record.exists else {}  # pyright: ignore[reportUnknownMemberType]
        return Rebuild(found.get("published_at"), found.get("started_at"))

    def published(self, at: datetime) -> None:
        self._document.set({"published_at": at}, merge=True)  # pyright: ignore[reportUnknownMemberType]

    def start(self, at: datetime) -> None:
        if not self._topic:
            raise RebuildUnavailable("Nothing builds the site in this environment.")
        if self._session is None:
            credentials = cast(Credentials, google.auth.default(scopes=[PUBSUB_SCOPE])[0])  # pyright: ignore[reportUnknownMemberType]
            self._session = AuthorizedSession(credentials)
        message = {"data": base64.b64encode(b"texts published").decode(), "attributes": {"reason": "texts"}}
        try:
            response = self._session.post(
                f"https://pubsub.googleapis.com/v1/{self._topic}:publish", json={"messages": [message]}, timeout=10
            )
            response.raise_for_status()
        except Exception as error:
            log.warning("The website's build could not be asked for", exc_info=True)
            raise RebuildUnavailable("The site's build could not be asked for; try again in a moment.") from error
        self._document.set({"started_at": at}, merge=True)  # pyright: ignore[reportUnknownMemberType]


def site_rebuild_from(records: str, topic: str) -> SiteRebuild:
    """Where texts are recorded (`firestore://<database>` or `memory://`), and the build trigger's topic, if any."""
    if records.startswith("firestore://"):
        return CloudSiteRebuild(records.removeprefix("firestore://"), topic)
    if records == "memory://":
        return MemorySiteRebuild()
    raise ValueError(f"Unknown records source: {records}")
