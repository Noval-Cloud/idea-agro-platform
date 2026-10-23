"""Tokens signed like a provider's, with a key made for the tests."""

import time
from collections.abc import Callable
from typing import Any

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa

ISSUER = "https://issuer.example.org/demo"
AUDIENCE = "demo"
KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)

type Token = Callable[..., str]


class StaticKeys:
    def key_for(self, token: str) -> Any:
        return KEY.public_key()


def make_token(subject: str = "ana", key: Any = KEY, issued: float | None = None, **claims: Any) -> str:
    now = issued or time.time()
    body = {"iss": ISSUER, "aud": AUDIENCE, "sub": subject, "iat": int(now), "exp": int(now) + 3600}
    body |= {"email": f"{subject}@example.org", "name": subject.title(), "email_verified": True} | claims
    return jwt.encode(body, key, algorithm="RS256")


def bearer(value: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {value}"}
