from datetime import UTC, datetime

from idea_agro_api.activity import Action, Activity
from idea_agro_api.deps import Caller
from idea_agro_api.services import Services


def note(
    services: Services, projects: list[str], caller: Caller, action: Action, subject: str = "", detail: str = ""
) -> None:
    """Records the change in each project's activity."""
    if not projects:
        return
    now = datetime.now(UTC)
    account = caller.account
    services.activity.record(
        [Activity(p, now, account.id, account.display_name, action, subject, detail) for p in projects]
    )
