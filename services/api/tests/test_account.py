import time
from dataclasses import replace
from pathlib import Path
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from idea_agro_api.accounts import Account, MemoryAccounts, Role
from idea_agro_api.app import create_app
from idea_agro_api.auth import OidcVerifier
from idea_agro_api.security import RateLimit
from idea_agro_api.services import Services
from idea_agro_api.zones import LocalFiles, ZoneStore

ISSUER = "https://issuer.example.org/demo"
AUDIENCE = "demo"
KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
OTHER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


class StaticKeys:
    def key_for(self, token: str) -> Any:
        return KEY.public_key()


def token(subject: str = "ana", key: Any = KEY, issued: float | None = None, **claims: Any) -> str:
    now = issued or time.time()
    body = {"iss": ISSUER, "aud": AUDIENCE, "sub": subject, "iat": int(now), "exp": int(now) + 3600}
    body |= {"email": f"{subject}@example.org", "name": subject.title(), "email_verified": True} | claims
    return jwt.encode(body, key, algorithm="RS256")


def bearer(value: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {value}"}


class Recorder:
    def __init__(self) -> None:
        self.revoked: list[str] = []

    def revoke_sessions(self, identity: Any) -> None:
        self.revoked.append(identity.subject)


@pytest.fixture
def accounts() -> MemoryAccounts:
    return MemoryAccounts()


@pytest.fixture
def admin() -> Recorder:
    return Recorder()


@pytest.fixture
def client(tmp_path: Path, accounts: MemoryAccounts, admin: Recorder) -> TestClient:
    services = Services(
        zones=ZoneStore(LocalFiles(tmp_path)),
        accounts=accounts,
        verifier=OidcVerifier(ISSUER, AUDIENCE, StaticKeys()),
        identity_admin=admin,
        rate_limit=RateLimit(per_minute=5),
    )
    return TestClient(create_app(services))


def test_the_first_request_creates_the_account(client: TestClient, accounts: MemoryAccounts) -> None:
    first = client.get("/v1/me", headers=bearer(token()))
    second = client.get("/v1/me", headers=bearer(token()))

    assert first.status_code == 200
    assert first.json() | {"id": "x", "created_at": "x"} == {
        "id": "x",
        "email": "ana@example.org",
        "name": "Ana",
        "picture": None,
        "roles": ["client"],
        "created_at": "x",
    }
    assert second.json()["id"] == first.json()["id"]
    assert first.headers["cache-control"] == "no-store"


def test_roles_combine_on_top_of_client(client: TestClient, accounts: MemoryAccounts) -> None:
    me = client.get("/v1/me", headers=bearer(token())).json()
    account = accounts.get(me["id"])
    assert account is not None
    accounts.save(replace(account, roles=frozenset({Role.ADMIN})))

    assert client.get("/v1/me", headers=bearer(token())).json()["roles"] == ["client", "admin"]


@pytest.mark.parametrize(
    "value",
    [
        token(key=OTHER_KEY),
        token(aud="someone-else"),
        token(iss="https://evil.example.org"),
        token(issued=time.time() - 7200),
        "not-a-token",
    ],
    ids=["signature", "audience", "issuer", "expired", "garbage"],
)
def test_an_invalid_token_is_refused(client: TestClient, value: str) -> None:
    response = client.get("/v1/me", headers=bearer(value))

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert response.headers["content-type"] == "application/problem+json"


def test_a_private_route_needs_a_token(client: TestClient) -> None:
    response = client.get("/v1/me")
    assert response.status_code == 401
    assert response.json()["title"] == "Unauthorized"


def test_logging_out_everywhere_refuses_older_tokens(client: TestClient, admin: Recorder) -> None:
    old = token(issued=time.time() - 60)

    assert client.post("/v1/me/sessions/revoke", headers=bearer(old)).status_code == 204
    assert admin.revoked == ["ana"]
    assert client.get("/v1/me", headers=bearer(old)).status_code == 401
    assert client.get("/v1/me", headers=bearer(token(issued=time.time() + 1))).status_code == 200


def test_a_disabled_account_is_refused(client: TestClient, accounts: MemoryAccounts) -> None:
    me = client.get("/v1/me", headers=bearer(token())).json()
    account: Account | None = accounts.get(me["id"])
    assert account is not None
    accounts.save(replace(account, disabled=True))

    assert client.get("/v1/me", headers=bearer(token())).status_code == 403


def test_private_routes_are_rate_limited(client: TestClient) -> None:
    statuses = [client.get("/v1/me", headers=bearer(token())).status_code for _ in range(6)]

    assert statuses == [200] * 5 + [429]
    assert int(client.get("/v1/me", headers=bearer(token())).headers["retry-after"]) <= 60


def test_without_sign_in_configured_private_routes_are_unavailable(tmp_path: Path) -> None:
    client = TestClient(create_app(Services(zones=ZoneStore(LocalFiles(tmp_path)), accounts=MemoryAccounts())))
    assert client.get("/v1/me", headers=bearer(token())).status_code == 503


def test_every_response_carries_security_headers(client: TestClient) -> None:
    api = client.get("/health")
    docs = client.get("/docs")

    assert api.headers["x-content-type-options"] == "nosniff"
    assert api.headers["x-frame-options"] == "DENY"
    assert api.headers["content-security-policy"] == "default-src 'none'; frame-ancestors 'none'"
    assert "content-security-policy" not in docs.headers
    assert docs.headers["strict-transport-security"].startswith("max-age=")


def test_a_token_crosses_origins(client: TestClient) -> None:
    response = client.options(
        "/v1/me",
        headers={
            "Origin": "https://example.org",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    assert response.headers["access-control-allow-origin"] == "*"
    assert "authorization" in response.headers["access-control-allow-headers"].lower()
