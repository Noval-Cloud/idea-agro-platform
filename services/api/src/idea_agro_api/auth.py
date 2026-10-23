"""Who is calling: tokens are checked as standard OIDC JWTs, so any provider that issues them fits."""

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Protocol

import jwt


class InvalidToken(Exception):
    pass


@dataclass(frozen=True)
class Identity:
    """What a valid token says about the caller."""

    issuer: str
    subject: str
    issued_at: datetime
    auth_time: datetime | None
    email: str | None
    email_verified: bool
    name: str | None
    picture: str | None


class TokenVerifier(Protocol):
    def verify(self, token: str) -> Identity:
        """The token's identity, or InvalidToken."""
        ...


class SigningKeys(Protocol):
    def key_for(self, token: str) -> Any:
        """The public key that signed the token."""
        ...


class PublishedKeys:
    """The issuer's keys, fetched from its JWKS URL and cached."""

    def __init__(self, url: str) -> None:
        self._client = jwt.PyJWKClient(url, cache_keys=True, lifespan=3600)

    def key_for(self, token: str) -> Any:
        return self._client.get_signing_key_from_jwt(token).key


def _moment(seconds: Any) -> datetime | None:
    return datetime.fromtimestamp(seconds, UTC) if isinstance(seconds, int | float) else None


class OidcVerifier:
    def __init__(self, issuer: str, audience: str, keys: SigningKeys) -> None:
        self._issuer = issuer
        self._audience = audience
        self._keys = keys

    def verify(self, token: str) -> Identity:
        try:
            claims: dict[str, Any] = jwt.decode(
                token,
                self._keys.key_for(token),
                algorithms=["RS256"],
                audience=self._audience,
                issuer=self._issuer,
                options={"require": ["exp", "iat", "sub", "aud", "iss"]},
                leeway=30,
            )
        except (jwt.PyJWTError, ValueError) as error:
            raise InvalidToken(str(error)) from error
        issued_at = _moment(claims["iat"])
        if issued_at is None or not claims["sub"]:
            raise InvalidToken("The token has no issue time or subject")
        return Identity(
            issuer=self._issuer,
            subject=str(claims["sub"]),
            issued_at=issued_at,
            auth_time=_moment(claims.get("auth_time")),
            email=claims.get("email"),
            email_verified=claims.get("email_verified") is True,
            name=claims.get("name"),
            picture=claims.get("picture"),
        )
