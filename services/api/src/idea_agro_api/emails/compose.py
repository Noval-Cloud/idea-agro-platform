"""Writes an email: its kind's words, the sender's values written in the email's language, and the shared look."""

import re
import unicodedata
from collections.abc import Mapping
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from string import Formatter

from idea_agro_api.emails import layout
from idea_agro_api.emails.templates import SHAPES, Kind, Language, Templates, check
from idea_agro_api.mail import Email

# A `Decimal` keeps its own decimals; a float is written with two at most.
type Value = str | int | float | Decimal | date | datetime

# Dates in emails are Uruguay's, which keeps UTC-3 all year.
URUGUAY = timezone(timedelta(hours=-3))

# The site's address prefix for each language: Spanish is the default, at the root.
PREFIX: dict[Language, str] = {"es": "", "en": "/en", "pt": "/pt"}

DATE: dict[Language, str] = {
    "es": "{day} de {month} de {year}",
    "en": "{day} {month} {year}",
    "pt": "{day} de {month} de {year}",
}

MONTHS: dict[Language, tuple[str, ...]] = {
    "es": (
        "enero",
        "febrero",
        "marzo",
        "abril",
        "mayo",
        "junio",
        "julio",
        "agosto",
        "septiembre",
        "octubre",
        "noviembre",
        "diciembre",
    ),
    "en": (
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ),
    "pt": (
        "janeiro",
        "fevereiro",
        "março",
        "abril",
        "maio",
        "junho",
        "julho",
        "agosto",
        "setembro",
        "outubro",
        "novembro",
        "dezembro",
    ),
}


def page(site: str, language: Language, path: str) -> str:
    """A page of the website in `language`."""
    return f"{site.rstrip('/')}{PREFIX[language]}{path}"


def written(value: Value, language: Language) -> str:
    """A value as the email's language writes it: dates in words, numbers with its separators."""
    if isinstance(value, datetime):
        value = value.astimezone(URUGUAY).date()
    if isinstance(value, date):
        return DATE[language].format(day=value.day, month=MONTHS[language][value.month - 1], year=value.year)
    if isinstance(value, str):
        return value
    if isinstance(value, float):
        # Adding 0.0 turns a -0.0 into 0.0, so nothing is written "-0".
        number = f"{round(value, 2) + 0.0:,.2f}".rstrip("0").rstrip(".")
    else:
        number = f"{value:,f}" if isinstance(value, Decimal) else f"{value:,}"
    return number if language == "en" else number.translate(str.maketrans(",.", ".,"))


def plain_name(text: str, limit: int = 60) -> str:
    """A person's own name for an email: one line, no control or formatting characters, and short."""
    kept = "".join(
        " " if c.isspace() else c for c in text if unicodedata.category(c) not in ("Cc", "Cf") or c.isspace()
    )
    words = " ".join(kept.split())
    return words if len(words) <= limit else words[: limit - 1].rstrip() + "…"


def fill(text: str, words: Mapping[str, str]) -> str:
    return "".join(literal + (words[name] if name else "") for literal, name, _, _ in Formatter().parse(text))


def compose(
    templates: Templates,
    kind: Kind,
    *,
    language: Language,
    to: str,
    values: Mapping[str, Value],
    link: str | None = None,
    site: str = "",
) -> Email:
    """The email of `kind` to `to`: `values` gives each of the kind's placeholders, and the button goes to `link`."""
    template = templates.template(kind, language)
    check(kind, template)
    if missing := SHAPES[kind].placeholders - values.keys():
        raise ValueError(f"{kind} emails need {', '.join(sorted(missing))}")
    if SHAPES[kind].links and not link:
        raise ValueError(f"{kind} emails need a link")
    words = {name: written(value, language) for name, value in values.items()}
    parts = layout.Parts(
        subject=fill(template.subject, words),
        heading=fill(template.heading, words),
        paragraphs=tuple(fill(p.strip(), words) for p in re.split(r"\n\s*\n", template.body) if p.strip()),
        action=fill(template.action, words) if template.action and link else None,
        link=link,
        note=fill(template.note, words) if template.note else None,
    )
    home = page(site, language, "/") if site else None
    return Email(
        to=to, subject=parts.subject, text=layout.text(parts, language, home), html=layout.html(parts, language, home)
    )
