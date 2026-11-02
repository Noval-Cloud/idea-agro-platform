from typing import Any

import pytest
from auth_tokens import bearer, make_token
from fastapi.testclient import TestClient
from idea_agro_api.accounts import Role
from idea_agro_api.app import create_app
from idea_agro_api.auth import OidcVerifier
from idea_agro_api.services import Services, services_for_tests
from idea_agro_api.site_texts import definitions

ANA = bearer(make_token("ana"))
BO = bearer(make_token("bo"))
KEY = "zone.season.title"
PLURAL = next(key for key, definition in definitions().items() if definition.format == "plural")


@pytest.fixture
def services(verifier: OidcVerifier) -> Services:
    return services_for_tests(verifier=verifier)


@pytest.fixture
def client(services: Services) -> TestClient:
    found = TestClient(create_app(services))
    # Ana edits the site's texts; Bo is only signed in.
    ana = found.get("/v1/me", headers=ANA).json()["id"]
    found.get("/v1/me", headers=BO)
    services.accounts.update(ana, roles=frozenset({Role.EDITOR}))
    return found


def put(client: TestClient, key: str = KEY, publish: bool = True, **texts: object) -> dict[str, Any]:
    response = client.put(f"/v1/texts/{key}", headers=ANA, json={"texts": texts, "publish": publish})
    assert response.status_code == 200, response.text
    return response.json()


def test_published_texts_are_public_and_cacheable(client: TestClient) -> None:
    assert client.get("/v1/texts").json() == {"texts": {}}

    put(client, es="{indicator} en el año {year}")

    response = client.get("/v1/texts")
    assert response.json() == {"texts": {KEY: {"es": "{indicator} en el año {year}"}}}
    assert response.headers["cache-control"] == "public, max-age=60"


def test_only_editors_work_on_texts(client: TestClient) -> None:
    assert client.get(f"/v1/texts/{KEY}").status_code == 401
    assert client.get(f"/v1/texts/{KEY}", headers=BO).status_code == 403
    assert client.put(f"/v1/texts/{KEY}", headers=BO, json={"texts": {"es": "x"}}).status_code == 403


def test_a_text_shows_its_default_until_edited(client: TestClient) -> None:
    text = client.get(f"/v1/texts/{KEY}", headers=ANA).json()

    assert text["format"] == "plain"
    assert text["current"] == text["default"]
    assert text["published"] == {}
    assert text["draft"] is None


def test_an_edit_keeps_the_placeholders_and_plural_forms(client: TestClient) -> None:
    def status(key: str, **texts: object) -> int:
        return client.put(f"/v1/texts/{key}", headers=ANA, json={"texts": texts}).status_code

    assert status(KEY, es="Sin variables") == 422
    assert status(KEY, es="{indicator} {year} {extra}") == 422
    assert status("no.such.text", es="Hola") == 404
    assert status(PLURAL, es="solo una forma") == 422
    default = definitions()[PLURAL].default["es"]
    assert isinstance(default, dict)
    assert status(PLURAL, es=default | {"one": default["one"] + " ."}) == 200


def test_a_text_equal_to_its_default_is_not_kept_as_an_edit(client: TestClient) -> None:
    put(client, es="{indicator} en el año {year}")

    text = put(client, es=str(definitions()[KEY].default["es"]))

    assert text["published"] == {}
    assert client.get("/v1/texts").json() == {"texts": {}}


def test_a_draft_waits_until_someone_publishes_it(client: TestClient) -> None:
    drafted = put(client, publish=False, en="{indicator} across the growing year {year}")
    assert drafted["draft"] == {"en": "{indicator} across the growing year {year}"}
    assert drafted["current"]["en"] == definitions()[KEY].default["en"]
    assert client.get("/v1/texts").json() == {"texts": {}}

    published = client.post(f"/v1/texts/{KEY}/publish", headers=ANA).json()

    assert published["draft"] is None
    assert published["current"]["en"] == "{indicator} across the growing year {year}"
    assert client.post(f"/v1/texts/{KEY}/publish", headers=ANA).status_code == 409


def test_a_draft_can_be_discarded(client: TestClient) -> None:
    put(client, publish=False, es="{indicator} en {year}")

    discarded = client.delete(f"/v1/texts/{KEY}/draft", headers=ANA).json()

    assert discarded["draft"] is None
    assert client.delete(f"/v1/texts/{KEY}/draft", headers=ANA).status_code == 409


def test_an_earlier_version_or_the_default_comes_back(client: TestClient) -> None:
    put(client, es="{indicator}, año {year}")
    put(client, es="{indicator} durante {year}")
    versions = client.get(f"/v1/texts/{KEY}/versions", headers=ANA).json()
    assert [v["texts"]["es"] for v in versions] == ["{indicator} durante {year}", "{indicator}, año {year}"]
    assert versions[0]["by"]["name"] == "Ana"

    back = client.post(f"/v1/texts/{KEY}/restore", headers=ANA, json={"version": versions[1]["id"]}).json()
    assert back["current"]["es"] == "{indicator}, año {year}"

    default = client.post(f"/v1/texts/{KEY}/restore", headers=ANA, json={"version": None}).json()
    assert default["published"] == {}
    assert client.get(f"/v1/texts/{KEY}/versions", headers=ANA).json()[0]["state"] == "default"
    assert client.post(f"/v1/texts/{KEY}/restore", headers=ANA, json={"version": "nope"}).status_code == 404


def test_texts_are_found_by_their_words_or_key(client: TestClient) -> None:
    put(client, es="{indicator} en la campaña {year}")

    by_words = client.get("/v1/texts/search", headers=ANA, params={"q": "CAMPANA"}).json()
    by_key = client.get("/v1/texts/search", headers=ANA, params={"q": "season.title"}).json()

    assert [m["key"] for m in by_words] == [KEY]
    assert by_words[0]["edited"] is True
    assert KEY in [m["key"] for m in by_key]


def test_every_change_is_audited(client: TestClient, services: Services) -> None:
    put(client, es="{indicator} en {year}")
    put(client, publish=False, en="{indicator} in {year}")

    actions = [(e.action, e.target) for e in services.audit.latest(10)]

    assert ("text_drafted", KEY) in actions
    assert ("text_published", KEY) in actions


def test_only_published_versions_come_back(client: TestClient) -> None:
    put(client, es="{indicator} en {year}")
    put(client, publish=False, en="{indicator} in {year}")
    client.delete(f"/v1/texts/{KEY}/draft", headers=ANA)
    versions = client.get(f"/v1/texts/{KEY}/versions", headers=ANA).json()
    assert [v["state"] for v in versions] == ["discarded", "draft", "published"]

    for version in versions[:2]:
        response = client.post(f"/v1/texts/{KEY}/restore", headers=ANA, json={"version": version["id"]})
        assert response.status_code == 409
    assert client.get(f"/v1/texts/{KEY}", headers=ANA).json()["published"] == {"es": "{indicator} en {year}"}


def test_a_plain_text_refuses_plural_forms(client: TestClient) -> None:
    response = client.put(f"/v1/texts/{KEY}", headers=ANA, json={"texts": {"es": {"one": "a", "other": "b"}}})

    assert response.status_code == 422
    assert "plain text" in response.json()["detail"]


def test_a_publish_puts_the_site_behind_until_a_build_is_asked_for(client: TestClient, services: Services) -> None:
    assert client.get("/v1/texts/rebuild", headers=ANA).json()["published_at"] is None

    put(client, publish=False, es="{indicator} en {year}")
    assert client.get("/v1/texts/rebuild", headers=ANA).json()["published_at"] is None
    put(client, es="{indicator} en {year}")
    behind = client.get("/v1/texts/rebuild", headers=ANA).json()
    assert behind["published_at"] is not None
    assert behind["started_at"] is None
    assert behind["quiet_minutes"] == 5

    started = client.post("/v1/texts/rebuild", headers=ANA).json()

    assert started["started_at"] >= behind["published_at"]
    assert client.post("/v1/texts/rebuild", headers=BO).status_code == 403
