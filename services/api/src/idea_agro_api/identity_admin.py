"""What the API asks of the identity provider itself, such as ending a person's sessions."""

import time
from typing import Protocol

import google.auth
from google.auth.transport.requests import AuthorizedSession

from idea_agro_api.auth import Identity


class IdentityAdmin(Protocol):
    def revoke_sessions(self, identity: Identity) -> None:
        """Ends every session of the identity at the provider, so no new token can be issued from them."""
        ...


class NoIdentityAdmin:
    """For local runs and tests: our own account record still ends the sessions."""

    def revoke_sessions(self, identity: Identity) -> None:
        return None


class IdentityPlatformAdmin:
    def __init__(self, project: str) -> None:
        self._url = f"https://identitytoolkit.googleapis.com/v1/projects/{project}/accounts:update"
        # google-auth is only partly typed; this class is its only user.
        credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
        self._session = AuthorizedSession(credentials)  # pyright: ignore[reportUnknownArgumentType]

    def revoke_sessions(self, identity: Identity) -> None:
        response = self._session.post(
            self._url, json={"localId": identity.subject, "validSince": str(int(time.time()))}, timeout=10
        )
        response.raise_for_status()


def identity_admin_from(source: str) -> IdentityAdmin:
    """`identity-platform://<project>`, or `none` when there is no provider to call."""
    if source.startswith("identity-platform://"):
        return IdentityPlatformAdmin(source.removeprefix("identity-platform://"))
    if source == "none":
        return NoIdentityAdmin()
    raise ValueError(f"Unknown identity admin: {source}")
