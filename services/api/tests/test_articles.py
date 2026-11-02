import pytest
from auth_tokens import bearer, make_token
from fastapi.testclient import TestClient
from idea_agro_api.accounts import Role
from idea_agro_api.app import create_app
from idea_agro_api.auth import OidcVerifier
from idea_agro_api.documents import MemoryDocumentFiles
from idea_agro_api.services import Services, services_for_tests

ANA = bearer(make_token("ana"))
BO = bearer(make_token("bo"))
PAPER = {
    "authors": "Paruelo, J. M. & Lauenroth, W. K.",
    "year": 1998,
    "title": "Interannual variability of NDVI",
    "lang": "en",
    "source": "Journal of Biogeography 25: 721-733",
    "doi": "10.1046/j.1365-2699.1998.2540721.x",
}


@pytest.fixture
def services(verifier: OidcVerifier) -> Services:
    return services_for_tests(verifier=verifier, document_files=MemoryDocumentFiles())


@pytest.fixture
def client(services: Services) -> TestClient:
    found = TestClient(create_app(services))
    ana = found.get("/v1/me", headers=ANA).json()["id"]
    found.get("/v1/me", headers=BO)
    services.accounts.update(ana, roles=frozenset({Role.EDITOR}))
    return found


def test_the_site_s_articles_load_once(client: TestClient) -> None:
    assert client.get("/v1/articles").json() == {"articles": [], "citations": {}}

    loaded = client.post("/v1/articles/seed", headers=ANA).json()

    ids = [a["id"] for a in loaded["articles"]]
    assert "paruelo2016" in ids
    assert [a["id"] for a in loaded["articles"] if a["framework"]] == ["inia2023"]
    assert loaded["citations"]["iose"] == ["paruelo2016"]
    assert client.post("/v1/articles/seed", headers=ANA).status_code == 409


def test_only_editors_keep_articles(client: TestClient) -> None:
    assert client.post("/v1/articles", json=PAPER).status_code == 401
    assert client.post("/v1/articles", headers=BO, json=PAPER).status_code == 403


def test_an_article_is_added_changed_and_removed(client: TestClient, services: Services) -> None:
    added = client.post("/v1/articles", headers=ANA, json=PAPER).json()
    assert added["id"] == "paruelo1998"
    again = client.post("/v1/articles", headers=ANA, json=PAPER).json()
    assert again["id"] == "paruelo1998b"

    changed = client.put(f"/v1/articles/{added['id']}", headers=ANA, json=PAPER | {"year": 1999}).json()
    assert changed["year"] == 1999
    assert changed["updated_by"]["name"] == "Ana"
    client.put("/v1/indicators/iose/articles", headers=ANA, json={"articles": [added["id"], again["id"]]})

    assert client.delete(f"/v1/articles/{added['id']}", headers=ANA).status_code == 204
    assert client.get("/v1/articles").json()["citations"]["iose"] == ["paruelo1998b"]
    assert services.site_rebuild.read().published_at is not None


def test_an_indicator_cites_known_articles_in_order(client: TestClient) -> None:
    client.post("/v1/articles/seed", headers=ANA)

    cited = client.put("/v1/indicators/ppna/articles", headers=ANA, json={"articles": ["baeza2010", "pineiro2006"]})
    unknown = client.put("/v1/indicators/ppna/articles", headers=ANA, json={"articles": ["nobody2000"]})

    assert cited.json() == {"articles": ["baeza2010", "pineiro2006"]}
    assert unknown.status_code == 422
    assert client.get("/v1/articles").json()["citations"]["ppna"] == ["baeza2010", "pineiro2006"]


def test_an_article_takes_a_pdf_that_anyone_reads(client: TestClient) -> None:
    article = client.post("/v1/articles", headers=ANA, json=PAPER).json()["id"]
    not_pdf = client.put(
        f"/v1/articles/{article}/pdf", headers=ANA, files={"file": ("a.pdf", b"hello", "application/pdf")}
    )
    assert not_pdf.status_code == 415

    with_pdf = client.put(
        f"/v1/articles/{article}/pdf", headers=ANA, files={"file": ("a.pdf", b"%PDF-1.7 body", "application/pdf")}
    ).json()

    assert with_pdf["pdf"] is True
    response = client.get(f"/v1/articles/{article}/pdf")
    assert response.content == b"%PDF-1.7 body"
    assert response.headers["content-type"] == "application/pdf"
    client.delete(f"/v1/articles/{article}/pdf", headers=ANA)
    assert client.get(f"/v1/articles/{article}/pdf").status_code == 404


def test_the_pdf_routes_announce_their_end(client: TestClient) -> None:
    article = client.post("/v1/articles", headers=ANA, json=PAPER).json()["id"]
    pdf = {"file": ("a.pdf", b"%PDF-1.7 body", "application/pdf")}

    answers = [
        client.put(f"/v1/articles/{article}/pdf", headers=ANA, files=pdf),
        client.get(f"/v1/articles/{article}/pdf"),
        client.delete(f"/v1/articles/{article}/pdf", headers=ANA),
    ]

    for answer in answers:
        assert answer.status_code == 200
        assert answer.headers["Deprecation"] == "@1793577600"
        assert answer.headers["Sunset"] == "Wed, 02 Dec 2026 00:00:00 GMT"
    operations = client.get("/openapi.json").json()["paths"]["/v1/articles/{article_id}/pdf"]
    assert all(operation["deprecated"] for operation in operations.values())


def test_every_loaded_article_is_reachable_by_its_id(client: TestClient) -> None:
    loaded = client.post("/v1/articles/seed", headers=ANA).json()

    for article in loaded["articles"]:
        assert client.get(f"/v1/articles/{article['id']}", headers=ANA).status_code == 200


def test_a_pdf_is_replaced_by_a_new_one(client: TestClient) -> None:
    article = client.post("/v1/articles", headers=ANA, json=PAPER).json()["id"]
    for body in (b"%PDF-1.7 first", b"%PDF-1.7 second"):
        client.put(f"/v1/articles/{article}/pdf", headers=ANA, files={"file": ("a.pdf", body, "application/pdf")})

    assert client.get(f"/v1/articles/{article}/pdf").content == b"%PDF-1.7 second"
