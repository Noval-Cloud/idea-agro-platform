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


# The values every sender of a kind gives, which its templates may place.
PLACEHOLDERS: dict[Kind, frozenset[str]] = {
    Kind.INVITATION_TO_COLLABORATE: frozenset({"inviter", "project", "email", "until"}),
    Kind.INVITATION_TO_VIEW: frozenset({"inviter", "project", "email", "until"}),
}


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

    def texts(self) -> tuple[str, ...]:
        return (self.subject, self.heading, self.body, self.action or "", self.note or "")


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
            raise TemplateError(f"Write placeholders as {{name}}, not {{{name}}} in {text!r}")
        found.add(name)
    return found


def check(kind: Kind, template: Template) -> None:
    """Refuses a template that places a value its kind does not give."""
    unknown = set[str]().union(*(placeholders(text) for text in template.texts())) - PLACEHOLDERS[kind]
    if unknown:
        raise TemplateError(f"{kind} emails do not give {', '.join(sorted(unknown))}")


class Templates(Protocol):
    """Where the words come from: the code's own today, a store people edit tomorrow."""

    def template(self, kind: Kind, language: Language) -> Template:
        """The words of `kind` in `language`."""
        ...
