import logging
from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Response
from fastapi import Path as PathParam
from starlette.exceptions import HTTPException

from idea_agro_api.accounts import Account, Role
from idea_agro_api.audit import AuditAction, AuditEntry
from idea_agro_api.deps import AdminDep, Caller, ServicesDep
from idea_agro_api.errors import RecentSignInRequired, SessionsEndedLocally, problems
from idea_agro_api.models import AccessChange, AccountRole, AdminAccount, AuditOut, RolesChange
from idea_agro_api.services import Services

router = APIRouter(tags=["Admin"])
log = logging.getLogger("idea_agro_api")

AccountId = Annotated[UUID, PathParam(description="The account's id.")]
LISTED = 50
PROVIDER_FAILED = "provider_failed"


def found(services: Services, id: UUID) -> Account:
    account = services.accounts.get(str(id))
    if account is None:
        raise HTTPException(404, "There is no such account.")
    return account


def recently_signed_in(caller: Caller, services: Services) -> None:
    """Sensitive actions need a sign-in from the last minutes, so a stolen session alone cannot do them.

    Only the sign-in time counts: a token's issue time renews every hour without anyone signing in.
    """
    signed_in = caller.identity.auth_time
    if signed_in is None or datetime.now(UTC) - signed_in > timedelta(seconds=services.limits.recent_sign_in_seconds):
        raise RecentSignInRequired("Sign in again to do this: it needs a recent sign-in.")


def audit(services: Services, caller: Caller, action: AuditAction, target: Account, detail: str = "") -> None:
    actor = caller.account
    entry = AuditEntry(datetime.now(UTC), actor.id, actor.display_name, action, target.id, target.email or "", detail)
    services.audit.record(entry)


def admin_view(account: Account) -> AdminAccount:
    return AdminAccount(
        id=account.id,
        email=account.email,
        name=account.name,
        picture=account.picture,
        roles=[AccountRole.CLIENT, *(AccountRole(role.value) for role in sorted(account.roles))],
        disabled=account.disabled,
        created_at=account.created_at,
    )


def at_provider(services: Services, account: Account, *, revoke: bool, disabled: bool | None = None) -> bool:
    """Tells the sign-in provider about every identity of the account; False when it did not take it."""
    try:
        for subject in services.accounts.subjects(account.id):
            if disabled is not None:
                services.identity_admin.set_disabled(subject, disabled)
            if revoke:
                services.identity_admin.revoke_sessions(subject)
    except Exception:
        log.warning("The sign-in provider did not take an admin change", exc_info=True)
        return False
    return True


def now_on() -> datetime:
    return datetime.now(UTC).replace(microsecond=0)


@router.get(
    "/v1/admin/accounts",
    summary="Accounts",
    description="For admins: the newest accounts, or those whose email or name starts with the search.",
    responses=problems(401, 403, 429),
)
def list_accounts(
    caller: AdminDep,
    services: ServicesDep,
    q: Annotated[str, Query(max_length=100, description="Part of a name or an email.")] = "",
) -> list[AdminAccount]:
    accounts = services.accounts.search(q, LISTED) if q.strip() else services.accounts.newest(LISTED)
    return [admin_view(a) for a in accounts]


@router.put(
    "/v1/admin/accounts/{account_id}/roles",
    summary="Change an account's roles",
    description="For admins, with a recent sign-in. Admins cannot remove their own admin role.",
    responses=problems(401, 403, 404, 409, 422, 429),
)
def change_account_roles(
    account_id: AccountId, change: RolesChange, caller: AdminDep, services: ServicesDep
) -> AdminAccount:
    recently_signed_in(caller, services)
    account = found(services, account_id)
    roles = frozenset(Role(r) for r in change.roles)
    if account.id == caller.account.id and Role.ADMIN not in roles:
        raise HTTPException(409, "You cannot remove your own admin role: another admin can.")
    changed = services.accounts.update(account.id, roles=roles)
    audit(services, caller, AuditAction.ROLES_CHANGED, account, ",".join(sorted(roles)))
    return admin_view(changed)


@router.post(
    "/v1/admin/accounts/{account_id}/sessions/revoke",
    status_code=204,
    summary="Log an account out everywhere",
    description="For admins: tokens from earlier sign-ins are refused, and the provider stops renewing them.",
    responses=problems(401, 403, 404, 422, 429, 503),
)
def revoke_account_sessions(account_id: AccountId, caller: AdminDep, services: ServicesDep) -> Response:
    account = found(services, account_id)
    # Ours first, so older sign-ins are refused even if the provider does not answer.
    services.accounts.update(account.id, sessions_valid_after=now_on())
    taken = at_provider(services, account, revoke=True)
    audit(services, caller, AuditAction.SESSIONS_REVOKED, account, "" if taken else PROVIDER_FAILED)
    if not taken:
        raise SessionsEndedLocally("The sessions ended here, but the sign-in provider did not answer.")
    return Response(status_code=204)


@router.put(
    "/v1/admin/accounts/{account_id}/access",
    summary="Disable or enable an account",
    description=(
        "For admins, with a recent sign-in. A disabled account cannot use any private route, and its sessions end. "
        "Admins cannot disable themselves."
    ),
    responses=problems(401, 403, 404, 409, 422, 429, 503),
)
def change_account_access(
    account_id: AccountId, change: AccessChange, caller: AdminDep, services: ServicesDep
) -> AdminAccount:
    recently_signed_in(caller, services)
    account = found(services, account_id)
    if account.id == caller.account.id:
        raise HTTPException(409, "You cannot disable your own account.")
    # Disabling also ends the sessions, so enabling later does not bring old tokens back.
    ended = {"sessions_valid_after": now_on()} if change.disabled else {}
    changed = services.accounts.update(account.id, disabled=change.disabled, **ended)
    taken = at_provider(services, account, revoke=change.disabled, disabled=change.disabled)
    action = AuditAction.DISABLED if change.disabled else AuditAction.ENABLED
    audit(services, caller, action, account, "" if taken else PROVIDER_FAILED)
    # Our record is what every private route checks, so a disable holds anyway; an enable the provider did not
    # take leaves the person unable to sign in.
    if not taken and not change.disabled:
        raise HTTPException(503, "Enabled here, but the sign-in provider did not answer: enable it again.")
    return admin_view(changed)


@router.post(
    "/v1/admin/accounts/{account_id}/recovery",
    status_code=204,
    summary="Send a password recovery link",
    description=(
        "For admins: the sign-in provider emails a link that expires and works once. Only for password sign-in, "
        "which the platform may not offer: then it answers 409."
    ),
    responses=problems(401, 403, 404, 409, 422, 429),
)
def send_account_recovery(account_id: AccountId, caller: AdminDep, services: ServicesDep) -> Response:
    account = found(services, account_id)
    if not services.password_sign_in:
        raise HTTPException(409, "Accounts here sign in with Google only: there is no password to recover.")
    if not account.email:
        raise HTTPException(409, "The account has no email to send the link to.")
    services.identity_admin.send_recovery(account.email)
    audit(services, caller, AuditAction.RECOVERY_SENT, account)
    return Response(status_code=204)


@router.get(
    "/v1/admin/audit",
    summary="What admins did",
    description="For admins: the latest admin actions, newest first.",
    responses=problems(401, 403, 429),
)
def list_audit(caller: AdminDep, services: ServicesDep) -> list[AuditOut]:
    return [
        AuditOut(
            at=e.at,
            actor_name=e.actor_name,
            action=e.action,
            target=e.target,
            target_email=e.target_email,
            detail=e.detail,
        )
        for e in services.audit.latest(200)
    ]
