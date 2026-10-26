"""Each kind of email the platform sends, the words it is written with, and where those words come from."""

from dataclasses import dataclass
from enum import StrEnum
from string import Formatter
from typing import Literal, Protocol

Language = Literal["es", "en", "pt"]


class Kind(StrEnum):
    """An email the platform sends."""

    INVITATION_TO_COLLABORATE = "invitation-to-collaborate"
    INVITATION_TO_VIEW = "invitation-to-view"


@dataclass(frozen=True)
class Shape:
    """What every sender of a kind gives: the values its templates may place, and whether a link for its button."""

    placeholders: frozenset[str]
    links: bool


INVITATION = Shape(frozenset({"inviter", "project", "email", "until"}), links=True)
SHAPES: dict[Kind, Shape] = {Kind.INVITATION_TO_COLLABORATE: INVITATION, Kind.INVITATION_TO_VIEW: INVITATION}


@dataclass(frozen=True)
class Template:
    """An email's words. `{name}` places a value, and a blank line separates the body's paragraphs."""

    subject: str
    heading: str
    body: str
    # The button's label, for the kinds that link somewhere.
    action: str | None = None
    # Small print under the button.
    note: str | None = None

    def texts(self) -> dict[str, str]:
        return {
            "subject": self.subject,
            "heading": self.heading,
            "body": self.body,
            "action": self.action or "",
            "note": self.note or "",
        }


class TemplateError(ValueError):
    """A template places a value its kind does not give, or writes a placeholder badly."""


def placeholders(text: str) -> set[str]:
    """The names `text` places; raises `TemplateError` on anything but a plain `{name}`."""
    try:
        parsed = list(Formatter().parse(text))
    except ValueError as error:
        raise TemplateError(f"Unbalanced braces in {text!r}") from error
    found: set[str] = set()
    for _, name, spec, conversion in parsed:
        if name is None:
            continue
        if not name.isidentifier() or spec or conversion:
            field = name + (f"!{conversion}" if conversion else "") + (f":{spec}" if spec else "")
            raise TemplateError(f"Write placeholders as {{name}}, not {{{field}}}, in {text!r}")
        found.add(name)
    return found


def check(kind: Kind, template: Template) -> None:
    """Refuses a template its kind's emails could not be written with."""
    texts = template.texts()
    for part in ("subject", "heading", "body") + (("action",) if SHAPES[kind].links else ()):
        if not texts[part].strip():
            raise TemplateError(f"{kind} emails need their {part}")
    for part in ("subject", "heading", "action"):
        if "\n" in texts[part] or "\r" in texts[part]:
            raise TemplateError(f"The {part} is one line")
    unknown = set[str]().union(*(placeholders(text) for text in texts.values())) - SHAPES[kind].placeholders
    if unknown:
        raise TemplateError(f"{kind} emails do not give {', '.join(sorted(unknown))}")


class Templates(Protocol):
    """Where the words come from: the code's own today, a store people edit tomorrow."""

    def template(self, kind: Kind, language: Language) -> Template:
        """The words of `kind` in `language`."""
        ...
