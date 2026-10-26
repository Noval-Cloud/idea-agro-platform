"""Emails the API sends, through a provider the rest of the code never names."""

import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class Email:
    to: str
    subject: str
    text: str
    html: str


class MailFailed(Exception):
    """The provider refused the email or could not be reached."""


class Mailer(Protocol):
    def send(self, email: Email) -> None:
        """Hands the email to the provider; raises `MailFailed` when it does not take it."""
        ...


class NoMailer:
    """For local runs with no provider: nothing leaves, and callers learn nothing was sent."""

    def send(self, email: Email) -> None:
        raise MailFailed("No mail provider is configured.")


class MemoryMailer:
    """For tests: keeps what would have been sent, or fails when told to."""

    def __init__(self, failing: bool = False) -> None:
        self.sent: list[Email] = []
        self.failing = failing

    def send(self, email: Email) -> None:
        if self.failing:
            raise MailFailed("The provider is down.")
        self.sent.append(email)


class ResendMailer:
    def __init__(self, key: str, sender: str, endpoint: str = "https://api.resend.com/emails") -> None:
        self._key = key
        self._sender = sender
        self._endpoint = endpoint

    def send(self, email: Email) -> None:
        body = {
            "from": self._sender,
            "to": [email.to],
            "subject": email.subject,
            "text": email.text,
            "html": email.html,
        }
        request = urllib.request.Request(
            self._endpoint,
            data=json.dumps(body).encode(),
            headers={
                "Authorization": f"Bearer {self._key}",
                "Content-Type": "application/json",
                "User-Agent": "idea-agro-api",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=10):
                return None
        except (urllib.error.URLError, TimeoutError) as error:
            raise MailFailed(str(error)) from error


def mailer_from(source: str, key: str, sender: str) -> Mailer:
    """`resend://` with the provider's key and the sender (`Name <address>`), or `none`."""
    if source == "resend://":
        if not key or not sender:
            raise ValueError("resend:// needs MAIL_API_KEY and MAIL_FROM")
        return ResendMailer(key, sender)
    if source == "none":
        return NoMailer()
    raise ValueError(f"Unknown mail source: {source}")
