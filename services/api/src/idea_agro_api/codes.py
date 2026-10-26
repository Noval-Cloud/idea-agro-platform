"""Invitation codes: the code travels only in the email; the API keeps its digest."""

import hashlib
import hmac
import secrets


def new_code() -> tuple[str, str]:
    """A code too long to guess, and the digest to keep in its place."""
    code = secrets.token_urlsafe(24)
    return code, digest(code)


def digest(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def matches(code: str, kept: str) -> bool:
    return bool(kept) and hmac.compare_digest(digest(code), kept)
