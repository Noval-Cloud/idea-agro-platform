import time
from typing import Any

import pytest
from auth_tokens import bearer, make_token
from fastapi.testclient import TestClient
from idea_agro_api.app import create_app
from idea_agro_api.auth import OidcVerifier
from idea_agro_api.services import services_for_tests

ANA = bearer(make_token("ana"))
BO = bearer(make_token("bo"))


class Provider:
    def __init__(self) -> None:
        self.revoked: list[str] = []
        self.disabled: dict[str, bool] = {}
        self.recovered: list[str] = []

    def revoke_sessions(self, subject: str) -> None:
        self.revoked.append(subject)

    def set_disabled(self, subject: str, disabled: bool) -> None:
        self.disabled[subject] = disabled

    def send_recovery(self, email: str) -> None:
        self.recovered.append(email)


@pytest.fixture
def provider() -> Provider:
    return Provider()


def build(verifier: OidcVerifier, provider: Provider, **overrides: Any) -> TestClient:
    services = services_for_tests(
        verifier=verifier, identity_admin=provider, admin_emails=frozenset({"ana@example.org"}), **overrides
    )
    return TestClient(create_app(services))


@pytest.fixture
def client(verifier: OidcVerifier, provider: Provider) -> TestClient:
    return build(verifier, provider)


def account_of(client: TestClient, headers: dict[str, str]) -> str:
    return client.get("/v1/me", headers=headers).json()["id"]


def stale(subject: str = "ana") -> dict[str, str]:
    """A token from a sign-in an hour ago, refreshed now."""
    return bearer(make_token(subject, auth_time=int(time.time()) - 3600))


def test_the_first_admins_come_from_the_configuration(client: TestClient) -> None:
    unverified = bearer(make_token("ana", email_verified=False))

    assert "admin" not in client.get("/v1/me", headers=unverified).json()["roles"]
    assert client.get("/v1/me", headers=ANA).json()["roles"] == ["client", "admin"]
    assert client.get("/v1/me", headers=BO).json()["roles"] == ["client"]
    assert [e["action"] for e in client.get("/v1/admin/audit", headers=ANA).json()] == ["admin_bootstrapped"]


def test_only_admins_reach_the_admin_routes(client: TestClient) -> None:
    bo = account_of(client, BO)

    assert client.get("/v1/admin/accounts", headers=BO).status_code == 403
    assert client.put(f"/v1/admin/accounts/{bo}/roles", json={"roles": ["admin"]}, headers=BO).status_code == 403
    assert client.get("/v1/admin/audit", headers=BO).status_code == 403
    assert client.get("/v1/admin/accounts").status_code == 401


def test_accounts_are_searched_by_name_or_email(client: TestClient) -> None:
    account_of(client, BO)
    account_of(client, bearer(make_token("cy")))

    found = client.get("/v1/admin/accounts", params={"q": "BO@"}, headers=ANA).json()

    assert [a["email"] for a in found] == ["bo@example.org"]
    assert len(client.get("/v1/admin/accounts", headers=ANA).json()) == 3


def test_roles_change_with_a_recent_sign_in(client: TestClient) -> None:
    bo = account_of(client, BO)

    old = client.put(f"/v1/admin/accounts/{bo}/roles", json={"roles": ["editor"]}, headers=stale())
    fresh = client.put(f"/v1/admin/accounts/{bo}/roles", json={"roles": ["editor"]}, headers=ANA)

    assert old.status_code == 403
    assert old.json()["type"] == "urn:idea-agro:problem:recent-sign-in-required"
    assert fresh.json()["roles"] == ["client", "editor"]
    assert client.get("/v1/me", headers=BO).json()["roles"] == ["client", "editor"]


def test_an_admin_keeps_their_own_admin_role(client: TestClient) -> None:
    ana = account_of(client, ANA)
    assert client.put(f"/v1/admin/accounts/{ana}/roles", json={"roles": []}, headers=ANA).status_code == 409


def test_an_account_is_logged_out_everywhere(client: TestClient, provider: Provider) -> None:
    signed_in = int(time.time()) - 60
    bo = account_of(client, bearer(make_token("bo", auth_time=signed_in)))

    assert client.post(f"/v1/admin/accounts/{bo}/sessions/revoke", headers=ANA).status_code == 204
    assert client.get("/v1/me", headers=bearer(make_token("bo", auth_time=signed_in))).status_code == 401
    assert provider.revoked == ["bo"]


def test_a_disabled_account_is_refused_until_enabled(client: TestClient, provider: Provider) -> None:
    bo = account_of(client, BO)

    disabled = client.put(f"/v1/admin/accounts/{bo}/access", json={"disabled": True}, headers=ANA)
    refused = client.get("/v1/me", headers=BO)
    client.put(f"/v1/admin/accounts/{bo}/access", json={"disabled": False}, headers=ANA)

    assert disabled.json()["disabled"] is True
    assert refused.status_code == 403
    assert client.get("/v1/me", headers=BO).status_code == 200
    assert provider.disabled == {"bo": False}
    assert client.put(f"/v1/admin/accounts/{bo}/access", json={"disabled": True}, headers=stale()).status_code == 403


def test_an_admin_cannot_disable_themself(client: TestClient) -> None:
    ana = account_of(client, ANA)
    assert client.put(f"/v1/admin/accounts/{ana}/access", json={"disabled": True}, headers=ANA).status_code == 409


def test_recovery_links_need_password_sign_in(verifier: OidcVerifier, provider: Provider) -> None:
    without = build(verifier, provider)
    with_passwords = build(verifier, provider, password_sign_in=True)

    refused = without.post(f"/v1/admin/accounts/{account_of(without, BO)}/recovery", headers=ANA)
    sent = with_passwords.post(f"/v1/admin/accounts/{account_of(with_passwords, BO)}/recovery", headers=ANA)

    assert refused.status_code == 409
    assert sent.status_code == 204
    assert provider.recovered == ["bo@example.org"]


def test_every_admin_action_is_recorded(client: TestClient) -> None:
    bo = account_of(client, BO)
    client.put(f"/v1/admin/accounts/{bo}/roles", json={"roles": ["editor", "admin"]}, headers=ANA)
    client.put(f"/v1/admin/accounts/{bo}/access", json={"disabled": True}, headers=ANA)

    audit = client.get("/v1/admin/audit", headers=ANA).json()

    assert [(e["actor_name"], e["action"], e["target_email"], e["detail"]) for e in audit] == [
        ("Ana", "disabled", "bo@example.org", ""),
        ("Ana", "roles_changed", "bo@example.org", "admin,editor"),
        ("Ana", "admin_bootstrapped", "ana@example.org", ""),
    ]
