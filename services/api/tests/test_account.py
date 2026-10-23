import base64
import json
import time
from pathlib import Path
from typing import Any

import jwt
import pytest
from auth_tokens import KEY, bearer, make_token
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from idea_agro_api.accounts import MemoryAccounts, Role
from idea_agro_api.app import create_app
from idea_agro_api.auth import OidcVerifier
from idea_agro_api.security import RateLimit
from idea_agro_api.services import Services, services_for_tests
from idea_agro_api.zones import LocalFiles, ZoneStore

OTHER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
token = make_token


class Recorder:
    def __init__(self, fails: bool = False) -> None:
        self.revoked: list[str] = []
        self.fails = fails

    def revoke_sessions(self, identity: Any) -> None:
        if self.fails:
            raise ConnectionError("provider down")
        self.revoked.append(identity.subject)


@pytest.fixture
def accounts() -> MemoryAccounts:
    return MemoryAccounts()


@pytest.fixture
def admin() -> Recorder:
    return Recorder()


def build(tmp_path: Path, accounts: MemoryAccounts, admin: Recorder, verifier: OidcVerifier, per_minute: int = 5):
    services = services_for_tests(
        ZoneStore(LocalFiles(tmp_path)),
        verifier=verifier,
        accounts=accounts,
        identity_admin=admin,
        rate_limit=RateLimit(per_minute=per_minute),
    )
    return TestClient(create_app(services))


@pytest.fixture
def client(tmp_path: Path, accounts: MemoryAccounts, admin: Recorder, verifier: OidcVerifier) -> TestClient:
    return build(tmp_path, accounts, admin, verifier, per_minute=50)


def test_the_first_request_creates_the_account(client: TestClient) -> None:
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
    accounts.update(me["id"], roles=frozenset({Role.ADMIN}))

    assert client.get("/v1/me", headers=bearer(token())).json()["roles"] == ["client", "admin"]


def test_the_profile_follows_the_provider(client: TestClient) -> None:
    client.get("/v1/me", headers=bearer(token(name="Ana")))
    assert client.get("/v1/me", headers=bearer(token(name="Ana María"))).json()["name"] == "Ana María"


def unsigned(**claims: Any) -> str:
    """A token with `alg: none` and no signature."""
    now = int(time.time())
    body = {"iss": "https://issuer.example.org/demo", "aud": "demo", "sub": "ana", "iat": now, "exp": now + 3600}

    def part(value: dict[str, Any]) -> str:
        return base64.urlsafe_b64encode(json.dumps(value).encode()).rstrip(b"=").decode()

    return f"{part({'alg': 'none', 'typ': 'JWT'})}.{part(body | claims)}."


@pytest.mark.parametrize(
    "value",
    [
        token(key=OTHER_KEY),
        token(aud="someone-else"),
        token(iss="https://evil.example.org"),
        token(issued=time.time() - 7200),
        token(issued=time.time() + 600),
        token(sub=""),
        unsigned(),
        jwt.encode({"sub": "ana", "aud": "demo"}, "x" * 32, algorithm="HS256"),
        jwt.encode({"iss": "https://issuer.example.org/demo", "aud": "demo", "sub": "ana"}, KEY, algorithm="RS256"),
        "not-a-token",
    ],
    ids=[
        "signature",
        "audience",
        "issuer",
        "expired",
        "future",
        "no-subject",
        "alg-none",
        "hs256",
        "no-exp",
        "garbage",
    ],
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


def test_logging_out_everywhere_refuses_earlier_sign_ins(client: TestClient, admin: Recorder) -> None:
    signed_in = int(time.time()) - 60

    assert client.post("/v1/me/sessions/revoke", headers=bearer(token(auth_time=signed_in))).status_code == 204
    now = int(time.time())

    assert admin.revoked == ["ana"]
    # A token refreshed now from the old sign-in keeps its auth_time, so it is refused.
    assert client.get("/v1/me", headers=bearer(token(auth_time=signed_in))).status_code == 401
    assert client.get("/v1/me", headers=bearer(token(auth_time=now))).status_code == 401
    assert client.get("/v1/me", headers=bearer(token(auth_time=now + 1, issued=now + 1))).status_code == 200


def test_a_profile_change_keeps_the_log_out(client: TestClient) -> None:
    signed_in = int(time.time()) - 60
    client.post("/v1/me/sessions/revoke", headers=bearer(token(auth_time=signed_in)))
    later = int(time.time()) + 1

    assert client.get("/v1/me", headers=bearer(token(auth_time=later, issued=later, name="Otra"))).status_code == 200
    assert client.get("/v1/me", headers=bearer(token(auth_time=signed_in))).status_code == 401


def test_a_provider_failure_still_ends_our_sessions(
    tmp_path: Path, accounts: MemoryAccounts, verifier: OidcVerifier
) -> None:
    client = build(tmp_path, accounts, Recorder(fails=True), verifier, per_minute=50)
    signed_in = int(time.time()) - 60

    response = client.post("/v1/me/sessions/revoke", headers=bearer(token(auth_time=signed_in)))

    assert response.status_code == 503
    assert response.headers["content-type"] == "application/problem+json"
    assert client.get("/v1/me", headers=bearer(token(auth_time=signed_in))).status_code == 401


def test_a_disabled_account_is_refused(client: TestClient, accounts: MemoryAccounts) -> None:
    me = client.get("/v1/me", headers=bearer(token())).json()
    accounts.update(me["id"], disabled=True)

    assert client.get("/v1/me", headers=bearer(token())).status_code == 403


def test_private_routes_are_rate_limited_by_address(
    tmp_path: Path, accounts: MemoryAccounts, admin: Recorder, verifier: OidcVerifier
) -> None:
    client = build(tmp_path, accounts, admin, verifier, per_minute=5)
    # Google's front end appends the real address last; earlier entries are the caller's to invent.
    spoofed = [{"X-Forwarded-For": f"10.0.0.{i}, 203.0.113.9"} for i in range(6)]

    statuses = [client.get("/v1/me", headers=bearer(token(sub=f"s{i}")) | h).status_code for i, h in enumerate(spoofed)]

    assert statuses == [200] * 5 + [429]
    assert int(client.get("/v1/me", headers=bearer(token()) | spoofed[0]).headers["retry-after"]) <= 60


def test_private_routes_are_rate_limited_by_account(
    tmp_path: Path, accounts: MemoryAccounts, admin: Recorder, verifier: OidcVerifier
) -> None:
    client = build(tmp_path, accounts, admin, verifier, per_minute=5)
    addresses = [{"X-Forwarded-For": f"203.0.113.{i}"} for i in range(6)]

    statuses = [client.get("/v1/me", headers=bearer(token()) | h).status_code for h in addresses]

    assert statuses == [200] * 5 + [429]


def test_without_sign_in_configured_private_routes_are_unavailable(tmp_path: Path) -> None:
    client = TestClient(create_app(services_for_tests(ZoneStore(LocalFiles(tmp_path)))))
    assert client.get("/v1/me", headers=bearer(token())).status_code == 503


def test_sign_in_refuses_to_keep_accounts_in_memory(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    for name, value in {
        "ZONES_SOURCE": str(tmp_path),
        "AUTH_ISSUER": "https://issuer.example.org/demo",
        "AUTH_AUDIENCE": "demo",
        "AUTH_JWKS_URL": "https://issuer.example.org/keys",
    }.items():
        monkeypatch.setenv(name, value)
    monkeypatch.delenv("RECORDS_SOURCE", raising=False)

    with pytest.raises(RuntimeError, match="RECORDS_SOURCE"):
        Services.from_env()


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
