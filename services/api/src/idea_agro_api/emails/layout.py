"""The one look every email shares: plain, readable in any client, and with a plain-text copy."""

from dataclasses import dataclass
from html import escape

from idea_agro_api.emails.templates import Language


@dataclass(frozen=True)
class Parts:
    """An email's words with its values in place: plain text, which the layout escapes."""

    subject: str
    heading: str
    paragraphs: tuple[str, ...]
    action: str | None
    link: str | None
    note: str | None


FOOTER: dict[Language, dict[str, str]] = {
    "es": {
        "about": "Indicadores ambientales y productivos del agro uruguayo",
        "fallback": "Si el botón no funciona, copiá este enlace en tu navegador:",
    },
    "en": {
        "about": "Environmental and productive indicators of Uruguay's farmland",
        "fallback": "If the button does not work, paste this link into your browser:",
    },
    "pt": {
        "about": "Indicadores ambientais e produtivos do agro uruguaio",
        "fallback": "Se o botão não funcionar, copie este link no seu navegador:",
    },
}

# Email clients ignore stylesheets: the look travels inline, in the site's ink, action and family green.
INK = "#1c1b3a"
MUTED = "#4a4f63"
SUBTLE = "#6b7086"
ACTION = "#1e1b4b"
BRAND = "#3e8731"
LINE = "#e3e6ef"
CANVAS = "#f6f7fb"
FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
PAGE = f"margin:0;padding:0;background:{CANVAS};font-family:{FONT};color:{INK}"
OUTER = f"background:{CANVAS};padding:32px 16px"
CARD = f"max-width:520px;background:#ffffff;border:1px solid {LINE};border-radius:12px"
FOOT = "max-width:520px"
PREVIEW = "display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all"
BRAND_ROW = f"padding:32px 32px 0;font-size:14px;font-weight:700;letter-spacing:0.02em;color:{BRAND}"
HEADING_ROW = "padding:20px 32px 12px;font-size:22px;line-height:1.3;font-weight:600"
PARAGRAPH_ROW = f"padding:0 32px 12px;font-size:16px;line-height:1.55;color:{MUTED}"
BUTTON_ROW = "padding:12px 32px 24px"
FALLBACK_ROW = f"padding:0 32px 16px;font-size:13px;line-height:1.5;color:{SUBTLE}"
NOTE_ROW = f"padding:16px 32px 32px;border-top:1px solid {LINE};font-size:13px;line-height:1.5;color:{SUBTLE}"
FOOT_ROW = f"padding:20px 32px 0;font-size:12px;line-height:1.5;color:{SUBTLE};text-align:center"
BUTTON = (
    f"display:inline-block;background:{ACTION};color:#ffffff;text-decoration:none;"
    "font-weight:600;font-size:15px;padding:12px 20px;border-radius:8px"
)
LINK = f"color:{SUBTLE}"
# A long address breaks anywhere rather than widening the email.
LONG_LINK = f"{LINK};word-break:break-all"
TABLE = 'role="presentation" width="100%" cellpadding="0" cellspacing="0"'


def html(parts: Parts, language: Language, home: str | None) -> str:
    def row(style: str, content: str) -> str:
        return f'<tr><td style="{style}">{content}</td></tr>'

    rows = [row(BRAND_ROW, "IDEA-Agro"), row(HEADING_ROW, escape(parts.heading))]
    rows += [row(PARAGRAPH_ROW, escape(paragraph)) for paragraph in parts.paragraphs]
    if parts.action and parts.link:
        link = escape(parts.link)
        rows.append(row(BUTTON_ROW, f'<a href="{link}" style="{BUTTON}">{escape(parts.action)}</a>'))
        fallback = escape(FOOTER[language]["fallback"])
        rows.append(row(FALLBACK_ROW, f'{fallback}<br><a href="{link}" style="{LONG_LINK}">{link}</a>'))
    if parts.note:
        rows.append(row(NOTE_ROW, escape(parts.note)))
    about = f"IDEA-Agro · {escape(FOOTER[language]['about'])}"
    if home:
        about += f'<br><a href="{escape(home)}" style="{LINK}">{escape(home.split("://")[-1].rstrip("/"))}</a>'
    preview = escape(parts.paragraphs[0]) if parts.paragraphs else ""
    return (
        f'<!doctype html><html lang="{language}"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">'
        f"<title>{escape(parts.subject)}</title></head>"
        f'<body style="{PAGE}"><div style="{PREVIEW}">{preview}</div>'
        f'<table {TABLE} style="{OUTER}"><tr><td align="center">'
        f'<table {TABLE} style="{CARD}">{"".join(rows)}</table>'
        f'<table {TABLE} style="{FOOT}">{row(FOOT_ROW, about)}</table>'
        "</td></tr></table></body></html>"
    )


def text(parts: Parts, language: Language, home: str | None) -> str:
    blocks = [parts.heading, *parts.paragraphs]
    if parts.action and parts.link:
        blocks.append(f"{parts.action}: {parts.link}")
    if parts.note:
        blocks.append(parts.note)
    blocks.append("\n".join(line for line in (f"IDEA-Agro · {FOOTER[language]['about']}", home) if line))
    return "\n\n".join(blocks) + "\n"
