"""The words written in the code: every kind of email, in every language."""

from idea_agro_api.emails.templates import Kind, Language, Template

# Who invites, when the account has neither a name nor an email.
SOMEONE: dict[Language, str] = {"es": "Alguien", "en": "Someone", "pt": "Alguém"}

WORDS: dict[Kind, dict[Language, Template]] = {
    Kind.INVITATION_TO_COLLABORATE: {
        "es": Template(
            subject="{inviter} te invitó a «{project}» en IDEA-Agro",
            heading="Te invitaron a un proyecto",
            body=(
                "{inviter} te invitó a «{project}» como colaborador.\n\n"
                "Vas a poder agregar y quitar zonas y cambiar sus contornos."
            ),
            action="Ver la invitación",
            note="Es para {email} y vence el {until}. Si no la esperabas, podés ignorar este correo.",
        ),
        "en": Template(
            subject="{inviter} invited you to “{project}” on IDEA-Agro",
            heading="You were invited to a project",
            body=(
                "{inviter} invited you to “{project}” as a collaborator.\n\n"
                "You will be able to add and remove areas and change their outlines."
            ),
            action="See the invitation",
            note="It is for {email} and expires on {until}. If you did not expect it, you can ignore this email.",
        ),
        "pt": Template(
            subject="{inviter} convidou você para “{project}” no IDEA-Agro",
            heading="Você foi convidado para um projeto",
            body=(
                "{inviter} convidou você para “{project}” como colaborador.\n\n"
                "Você vai poder adicionar e remover zonas e mudar seus contornos."
            ),
            action="Ver o convite",
            note="É para {email} e vence em {until}. Se você não esperava, pode ignorar este e-mail.",
        ),
    },
    Kind.INVITATION_TO_VIEW: {
        "es": Template(
            subject="{inviter} te invitó a «{project}» en IDEA-Agro",
            heading="Te invitaron a un proyecto",
            body=(
                "{inviter} te invitó a «{project}» como lector.\n\n"
                "Vas a poder ver el proyecto, sus zonas y su actividad."
            ),
            action="Ver la invitación",
            note="Es para {email} y vence el {until}. Si no la esperabas, podés ignorar este correo.",
        ),
        "en": Template(
            subject="{inviter} invited you to “{project}” on IDEA-Agro",
            heading="You were invited to a project",
            body=(
                "{inviter} invited you to “{project}” as a viewer.\n\n"
                "You will be able to see the project, its areas and its activity."
            ),
            action="See the invitation",
            note="It is for {email} and expires on {until}. If you did not expect it, you can ignore this email.",
        ),
        "pt": Template(
            subject="{inviter} convidou você para “{project}” no IDEA-Agro",
            heading="Você foi convidado para um projeto",
            body=(
                "{inviter} convidou você para “{project}” como leitor.\n\n"
                "Você vai poder ver o projeto, suas zonas e sua atividade."
            ),
            action="Ver o convite",
            note="É para {email} e vence em {until}. Se você não esperava, pode ignorar este e-mail.",
        ),
    },
    Kind.PLATFORM_INVITATION: {
        "es": Template(
            subject="{inviter} te invita a IDEA-Agro",
            heading="Te invitaron a IDEA-Agro",
            body=(
                "{inviter} te invita a IDEA-Agro, la plataforma abierta de indicadores ambientales y productivos "
                "del agro uruguayo.\n\n"
                "Con tu cuenta vas a poder guardar tus zonas, seguir sus indicadores mes a mes y compartirlas en "
                "proyectos."
            ),
            action="Entrar a IDEA-Agro",
            note="Es para {email} y vale hasta el {until}. Si no la esperabas, podés ignorar este correo.",
        ),
        "en": Template(
            subject="{inviter} invites you to IDEA-Agro",
            heading="You were invited to IDEA-Agro",
            body=(
                "{inviter} invites you to IDEA-Agro, the open platform of environmental and productive indicators "
                "of Uruguay's farmland.\n\n"
                "With an account you can save your own areas, follow their indicators month by month and share them "
                "in projects."
            ),
            action="Sign in to IDEA-Agro",
            note="It is for {email} and lasts until {until}. If you did not expect it, you can ignore this email.",
        ),
        "pt": Template(
            subject="{inviter} convida você para o IDEA-Agro",
            heading="Você foi convidado para o IDEA-Agro",
            body=(
                "{inviter} convida você para o IDEA-Agro, a plataforma aberta de indicadores ambientais e produtivos "
                "do agro uruguaio.\n\n"
                "Com a sua conta você vai poder guardar suas zonas, acompanhar seus indicadores mês a mês e "
                "compartilhá-las em projetos."
            ),
            action="Entrar no IDEA-Agro",
            note="É para {email} e vale até {until}. Se você não esperava, pode ignorar este e-mail.",
        ),
    },
}


class BuiltInTemplates:
    """The `Templates` written in the code."""

    def template(self, kind: Kind, language: Language) -> Template:
        return WORDS[kind][language]
