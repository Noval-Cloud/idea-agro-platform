"""The website's texts: which exist, their format and defaults (exported from its catalogs to `site_texts.json` by
`make generate`), and the versions editors publish or keep as drafts, which the site shows instead when it is built.

Only edited languages are stored: one equal to its default is dropped, so a default the code changes still shows.
"""

import json
import re
import unicodedata
import uuid
from dataclasses import dataclass, replace
from datetime import datetime
from functools import cache
from importlib import resources
from typing import Any, Literal, Protocol, cast

from google.cloud import firestore  # pyright: ignore[reportMissingTypeStubs]

Locale = Literal["es", "en", "pt"]
LOCALES: tuple[Locale, ...] = ("es", "en", "pt")
Format = Literal["plain", "markdown", "plural"]
# A plural text has its `one` and `other` forms.
type Text = str | dict[str, str]
type Texts = dict[str, Text]
PLURAL_FORMS = ("one", "other")
PLACEHOLDER = re.compile(r"\{(\w+)\}")


@dataclass(frozen=True)
class Definition:
    format: Format
    default: dict[str, Text]


@cache
def definitions() -> dict[str, Definition]:
    raw = json.loads((resources.files("idea_agro_api") / "site_texts.json").read_text(encoding="utf-8"))
    return {key: Definition(found["format"], found["default"]) for key, found in cast(dict[str, Any], raw).items()}


class InvalidText(ValueError):
    pass


def _placeholders(text: str) -> set[str]:
    return set(PLACEHOLDER.findall(text))


def checked(key: str, texts: dict[str, Any]) -> Texts:
    """The texts of a key as editors may save them, or `InvalidText` saying what is wrong."""
    definition = definitions()[key]
    for locale, text in texts.items():
        if locale not in LOCALES:
            raise InvalidText(f"{locale} is not a language of the site.")
        default = definition.default[locale]
        if definition.format == "plural":
            if not isinstance(text, dict) or set(cast(dict[str, Any], text)) != set(PLURAL_FORMS):
                raise InvalidText(f"The {locale} text needs its 'one' and 'other' forms, and nothing else.")
            forms = cast(dict[str, Any], text)
            pairs = [(cast(dict[str, str], default)[form], forms[form]) for form in PLURAL_FORMS]
        else:
            if not isinstance(text, str):
                raise InvalidText(f"The {locale} text must be plain text, not plural forms.")
            pairs = [(cast(str, default), text)]
        for expected, given in pairs:
            if not isinstance(given, str) or not given.strip():
                raise InvalidText(f"The {locale} text is empty.")
            if _placeholders(given) != _placeholders(expected):
                wanted = ", ".join(sorted(f"{{{name}}}" for name in _placeholders(expected))) or "none"
                raise InvalidText(f"The {locale} text must keep the placeholders of its default: {wanted}.")
    return cast(Texts, texts)


def edited(key: str, texts: Texts) -> Texts:
    """Only the languages whose text differs from its default."""
    default = definitions()[key].default
    return {locale: text for locale, text in texts.items() if text != default[locale]}


@dataclass(frozen=True)
class Author:
    id: str
    name: str


@dataclass(frozen=True)
class SiteText:
    key: str
    # The published edits and the draft, by language; a language without an edit shows its default.
    published: Texts
    draft: Texts | None
    updated_at: datetime | None = None
    updated_by: Author | None = None
    draft_at: datetime | None = None
    draft_by: Author | None = None


VersionState = Literal["published", "draft", "discarded", "default"]


@dataclass(frozen=True)
class TextVersion:
    id: str
    key: str
    # What the change left: the published edits, or the draft.
    texts: Texts
    state: VersionState
    at: datetime
    by: Author


def new_version_id() -> str:
    return str(uuid.uuid4())


class SiteTextStore(Protocol):
    def all(self) -> list[SiteText]:
        """Every text with a published edit or a draft."""
        ...

    def get(self, key: str) -> SiteText | None: ...

    def put(self, text: SiteText) -> None:
        """Keeps the text; one with neither edits nor a draft is removed."""
        ...

    def add_version(self, version: TextVersion) -> None: ...

    def versions(self, key: str) -> list[TextVersion]:
        """Newest first."""
        ...


def is_empty(text: SiteText) -> bool:
    return not text.published and text.draft is None


class MemorySiteTexts:
    def __init__(self) -> None:
        self._texts: dict[str, SiteText] = {}
        self._versions: list[TextVersion] = []

    def all(self) -> list[SiteText]:
        return list(self._texts.values())

    def get(self, key: str) -> SiteText | None:
        return self._texts.get(key)

    def put(self, text: SiteText) -> None:
        if is_empty(text):
            self._texts.pop(text.key, None)
        else:
            self._texts[text.key] = text

    def add_version(self, version: TextVersion) -> None:
        self._versions.append(version)

    def versions(self, key: str) -> list[TextVersion]:
        return sorted((v for v in self._versions if v.key == key), key=lambda v: v.at, reverse=True)


def _author(record: Any) -> Author | None:
    found = cast(dict[str, str] | None, record)
    return Author(found["id"], found["name"]) if found else None


def _author_record(author: Author | None) -> dict[str, str] | None:
    return {"id": author.id, "name": author.name} if author else None


# google-cloud-firestore is only partly typed; this class is its only user here.
class FirestoreSiteTexts:
    def __init__(self, database: str) -> None:
        client = firestore.Client(database=database)  # pyright: ignore[reportUnknownMemberType]
        self._texts = client.collection("site_texts")  # pyright: ignore[reportUnknownMemberType]
        self._versions = client.collection("site_text_versions")  # pyright: ignore[reportUnknownMemberType]

    @staticmethod
    def _text(key: str, record: dict[str, Any]) -> SiteText:
        return SiteText(
            key=key,
            published=cast(Texts, record.get("published") or {}),
            draft=cast(Texts | None, record.get("draft")),
            updated_at=record.get("updated_at"),
            updated_by=_author(record.get("updated_by")),
            draft_at=record.get("draft_at"),
            draft_by=_author(record.get("draft_by")),
        )

    def all(self) -> list[SiteText]:
        return [self._text(d.id, cast(dict[str, Any], d.to_dict())) for d in self._texts.stream()]  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]

    def get(self, key: str) -> SiteText | None:
        record = self._texts.document(key).get()  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
        if not record.exists:  # pyright: ignore[reportUnknownMemberType]
            return None
        return self._text(key, cast(dict[str, Any], record.to_dict()))  # pyright: ignore[reportUnknownMemberType]

    def put(self, text: SiteText) -> None:
        document = self._texts.document(text.key)  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
        if is_empty(text):
            document.delete()  # pyright: ignore[reportUnknownMemberType]
            return
        document.set(  # pyright: ignore[reportUnknownMemberType]
            {
                "published": text.published,
                "draft": text.draft,
                "updated_at": text.updated_at,
                "updated_by": _author_record(text.updated_by),
                "draft_at": text.draft_at,
                "draft_by": _author_record(text.draft_by),
            }
        )

    def add_version(self, version: TextVersion) -> None:
        self._versions.document(version.id).create(  # pyright: ignore[reportUnknownMemberType]
            {
                "key": version.key,
                "texts": version.texts,
                "state": version.state,
                "at": version.at,
                "by": _author_record(version.by),
            }
        )

    def versions(self, key: str) -> list[TextVersion]:
        query = self._versions.where(filter=firestore.FieldFilter("key", "==", key))  # pyright: ignore[reportUnknownMemberType]
        found = [
            TextVersion(
                id=d.id,
                key=key,
                texts=cast(Texts, record["texts"]),
                state=cast(VersionState, record["state"]),
                at=record["at"],
                by=cast(Author, _author(record["by"])),
            )
            for d in query.stream()  # pyright: ignore[reportUnknownVariableType]
            if (record := cast(dict[str, Any], d.to_dict()))  # pyright: ignore[reportUnknownMemberType]
        ]
        # Sorted here: ordering by another field than the filtered one would need a composite index.
        return sorted(found, key=lambda v: v.at, reverse=True)


def site_texts_from(source: str) -> SiteTextStore:
    """`firestore://<database>`, or `memory://`."""
    if source.startswith("firestore://"):
        return FirestoreSiteTexts(source.removeprefix("firestore://"))
    if source == "memory://":
        return MemorySiteTexts()
    raise ValueError(f"Unknown records source: {source}")


def _folded(text: str) -> str:
    """Lower case and without accents, so "publicacion" finds "Publicación"."""
    return "".join(c for c in unicodedata.normalize("NFD", text.casefold()) if unicodedata.category(c) != "Mn")


def current(key: str, text: SiteText | None) -> Texts:
    """What the site shows in each language: the published edit, or the default."""
    default = definitions()[key].default
    return {locale: (text.published.get(locale) if text else None) or default[locale] for locale in LOCALES}


def search(store: SiteTextStore, query: str, limit: int) -> list[str]:
    """The keys whose key or text, in any language, holds the query; the closest first."""
    wanted = _folded(query.strip())
    if not wanted:
        return []
    texts = {text.key: text for text in store.all()}
    found: list[tuple[int, str]] = []
    for key in definitions():
        shown = current(key, texts.get(key))
        words = [value for text in shown.values() for value in (text.values() if isinstance(text, dict) else [text])]
        folded = [_folded(word) for word in words]
        if any(word == wanted for word in folded):
            found.append((0, key))
        elif any(wanted in word for word in folded) or wanted in _folded(key):
            found.append((1, key))
    return [key for _, key in sorted(found)[:limit]]


def saved(text: SiteText, texts: Texts, publish: bool, at: datetime, by: Author) -> SiteText:
    """The text after an editor saves some languages: published at once, or kept as a draft."""
    if publish:
        # A published change ends the draft: it is what the editor decided.
        published = edited(text.key, text.published | texts)
        return replace(
            text, published=published, draft=None, draft_at=None, draft_by=None, updated_at=at, updated_by=by
        )
    return replace(text, draft=(text.draft or {}) | texts, draft_at=at, draft_by=by)
