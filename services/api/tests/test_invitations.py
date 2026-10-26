import json
import urllib.request
from collections.abc import Callable
from dataclasses import replace
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlsplit

import pytest
from auth_tokens import bearer, make_token
from fastapi.testclient import TestClient
from idea_agro_api import mail
from idea_agro_api.app import create_app
from idea_agro_api.auth import OidcVerifier
from idea_agro_api.mail import Email, MailFailed, MemoryMailer, NoMailer, ResendMailer, mailer_from
from idea_agro_api.projects import Member, MemberRole, Project
from idea_agro_api.services import Limits, services_for_tests
from idea_agro_api.zones import LocalFiles

ANA = bearer(make_token("ana"))
BO = bearer(make_token("bo"))
CY = bearer(make_token("cy"))
SITE = "https://site.example"


def app(tmp_path: Path, verifier: OidcVerifier, mailer: mail.Mailer, days: int = 7, pause: int = 10) -> TestClient:
    services = services_for_tests(
        files=LocalFiles(tmp_path),
        verifier=verifier,
        mailer=mailer,
        site_url=SITE,
        limits=Limits(invitation_days=days, invitation_resend_minutes=pause),
    )
    return TestClient(create_app(services))


def code_of(sent: Email) -> dict[str, str]:
    """The project and the code an invitation email's link carries."""
    page = parse_qs(urlsplit(sent.text.split("https://")[1].split()[0]).fragment)
    return {"project_id": page["project"][0], "code": page["code"][0]}


def project(client: TestClient, name: str = "Campo") -> str:
    return client.post("/v1/projects", json={"name": name}, headers=ANA).json()["id"]


def share(client: TestClient, id: str, email: str, role: str = "viewer", language: str = "es") -> Any:
    body = {"email": email, "role": role, "language": language}
    return client.put(f"/v1/projects/{id}/members", json=body, headers=ANA)


def test_a_new_member_is_told_by_email_in_the_inviters_language(tmp_path: Path, verifier: OidcVerifier) -> None:
    outbox = MemoryMailer()
    client = app(tmp_path, verifier, outbox)
    id = project(client)

    shared = share(client, id, "Bo@Example.org", "collaborator", "en").json()

    assert shared["invitation_sent"] is True
    [sent] = outbox.sent
    assert sent.to == "bo@example.org"
    assert sent.subject == "Ana invited you to “Campo” on IDEA-Agro"
    assert "as a collaborator" in sent.text
    link = urlsplit(sent.text.split("See the invitation: ")[1].split()[0])
    assert f"{link.scheme}://{link.netloc}{link.path}" == f"{SITE}/en/invitation/"
    # The code rides in the fragment, which never reaches a server's logs.
    assert link.query == ""
    assert parse_qs(link.fragment)["project"] == [id]
    assert len(parse_qs(link.fragment)["code"][0]) >= 32
    assert "expires on" in sent.text


def test_a_role_change_sends_nothing(tmp_path: Path, verifier: OidcVerifier) -> None:
    outbox = MemoryMailer()
    client = app(tmp_path, verifier, outbox)
    id = project(client)
    share(client, id, "bo@example.org")

    changed = share(client, id, "bo@example.org", "collaborator").json()

    assert changed["invitation_sent"] is None
    assert len(outbox.sent) == 1


def test_the_invitation_stands_when_the_email_does_not_leave(tmp_path: Path, verifier: OidcVerifier) -> None:
    client = app(tmp_path, verifier, MemoryMailer(failing=True))
    id = project(client)

    shared = share(client, id, "bo@example.org")

    assert shared.status_code == 200
    assert shared.json()["invitation_sent"] is False
    assert [m["email"] for m in shared.json()["members"]] == ["bo@example.org"]


def test_names_are_escaped_in_the_email(tmp_path: Path, verifier: OidcVerifier) -> None:
    outbox = MemoryMailer()
    client = app(tmp_path, verifier, outbox)
    id = project(client, "<b>Campo</b>")

    share(client, id, "bo@example.org")

    assert "<b>Campo</b>" not in outbox.sent[0].html
    assert "&lt;b&gt;Campo&lt;/b&gt;" in outbox.sent[0].html
    assert "«<b>Campo</b>»" in outbox.sent[0].subject


def test_the_mailer_comes_from_the_configuration() -> None:
    assert isinstance(mailer_from("none", "", ""), NoMailer)
    assert isinstance(mailer_from("resend://", "key", "IDEA-Agro <no-reply@example.org>"), ResendMailer)
    with pytest.raises(ValueError):
        mailer_from("resend://", "", "")
    with pytest.raises(MailFailed):
        NoMailer().send(Email("bo@example.org", "s", "t", "h"))


def test_the_provider_gets_the_sender_the_message_and_the_key(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, Any] = {}

    class Answer:
        def __enter__(self) -> Answer:
            return self

        def __exit__(self, *exc: object) -> None:
            return None

    def urlopen(request: Any, timeout: float) -> Answer:
        seen["url"] = request.full_url
        seen["auth"] = request.get_header("Authorization")
        seen["body"] = json.loads(request.data)
        return Answer()

    monkeypatch.setattr(urllib.request, "urlopen", urlopen)
    ResendMailer("secret", "IDEA-Agro <no-reply@example.org>").send(Email("bo@example.org", "Hola", "t", "<p>h</p>"))

    assert seen["url"] == "https://api.resend.com/emails"
    assert seen["auth"] == "Bearer secret"
    assert seen["body"] == {
        "from": "IDEA-Agro <no-reply@example.org>",
        "to": ["bo@example.org"],
        "subject": "Hola",
        "text": "t",
        "html": "<p>h</p>",
    }


def test_the_invitation_page_says_what_is_offered_and_to_whom(tmp_path: Path, verifier: OidcVerifier) -> None:
    outbox = MemoryMailer()
    client = app(tmp_path, verifier, outbox)
    id = project(client)
    share(client, id, "bo@example.org", "collaborator")
    code = code_of(outbox.sent[-1])

    seen = client.post("/v1/invitations/open", json=code, headers=BO).json()
    other = client.post("/v1/invitations/open", json=code, headers=CY).json()

    assert (seen["project_name"], seen["inviter_name"], seen["role"], seen["state"], seen["yours"]) == (
        "Campo",
        "Ana",
        "collaborator",
        "pending",
        True,
    )
    assert (other["email"], other["yours"]) == ("bo@example.org", False)


def test_only_the_invited_email_accepts(tmp_path: Path, verifier: OidcVerifier) -> None:
    outbox = MemoryMailer()
    client = app(tmp_path, verifier, outbox)
    id = project(client)
    share(client, id, "bo@example.org")

    refused = client.post("/v1/invitations/accept", json=code_of(outbox.sent[-1]), headers=CY)

    assert refused.status_code == 403
    assert refused.json()["type"] == "urn:idea-agro:problem:invitation-for-another-email"
    assert client.get(f"/v1/projects/{id}", headers=CY).status_code == 404


def test_an_expired_invitation_is_not_accepted(tmp_path: Path, verifier: OidcVerifier) -> None:
    outbox = MemoryMailer()
    client = app(tmp_path, verifier, outbox, days=0)
    id = project(client)
    share(client, id, "bo@example.org")
    code = code_of(outbox.sent[-1])

    assert client.post("/v1/invitations/open", json=code, headers=BO).json()["state"] == "expired"
    assert client.post("/v1/invitations/accept", json=code, headers=BO).status_code == 410


def test_a_resent_invitation_gets_a_new_code(tmp_path: Path, verifier: OidcVerifier) -> None:
    outbox = MemoryMailer()
    client = app(tmp_path, verifier, outbox, pause=0)
    id = project(client)
    share(client, id, "bo@example.org")
    first = code_of(outbox.sent[-1])

    resent = client.post(f"/v1/projects/{id}/members/bo@example.org/invitation", json={"language": "pt"}, headers=ANA)
    second = code_of(outbox.sent[-1])

    assert resent.json()["invitation_sent"] is True
    assert "Ver o convite" in outbox.sent[-1].text
    assert client.post("/v1/invitations/accept", json=first, headers=BO).status_code == 404
    assert client.post("/v1/invitations/accept", json=second, headers=BO).status_code == 200
    # Accepted: a pending invitation no longer exists to resend.
    assert client.post(f"/v1/projects/{id}/members/bo@example.org/invitation", json={}, headers=ANA).status_code == 409


def test_a_used_code_answers_joined_and_accepting_again_is_harmless(tmp_path: Path, verifier: OidcVerifier) -> None:
    outbox = MemoryMailer()
    client = app(tmp_path, verifier, outbox)
    id = project(client)
    share(client, id, "bo@example.org")
    code = code_of(outbox.sent[-1])
    client.post("/v1/invitations/accept", json=code, headers=BO)

    assert client.post("/v1/invitations/open", json=code, headers=BO).json()["state"] == "joined"
    assert client.post("/v1/invitations/accept", json=code, headers=BO).status_code == 200
    assert client.post("/v1/invitations/open", json=code, headers=CY).status_code == 404


def test_a_declined_invitation_leaves_the_project(tmp_path: Path, verifier: OidcVerifier) -> None:
    outbox = MemoryMailer()
    client = app(tmp_path, verifier, outbox)
    id = project(client)
    share(client, id, "bo@example.org")
    code = code_of(outbox.sent[-1])

    declined = client.post("/v1/invitations/decline", json=code, headers=BO)

    assert declined.status_code == 204
    assert client.get(f"/v1/projects/{id}", headers=ANA).json()["members"] == []
    actions = [a["action"] for a in client.get(f"/v1/projects/{id}/activity", headers=ANA).json()]
    assert actions[0] == "member_declined"


def test_an_invitation_is_not_emailed_again_right_away(tmp_path: Path, verifier: OidcVerifier) -> None:
    outbox = MemoryMailer()
    client = app(tmp_path, verifier, outbox)
    id = project(client)
    share(client, id, "bo@example.org")

    again = client.post(f"/v1/projects/{id}/members/bo@example.org/invitation", json={}, headers=ANA)

    assert again.status_code == 429
    assert int(again.headers["Retry-After"]) > 500
    assert len(outbox.sent) == 1


def test_an_invitation_resent_while_accepting_does_not_let_the_old_code_in(
    tmp_path: Path, verifier: OidcVerifier
) -> None:
    outbox = MemoryMailer()
    services = services_for_tests(
        files=LocalFiles(tmp_path),
        verifier=verifier,
        mailer=outbox,
        site_url=SITE,
        limits=Limits(invitation_resend_minutes=0),
    )
    client = TestClient(create_app(services))
    id = project(client)
    share(client, id, "bo@example.org")
    old = code_of(outbox.sent[-1])
    change = services.projects.change

    def resent_first(project_id: str, update: Callable[[Project], Project]) -> Project | None:
        # The owner's resend lands between the code's check and the change.
        services.projects.change = change
        client.post(f"/v1/projects/{id}/members/bo@example.org/invitation", json={}, headers=ANA)
        return change(project_id, update)

    services.projects.change = resent_first  # pyright: ignore[reportAttributeAccessIssue]
    raced = client.post("/v1/invitations/accept", json=old, headers=BO)

    assert raced.status_code == 404
    assert client.get(f"/v1/projects/{id}", headers=BO).status_code == 404
    actions = [a["action"] for a in client.get(f"/v1/projects/{id}/activity", headers=ANA).json()]
    assert "member_joined" not in actions


def test_declining_a_code_resent_meanwhile_declines_nothing(tmp_path: Path, verifier: OidcVerifier) -> None:
    outbox = MemoryMailer()
    services = services_for_tests(
        files=LocalFiles(tmp_path),
        verifier=verifier,
        mailer=outbox,
        site_url=SITE,
        limits=Limits(invitation_resend_minutes=0),
    )
    client = TestClient(create_app(services))
    id = project(client)
    share(client, id, "bo@example.org")
    old = code_of(outbox.sent[-1])
    change = services.projects.change

    def resent_first(project_id: str, update: Callable[[Project], Project]) -> Project | None:
        services.projects.change = change
        client.post(f"/v1/projects/{id}/members/bo@example.org/invitation", json={}, headers=ANA)
        return change(project_id, update)

    services.projects.change = resent_first  # pyright: ignore[reportAttributeAccessIssue]

    assert client.post("/v1/invitations/decline", json=old, headers=BO).status_code == 404
    assert [m["email"] for m in client.get(f"/v1/projects/{id}", headers=ANA).json()["members"]] == ["bo@example.org"]


def test_an_invitation_from_before_codes_is_shown_expired_and_resent(tmp_path: Path, verifier: OidcVerifier) -> None:
    outbox = MemoryMailer()
    services = services_for_tests(files=LocalFiles(tmp_path), verifier=verifier, mailer=outbox, site_url=SITE)
    client = TestClient(create_app(services))
    id = project(client)
    services.projects.change(id, lambda p: replace(p, members=(Member("bo@example.org", MemberRole.VIEWER),)))

    [member] = client.get(f"/v1/projects/{id}", headers=ANA).json()["members"]
    resent = client.post(f"/v1/projects/{id}/members/bo@example.org/invitation", json={}, headers=ANA)

    assert (member["pending"], member["invited_until"]) == (True, None)
    assert resent.json()["invitation_sent"] is True
    assert client.post("/v1/invitations/accept", json=code_of(outbox.sent[-1]), headers=BO).status_code == 200
