"""The scientific articles behind the indicators, and which ones each indicator cites.

An article stands on its own; an indicator keeps the ordered list of the articles that support it. Both live in the
content database. `articles_seed.json` holds what the website's code had, which `POST /v1/articles/seed` loads once.
"""

import json
import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime
from importlib import resources
from typing import Any, Protocol, cast

from google.cloud import firestore  # pyright: ignore[reportMissingTypeStubs]

from idea_agro_api.site_texts import Author


@dataclass(frozen=True)
class Article:
    id: str
    authors: str
    year: int
    # In the language it was published in, which `lang` names (BCP 47).
    title: str
    lang: str
    source: str
    doi: str | None = None
    url: str | None = None
    # Whether an uploaded PDF goes with it.
    pdf: bool = False
    # The reference framework the indicators follow, shown apart from the rest.
    framework: bool = False
    updated_at: datetime | None = None
    updated_by: Author | None = None


def pdf_name(article: str) -> str:
    """Kept beside the saved zones' files, under its own prefix."""
    return f"articles/{article}.pdf"


def new_article_id(authors: str, year: int, taken: set[str]) -> str:
    """The first author's surname and the year (`paruelo2016`), with a letter when taken (`paruelo2016b`)."""
    surname = authors.split(",")[0].split(" ")[0] if authors.strip() else "article"
    plain = "".join(c for c in unicodedata.normalize("NFD", surname.lower()) if unicodedata.category(c) != "Mn")
    base = re.sub(r"[^a-z0-9]", "", plain) or "article"
    found, suffix = f"{base}{year}", ord("b")
    while found in taken:
        found, suffix = f"{base}{year}{chr(suffix)}", suffix + 1
    return found


def seed() -> tuple[list[Article], dict[str, list[str]]]:
    """The articles and citations the website's code had."""
    raw = cast(dict[str, Any], json.loads((resources.files("idea_agro_api") / "articles_seed.json").read_text()))
    articles = [
        Article(
            id=a["id"],
            authors=a["authors"],
            year=a["year"],
            title=a["title"],
            lang=a["lang"],
            source=a["source"],
            doi=a.get("doi"),
            url=a.get("url"),
            framework=a.get("framework", False),
        )
        for a in cast(list[dict[str, Any]], raw["articles"])
    ]
    return articles, cast(dict[str, list[str]], raw["citations"])


class ArticleStore(Protocol):
    def all(self) -> list[Article]: ...

    def get(self, id: str) -> Article | None: ...

    def put(self, article: Article) -> None: ...

    def delete(self, id: str) -> None: ...

    def citations(self) -> dict[str, list[str]]:
        """By indicator, the ids of the articles it cites, in order."""
        ...

    def cite(self, indicator: str, articles: list[str]) -> None: ...


class MemoryArticles:
    def __init__(self) -> None:
        self._articles: dict[str, Article] = {}
        self._citations: dict[str, list[str]] = {}

    def all(self) -> list[Article]:
        return list(self._articles.values())

    def get(self, id: str) -> Article | None:
        return self._articles.get(id)

    def put(self, article: Article) -> None:
        self._articles[article.id] = article

    def delete(self, id: str) -> None:
        self._articles.pop(id, None)

    def citations(self) -> dict[str, list[str]]:
        return {indicator: list(ids) for indicator, ids in self._citations.items()}

    def cite(self, indicator: str, articles: list[str]) -> None:
        self._citations[indicator] = list(articles)


def _author(record: Any) -> Author | None:
    found = cast(dict[str, str] | None, record)
    return Author(found["id"], found["name"]) if found else None


# google-cloud-firestore is only partly typed; this class is its only user here.
class FirestoreArticles:
    def __init__(self, database: str) -> None:
        client = firestore.Client(database=database)  # pyright: ignore[reportUnknownMemberType]
        self._articles = client.collection("articles")  # pyright: ignore[reportUnknownMemberType]
        self._citations = client.collection("indicator_articles")  # pyright: ignore[reportUnknownMemberType]

    @staticmethod
    def _article(id: str, r: dict[str, Any]) -> Article:
        return Article(
            id=id,
            authors=r["authors"],
            year=r["year"],
            title=r["title"],
            lang=r["lang"],
            source=r["source"],
            doi=r.get("doi"),
            url=r.get("url"),
            pdf=r.get("pdf", False),
            framework=r.get("framework", False),
            updated_at=r.get("updated_at"),
            updated_by=_author(r.get("updated_by")),
        )

    def all(self) -> list[Article]:
        return [self._article(d.id, cast(dict[str, Any], d.to_dict())) for d in self._articles.stream()]  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]

    def get(self, id: str) -> Article | None:
        record = self._articles.document(id).get()  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
        if not record.exists:  # pyright: ignore[reportUnknownMemberType]
            return None
        return self._article(id, cast(dict[str, Any], record.to_dict()))  # pyright: ignore[reportUnknownMemberType]

    def put(self, article: Article) -> None:
        author = article.updated_by
        self._articles.document(article.id).set(  # pyright: ignore[reportUnknownMemberType]
            {
                "authors": article.authors,
                "year": article.year,
                "title": article.title,
                "lang": article.lang,
                "source": article.source,
                "doi": article.doi,
                "url": article.url,
                "pdf": article.pdf,
                "framework": article.framework,
                "updated_at": article.updated_at,
                "updated_by": {"id": author.id, "name": author.name} if author else None,
            }
        )

    def delete(self, id: str) -> None:
        self._articles.document(id).delete()  # pyright: ignore[reportUnknownMemberType]

    def citations(self) -> dict[str, list[str]]:
        return {
            d.id: list(cast(dict[str, Any], d.to_dict()).get("articles", []))  # pyright: ignore[reportUnknownMemberType]
            for d in self._citations.stream()  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
        }

    def cite(self, indicator: str, articles: list[str]) -> None:
        self._citations.document(indicator).set({"articles": articles})  # pyright: ignore[reportUnknownMemberType]


def articles_from(source: str) -> ArticleStore:
    """`firestore://<database>`, or `memory://`."""
    if source.startswith("firestore://"):
        return FirestoreArticles(source.removeprefix("firestore://"))
    if source == "memory://":
        return MemoryArticles()
    raise ValueError(f"Unknown records source: {source}")
