from datetime import UTC, date, datetime
from pathlib import Path
from typing import get_args

import pytest
from auth_tokens import bearer, make_token
from fastapi.testclient import TestClient
from idea_agro_api.app import create_app
from idea_agro_api.auth import OidcVerifier
from idea_agro_api.emails.compose import compose, page, written
from idea_agro_api.emails.templates import Kind, Language, Template, TemplateError, check
from idea_agro_api.emails.words import WORDS, BuiltInTemplates
from idea_agro_api.mail import MemoryMailer
from idea_agro_api.services import services_for_tests
from idea_agro_api.zones import LocalFiles

SITE = "https://site.example"
UNTIL = datetime(2026, 11, 2, 1, 30, tzinfo=UTC)
INVITATION = {"inviter": "Ana", "project": "Campo", "email": "bo@example.org", "until": UNTIL}


class Edited:
    """A store people edited: its own words for one kind, the code's for the rest."""

    def __init__(self, kind: Kind, template: Template) -> None:
        self.kind = kind
        self.edited = template

    def template(self, kind: Kind, language: Language) -> Template:
        return self.edited if kind == self.kind else BuiltInTemplates().template(kind, language)


@pytest.mark.parametrize("kind", list(Kind))
@pytest.mark.parametrize("language", get_args(Language))
def test_every_kind_has_checked_words_in_every_language(kind: Kind, language: Language) -> None:
    check(kind, WORDS[kind][language])


@pytest.mark.parametrize(
    ("text", "problem"),
    [
        ("Hola {name}", "do not give name"),
        ("{project.__class__}", "Write placeholders as"),
        ("{project:>9999}", "Write placeholders as"),
        ("{project!r}", "Write placeholders as"),
        ("{0}", "Write placeholders as"),
        ("{project", "Unbalanced braces"),
    ],
)
def test_a_template_places_only_what_its_kind_gives(text: str, problem: str) -> None:
    with pytest.raises(TemplateError, match=problem):
        check(Kind.INVITATION_TO_VIEW, Template(subject="s", heading="h", body=text))


def test_braces_can_be_written_doubled() -> None:
    template = Template(subject="{{project}}", heading="{project}", body="b")
    check(Kind.INVITATION_TO_VIEW, template)
    email = compose(
        Edited(Kind.INVITATION_TO_VIEW, template),
        Kind.INVITATION_TO_VIEW,
        language="es",
        to="bo@example.org",
        values=INVITATION,
    )
    assert email.subject == "{project}"
    assert email.text.startswith("Campo\n")


def test_an_email_has_its_words_its_values_and_the_shared_look() -> None:
    email = compose(
        BuiltInTemplates(),
        Kind.INVITATION_TO_COLLABORATE,
        language="es",
        to="bo@example.org",
        values=INVITATION,
        link=f"{SITE}/invitation/#code=1",
        site=SITE,
    )

    assert email.to == "bo@example.org"
    assert email.subject == "Ana te invitó a «Campo» en IDEA-Agro"
    paragraphs = email.text.split("\n\n")
    assert paragraphs[:3] == [
        "Te invitaron a un proyecto",
        "Ana te invitó a «Campo» como colaborador.",
        "Vas a poder agregar y quitar zonas y cambiar sus contornos.",
    ]
    assert f"Ver la invitación: {SITE}/invitation/#code=1" in paragraphs
    # Uruguay's date, three hours behind.
    assert "vence el 1 de noviembre de 2026" in email.text
    assert email.text.endswith(f"IDEA-Agro · Indicadores ambientales y productivos del agro uruguayo\n{SITE}/\n")
    assert '<html lang="es">' in email.html
    # The inbox shows the first paragraph next to the subject.
    assert ">Ana te invitó a «Campo» como colaborador.</div>" in email.html
    assert email.html.count(f'href="{SITE}/invitation/#code=1"') == 2


def test_values_and_words_are_escaped_in_the_html() -> None:
    values = INVITATION | {"project": '<a href="x">Campo</a>'}
    email = compose(BuiltInTemplates(), Kind.INVITATION_TO_VIEW, language="en", to="bo@example.org", values=values)

    assert '<a href="x">' not in email.html
    assert "&lt;a href=&quot;x&quot;&gt;Campo&lt;/a&gt;" in email.html
    assert '“<a href="x">Campo</a>”' in email.subject


def test_without_a_link_there_is_no_button_and_without_a_site_no_home() -> None:
    email = compose(BuiltInTemplates(), Kind.INVITATION_TO_VIEW, language="pt", to="bo@example.org", values=INVITATION)

    assert "Ver o convite" not in email.text
    assert "<a " not in email.html
    assert email.text.endswith("IDEA-Agro · Indicadores ambientais e produtivos do agro uruguaio\n")


def test_a_sender_gives_every_value_of_its_kind() -> None:
    values = {k: v for k, v in INVITATION.items() if k != "until"}
    with pytest.raises(ValueError, match="need until"):
        compose(BuiltInTemplates(), Kind.INVITATION_TO_VIEW, language="es", to="bo@example.org", values=values)


def test_an_edited_template_is_checked_before_it_is_sent() -> None:
    edited = Edited(Kind.INVITATION_TO_VIEW, Template(subject="{secret}", heading="h", body="b"))
    with pytest.raises(TemplateError):
        compose(edited, Kind.INVITATION_TO_VIEW, language="es", to="bo@example.org", values=INVITATION)


@pytest.mark.parametrize(
    ("value", "language", "expected"),
    [
        (date(2026, 3, 9), "en", "9 March 2026"),
        (date(2026, 3, 9), "pt", "9 de março de 2026"),
        (1234567, "en", "1,234,567"),
        (1234567, "es", "1.234.567"),
        (1234.5, "es", "1.234,5"),
        (0.125, "pt", "0,12"),
        (316.0, "en", "316"),
        ("Campo", "es", "Campo"),
    ],
)
def test_values_are_written_in_the_emails_language(
    value: date | float | str, language: Language, expected: str
) -> None:
    assert written(value, language) == expected


def test_pages_are_in_the_emails_language() -> None:
    assert page(f"{SITE}/", "es", "/invitation/") == f"{SITE}/invitation/"
    assert page(SITE, "pt", "/") == f"{SITE}/pt/"


def test_the_platform_sends_with_the_templates_it_is_given(tmp_path: Path, verifier: OidcVerifier) -> None:
    outbox = MemoryMailer()
    edited = Edited(Kind.INVITATION_TO_VIEW, Template(subject="Mirá {project}", heading="Hola", body="De {inviter}."))
    services = services_for_tests(
        files=LocalFiles(tmp_path), verifier=verifier, mailer=outbox, site_url=SITE, templates=edited
    )
    client = TestClient(create_app(services))
    ana = bearer(make_token("ana"))
    id = client.post("/v1/projects", json={"name": "Campo"}, headers=ana).json()["id"]

    client.put(f"/v1/projects/{id}/members", json={"email": "bo@example.org", "role": "viewer"}, headers=ana)
    client.put(f"/v1/projects/{id}/members", json={"email": "cy@example.org", "role": "collaborator"}, headers=ana)

    viewer, collaborator = outbox.sent
    assert viewer.subject == "Mirá Campo"
    assert viewer.text.startswith("Hola\n\nDe Ana.\n\n")
    assert collaborator.subject == "Ana te invitó a «Campo» en IDEA-Agro"
