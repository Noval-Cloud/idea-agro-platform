import json
import urllib.request
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
from idea_agro_api.services import services_for_tests
from idea_agro_api.zones import LocalFiles

ANA = bearer(make_token("ana"))
SITE = "https://site.example"


def app(tmp_path: Path, verifier: OidcVerifier, mailer: mail.Mailer) -> TestClient:
    services = services_for_tests(files=LocalFiles(tmp_path), verifier=verifier, mailer=mailer, site_url=SITE)
    return TestClient(create_app(services))


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
    link = urlsplit(sent.text.split("Open the project: ")[1].split()[0])
    assert f"{link.scheme}://{link.netloc}{link.path}" == f"{SITE}/en/login/"
    assert parse_qs(link.query)["next"] == [f"/en/project/?id={id}"]


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
