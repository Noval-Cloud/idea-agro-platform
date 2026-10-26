"""What routes declare they need: the services, and for private routes, the account calling."""

import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, Request, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from starlette.exceptions import HTTPException

from idea_agro_api.accounts import Account, Role, new_account, profile_changes
from idea_agro_api.audit import AuditAction, AuditEntry
from idea_agro_api.auth import Identity, InvalidToken, KeysUnavailable
from idea_agro_api.security import client_key
from idea_agro_api.services import Services

log = logging.getLogger(__name__)
bearer = HTTPBearer(auto_error=False, description="A token from the sign-in provider, as `Bearer <token>`.")


def services(request: Request) -> Services:
    return request.app.state.services


@dataclass(frozen=True)
class Caller:
    account: Account
    identity: Identity


def unauthorized(detail: str) -> HTTPException:
    return HTTPException(401, detail, headers={"WWW-Authenticate": "Bearer"})


def limited(found: Services, key: str) -> None:
    if not found.rate_limit.allow(key):
        raise HTTPException(
            429, "Too many requests.", headers={"Retry-After": str(found.rate_limit.seconds_to_reset())}
        )


def caller(
    request: Request,
    response: Response,
    found: Annotated[Services, Depends(services)],
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> Caller:
    """The signed-in account. Private routes depend on this, and on nothing about how sign-in works."""
    response.headers["Cache-Control"] = "no-store"
    limited(found, f"address:{client_key(request)}")
    if found.verifier is None:
        raise HTTPException(503, "Sign-in is not configured.")
    if credentials is None:
        raise unauthorized("Sign in to use this route.")
    try:
        identity = found.verifier.verify(credentials.credentials)
    except InvalidToken as error:
        raise unauthorized("The token is not valid.") from error
    except KeysUnavailable as error:
        raise HTTPException(503, "Tokens cannot be checked right now: try again later.") from error
    account = found.accounts.by_identity(identity) or joined(found, identity)
    limited(found, f"account:{account.id}")
    if account.disabled:
        raise HTTPException(403, "The account is disabled.")
    if not account.accepts(identity):
        raise unauthorized("The session has ended: sign in again.")
    if changes := profile_changes(account, identity):
        account = found.accounts.update(account.id, **changes)
    return Caller(account=bootstrapped(found, account, identity), identity=identity)


def joined(found: Services, identity: Identity) -> Account:
    """A new account; the invitations to the platform of its verified email are accepted."""
    account = found.accounts.create(new_account(identity), identity)
    if identity.email_verified and identity.email:
        try:
            found.platform_invitations.accept(identity.email.lower(), datetime.now(UTC))
        except Exception:
            # The account matters more than the inviter learning of it.
            log.warning("The invitations of a new account could not be marked accepted", exc_info=True)
    return account


def bootstrapped(found: Services, account: Account, identity: Identity) -> Account:
    """Makes the configured first admins admins when their verified email signs in, once per account.

    Once is what lets another admin take the role away for good.
    """
    email = identity.email or ""
    # Plain ASCII only: case folding of other letters could make a look-alike address match.
    if (
        account.bootstrapped
        or not identity.email_verified
        or not email.isascii()
        or email.lower() not in found.admin_emails
    ):
        return account
    account = found.accounts.update(account.id, roles=account.roles | {Role.ADMIN}, bootstrapped=True)
    entry = AuditEntry(
        datetime.now(UTC), account.id, account.display_name, AuditAction.ADMIN_BOOTSTRAPPED, account.id, email.lower()
    )
    found.audit.record(entry)
    return account


ServicesDep = Annotated[Services, Depends(services)]
CallerDep = Annotated[Caller, Depends(caller)]


def admin(signed_in: CallerDep) -> Caller:
    if Role.ADMIN not in signed_in.account.roles:
        raise HTTPException(403, "Only admins can do this.")
    return signed_in


AdminDep = Annotated[Caller, Depends(admin)]
