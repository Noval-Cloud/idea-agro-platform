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
WIDTH = 520
PAGE = f"margin:0;padding:0;background:{CANVAS};font-family:{FONT};color:{INK}"
OUTER = f"background:{CANVAS};padding:32px 16px"
CARD = f"max-width:{WIDTH}px;background:#ffffff;border:1px solid {LINE};border-radius:12px"
FOOT = f"max-width:{WIDTH}px"
PREVIEW = "display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all"
# Outlook does not pass the font down into cells: every row names it.
BRAND_ROW = f"padding:32px 32px 0;font-family:{FONT};font-size:14px;font-weight:700;color:{BRAND}"
HEADING_ROW = f"padding:20px 32px 12px;font-family:{FONT};font-size:22px;line-height:1.3;font-weight:600;color:{INK}"
PARAGRAPH_ROW = f"padding:0 32px 12px;font-family:{FONT};font-size:16px;line-height:1.55;color:{MUTED}"
BUTTON_ROW = "padding:12px 32px 24px"
FALLBACK_ROW = f"padding:0 32px 16px;font-family:{FONT};font-size:13px;line-height:1.5;color:{SUBTLE}"
NOTE_ROW = (
    f"padding:16px 32px 32px;border-top:1px solid {LINE};"
    f"font-family:{FONT};font-size:13px;line-height:1.5;color:{SUBTLE}"
)
FOOT_ROW = f"padding:20px 32px 0;font-family:{FONT};font-size:12px;line-height:1.5;color:{SUBTLE};text-align:center"
# The cell carries the color, so Outlook, which ignores a link's padding, still draws a button.
BUTTON_CELL = f"background:{ACTION};border-radius:8px;mso-padding-alt:12px 20px"
BUTTON = (
    f"display:inline-block;padding:12px 20px;font-family:{FONT};font-size:15px;font-weight:600;"
    "color:#ffffff;text-decoration:none;border-radius:8px"
)
# Fills the inbox preview after the first paragraph, so it does not run on into the email's text.
PREVIEW_FILL = "&zwnj;&nbsp;" * 60
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
        button = (
            f'<table role="presentation" cellpadding="0" cellspacing="0"><tr>'
            f'<td bgcolor="{ACTION}" style="{BUTTON_CELL}">'
            f'<a href="{link}" style="{BUTTON}">{escape(parts.action)}</a></td></tr></table>'
        )
        rows.append(row(BUTTON_ROW, button))
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
        f"<title>{escape(parts.subject)}</title>"
        f"<!--[if mso]><style>td,a{{font-family:Arial,sans-serif!important}}</style><![endif]--></head>"
        f'<body style="{PAGE}"><div style="{PREVIEW}">{preview}{PREVIEW_FILL}</div>'
        f'<table {TABLE} style="{OUTER}"><tr><td align="center">'
        # Outlook ignores max-width: a fixed-width table holds the email there.
        f'<!--[if mso]><table role="presentation" width="{WIDTH}" align="center"><tr><td><![endif]-->'
        f'<table {TABLE} style="{CARD}">{"".join(rows)}</table>'
        f'<table {TABLE} style="{FOOT}">{row(FOOT_ROW, about)}</table>'
        "<!--[if mso]></td></tr></table><![endif]-->"
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
