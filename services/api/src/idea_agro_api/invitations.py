"""The email that tells someone they were invited to a project, in the inviter's language."""

from datetime import datetime, timedelta, timezone
from html import escape
from typing import Literal

from idea_agro_api.mail import Email
from idea_agro_api.projects import MemberRole

Language = Literal["es", "en", "pt"]

MESSAGES: dict[Language, dict[str, str]] = {
    "es": {
        "subject": "{inviter} te invitó a «{project}» en IDEA-Agro",
        "heading": "Te invitaron a un proyecto",
        "lead": "{inviter} te invitó a «{project}» como {role}.",
        "collaborator": "colaborador",
        "viewer": "lector",
        "collaborator_body": "Vas a poder agregar y quitar zonas y cambiar sus contornos.",
        "viewer_body": "Vas a poder ver el proyecto, sus zonas y su actividad.",
        "button": "Ver la invitación",
        "note": "Es para {email} y vence el {until}. Si no la esperabas, podés ignorar este correo.",
        "date": "{day} de {month} de {year}",
        "someone": "Alguien",
    },
    "en": {
        "subject": "{inviter} invited you to “{project}” on IDEA-Agro",
        "heading": "You were invited to a project",
        "lead": "{inviter} invited you to “{project}” as a {role}.",
        "collaborator": "collaborator",
        "viewer": "viewer",
        "collaborator_body": "You will be able to add and remove areas and change their outlines.",
        "viewer_body": "You will be able to see the project, its areas and its activity.",
        "button": "See the invitation",
        "note": "It is for {email} and expires on {until}. If you did not expect it, you can ignore this email.",
        "date": "{day} {month} {year}",
        "someone": "Someone",
    },
    "pt": {
        "subject": "{inviter} convidou você para “{project}” no IDEA-Agro",
        "heading": "Você foi convidado para um projeto",
        "lead": "{inviter} convidou você para “{project}” como {role}.",
        "collaborator": "colaborador",
        "viewer": "leitor",
        "collaborator_body": "Você vai poder adicionar e remover zonas e mudar seus contornos.",
        "viewer_body": "Você vai poder ver o projeto, suas zonas e sua atividade.",
        "button": "Ver o convite",
        "note": "É para {email} e vence em {until}. Se você não esperava, pode ignorar este e-mail.",
        "date": "{day} de {month} de {year}",
        "someone": "Alguém",
    },
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

# Dates in the email are Uruguay's, which keeps UTC-3 all year.
URUGUAY = timezone(timedelta(hours=-3))

# The site's address prefix for each language: Spanish is the default, at the root.
PREFIX: dict[Language, str] = {"es": "", "en": "/en", "pt": "/pt"}

# Email clients ignore stylesheets: the look travels inline, in the site's ink, action and family green.
INK = "#1c1b3a"
MUTED = "#4a4f63"
SUBTLE = "#6b7086"
ACTION = "#1e1b4b"
BRAND = "#3e8731"
LINE = "#e3e6ef"
CANVAS = "#f6f7fb"
FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
PAGE = f"margin:0;background:{CANVAS};font-family:{FONT};color:{INK}"
OUTER = f"background:{CANVAS};padding:32px 16px"
CARD = f"max-width:520px;background:#ffffff;border:1px solid {LINE};border-radius:12px"
BRAND_ROW = f"padding:32px 32px 0;font-size:14px;font-weight:600;color:{BRAND}"
HEADING_ROW = "padding:20px 32px 8px;font-size:22px;line-height:1.3;font-weight:600"
LEAD_ROW = f"padding:0 32px 8px;font-size:16px;line-height:1.55;color:{MUTED}"
BODY_ROW = f"padding:0 32px 24px;font-size:16px;line-height:1.55;color:{MUTED}"
BUTTON_ROW = "padding:0 32px 24px"
NOTE_ROW = f"padding:0 32px 32px;font-size:13px;line-height:1.5;color:{SUBTLE}"
BUTTON = (
    f"display:inline-block;background:{ACTION};color:#ffffff;text-decoration:none;"
    "font-weight:600;font-size:15px;padding:12px 20px;border-radius:8px"
)


def invitation_link(site: str, language: Language, project_id: str, code: str) -> str:
    """The invitation's page; the code rides in the fragment, which browsers never send to a server."""
    return f"{site.rstrip('/')}{PREFIX[language]}/invitation/#project={project_id}&code={code}"


def invitation(
    *, language: Language, to: str, inviter: str | None, project: str, role: MemberRole, link: str, until: datetime
) -> Email:
    m = MESSAGES[language]
    who = inviter or m["someone"]
    local = until.astimezone(URUGUAY)
    date = m["date"].format(day=local.day, month=MONTHS[language][local.month - 1], year=local.year)
    values = {"inviter": who, "project": project, "role": m[role.value], "email": to, "until": date}
    lead = m["lead"].format(**values)
    body = m[f"{role.value}_body"]
    note = m["note"].format(**values)
    text = f"{m['heading']}\n\n{lead} {body}\n\n{m['button']}: {link}\n\n{note}\n"
    safe = {k: escape(v) for k, v in values.items()}
    button = f'<a href="{escape(link)}" style="{BUTTON}">{escape(m["button"])}</a>'
    rows = "".join(
        f'<tr><td style="{style}">{content}</td></tr>'
        for style, content in (
            (BRAND_ROW, "IDEA-Agro"),
            (HEADING_ROW, escape(m["heading"])),
            (LEAD_ROW, escape(m["lead"]).format(**safe)),
            (BODY_ROW, escape(body)),
            (BUTTON_ROW, button),
            (NOTE_ROW, escape(m["note"]).format(**safe)),
        )
    )
    table = 'role="presentation" width="100%" cellpadding="0" cellspacing="0"'
    html = (
        f'<!doctype html><html lang="{language}"><body style="{PAGE}">'
        f'<table {table} style="{OUTER}"><tr><td align="center">'
        f'<table {table} style="{CARD}">{rows}</table>'
        "</td></tr></table></body></html>"
    )
    return Email(to=to, subject=m["subject"].format(**values), text=text, html=html)
