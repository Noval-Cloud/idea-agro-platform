from pathlib import Path
from typing import Any

from auth_tokens import bearer, make_token
from fastapi.testclient import TestClient
from idea_agro_api.app import create_app
from idea_agro_api.auth import OidcVerifier
from idea_agro_api.mail import MemoryMailer
from idea_agro_api.services import Limits, services_for_tests
from idea_agro_api.zones import LocalFiles

ANA = bearer(make_token("ana"))
BO = bearer(make_token("bo"))
SITE = "https://site.example"


def app(tmp_path: Path, verifier: OidcVerifier, outbox: MemoryMailer, **limits: Any) -> TestClient:
    services = services_for_tests(
        files=LocalFiles(tmp_path), verifier=verifier, mailer=outbox, site_url=SITE, limits=Limits(**limits)
    )
    return TestClient(create_app(services))


def invite(client: TestClient, email: str = "Bo@Example.org", language: str = "es", headers: Any = ANA) -> Any:
    return client.post("/v1/me/invitations", json={"email": email, "language": language}, headers=headers)


def test_an_invitation_is_emailed_and_followed(tmp_path: Path, verifier: OidcVerifier) -> None:
    outbox = MemoryMailer()
    client = app(tmp_path, verifier, outbox)

    sent = invite(client, language="en")

    assert sent.status_code == 201
    assert sent.json()["invitation_sent"] is True
    assert sent.json()["state"] == "pending"
    [email] = outbox.sent
    assert email.to == "bo@example.org"
    assert email.subject == "Ana invites you to IDEA-Agro"
    assert f"Sign in to IDEA-Agro: {SITE}/en/login/" in email.text
    [listed] = client.get("/v1/me/invitations", headers=ANA).json()
    assert listed["email"] == "bo@example.org"
    assert "invitation_sent" not in listed


def test_it_is_accepted_when_that_email_joins(tmp_path: Path, verifier: OidcVerifier) -> None:
    client = app(tmp_path, verifier, MemoryMailer())
    invite(client)

    client.get("/v1/me", headers=BO)

    [listed] = client.get("/v1/me/invitations", headers=ANA).json()
    assert listed["state"] == "accepted"
    assert listed["accepted_at"] is not None


def test_an_unverified_email_accepts_nothing(tmp_path: Path, verifier: OidcVerifier) -> None:
    client = app(tmp_path, verifier, MemoryMailer())
    invite(client)

    client.get("/v1/me", headers=bearer(make_token("bo", email_verified=False)))

    assert client.get("/v1/me/invitations", headers=ANA).json()[0]["state"] == "pending"


def test_an_invitation_expires(tmp_path: Path, verifier: OidcVerifier) -> None:
    client = app(tmp_path, verifier, MemoryMailer(), invitation_days=0)
    invite(client)

    client.get("/v1/me", headers=BO)

    assert client.get("/v1/me/invitations", headers=ANA).json()[0]["state"] == "expired"


def test_invitations_are_capped(tmp_path: Path, verifier: OidcVerifier) -> None:
    client = app(tmp_path, verifier, MemoryMailer(), platform_invitations_per_day=2)

    assert invite(client, "ana@example.org").status_code == 422
    assert invite(client, "bo@example.org").status_code == 201
    assert invite(client, "BO@example.org").status_code == 409
    assert invite(client, "cy@example.org").status_code == 201
    capped = invite(client, "di@example.org")
    assert capped.status_code == 429
    assert int(capped.headers["Retry-After"]) > 0


def test_deleting_and_inviting_again_spends_the_same_budget(tmp_path: Path, verifier: OidcVerifier) -> None:
    outbox = MemoryMailer()
    client = app(tmp_path, verifier, outbox, platform_invitations_per_day=2)

    for _ in range(2):
        sent = invite(client).json()
        assert client.delete(f"/v1/me/invitations/{sent['id']}", headers=ANA).status_code == 204

    assert invite(client).status_code == 429
    assert len(outbox.sent) == 2
    assert client.get("/v1/me/invitations", headers=ANA).json() == []


def test_resending_spends_the_budget_too(tmp_path: Path, verifier: OidcVerifier) -> None:
    client = app(tmp_path, verifier, MemoryMailer(), platform_invitations_per_day=2, invitation_resend_minutes=0)
    sent = invite(client).json()

    assert client.post(f"/v1/me/invitations/{sent['id']}/resend", json={}, headers=ANA).status_code == 200
    assert client.post(f"/v1/me/invitations/{sent['id']}/resend", json={}, headers=ANA).status_code == 429


def test_an_unverified_email_invites_no_one(tmp_path: Path, verifier: OidcVerifier) -> None:
    client = app(tmp_path, verifier, MemoryMailer())

    assert invite(client, headers=bearer(make_token("ana", email_verified=False))).status_code == 403


def test_the_email_shows_who_invites_by_a_clean_name_and_their_address(tmp_path: Path, verifier: OidcVerifier) -> None:
    outbox = MemoryMailer()
    client = app(tmp_path, verifier, outbox)
    name = "Alerta\u202e de seguridad:\n verificá tu cuenta en evil.example " + "x" * 80

    invite(client, headers=bearer(make_token("ana", name=name)))

    [email] = outbox.sent
    assert "\u202e" not in email.subject
    assert "\n" not in email.subject
    assert email.subject.startswith("Alerta de seguridad: verificá tu cuenta")
    assert "…" in email.subject
    assert "(ana@example.org) te invita" in email.text


def test_an_invitation_is_resent_with_a_new_term_but_not_at_once(tmp_path: Path, verifier: OidcVerifier) -> None:
    outbox = MemoryMailer()
    client = app(tmp_path, verifier, outbox, invitation_resend_minutes=0)
    sent = invite(client).json()
    again = client.post(f"/v1/me/invitations/{sent['id']}/resend", json={"language": "pt"}, headers=ANA)

    assert again.status_code == 200
    assert again.json()["invited_until"] >= sent["invited_until"]
    assert outbox.sent[-1].subject == "Ana convida você para o IDEA-Agro"


def test_a_fresh_invitation_waits_before_it_is_resent(tmp_path: Path, verifier: OidcVerifier) -> None:
    client = app(tmp_path, verifier, MemoryMailer())
    sent = invite(client).json()

    again = client.post(f"/v1/me/invitations/{sent['id']}/resend", json={}, headers=ANA)

    assert again.status_code == 429
    assert int(again.headers["Retry-After"]) > 0


def test_only_its_sender_sees_or_deletes_an_invitation(tmp_path: Path, verifier: OidcVerifier) -> None:
    client = app(tmp_path, verifier, MemoryMailer())
    sent = invite(client).json()

    assert client.get("/v1/me/invitations", headers=BO).json() == []
    assert client.delete(f"/v1/me/invitations/{sent['id']}", headers=BO).status_code == 404
    assert client.delete(f"/v1/me/invitations/{sent['id']}", headers=ANA).status_code == 204
    assert client.get("/v1/me/invitations", headers=ANA).json() == []
