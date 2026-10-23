"""What the API asks of the identity provider itself, such as ending a person's sessions."""

import time
from typing import Protocol

import google.auth
from google.auth.transport.requests import AuthorizedSession


class IdentityAdmin(Protocol):
    def revoke_sessions(self, subject: str) -> None:
        """Ends every session of the identity at the provider, so no new token can be issued from them."""
        ...

    def set_disabled(self, subject: str, disabled: bool) -> None: ...

    def send_recovery(self, email: str) -> None:
        """Has the provider email a password recovery link, which expires and works once."""
        ...


class NoIdentityAdmin:
    """For local runs and tests, with no provider to call: only the account's own record changes."""

    def revoke_sessions(self, subject: str) -> None:
        return None

    def set_disabled(self, subject: str, disabled: bool) -> None:
        return None

    def send_recovery(self, email: str) -> None:
        return None


class IdentityPlatformAdmin:
    def __init__(self, project: str) -> None:
        self._accounts = f"https://identitytoolkit.googleapis.com/v1/projects/{project}/accounts"
        # google-auth is only partly typed; this class is its only user.
        credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
        self._session = AuthorizedSession(credentials)  # pyright: ignore[reportUnknownArgumentType]

    def _post(self, action: str, body: dict[str, str | bool]) -> None:
        response = self._session.post(f"{self._accounts}:{action}", json=body, timeout=10)
        response.raise_for_status()

    def revoke_sessions(self, subject: str) -> None:
        self._post("update", {"localId": subject, "validSince": str(int(time.time()))})

    def set_disabled(self, subject: str, disabled: bool) -> None:
        self._post("update", {"localId": subject, "disableUser": disabled})

    def send_recovery(self, email: str) -> None:
        self._post("sendOobCode", {"requestType": "PASSWORD_RESET", "email": email})


def identity_admin_from(source: str) -> IdentityAdmin:
    """`identity-platform://<project>`, or `none` when there is no provider to call."""
    if source.startswith("identity-platform://"):
        return IdentityPlatformAdmin(source.removeprefix("identity-platform://"))
    if source == "none":
        return NoIdentityAdmin()
    raise ValueError(f"Unknown identity admin: {source}")
