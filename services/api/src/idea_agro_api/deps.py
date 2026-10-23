"""What routes declare they need: the services, and for private routes, the account calling."""

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from starlette.exceptions import HTTPException

from idea_agro_api.accounts import Account, account_id, new_account, refreshed
from idea_agro_api.auth import Identity, InvalidToken
from idea_agro_api.security import client_key
from idea_agro_api.services import Services

bearer = HTTPBearer(auto_error=False, description="A token from the sign-in provider, as `Bearer <token>`.")


def services(request: Request) -> Services:
    return request.app.state.services


@dataclass(frozen=True)
class Caller:
    account: Account
    identity: Identity


def unauthorized(detail: str) -> HTTPException:
    return HTTPException(401, detail, headers={"WWW-Authenticate": "Bearer"})


def caller(
    request: Request,
    response: Response,
    found: Annotated[Services, Depends(services)],
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> Caller:
    """The signed-in account. Private routes depend on this, and on nothing about how sign-in works."""
    response.headers["Cache-Control"] = "no-store"
    if not found.rate_limit.allow(client_key(request)):
        raise HTTPException(
            429, "Too many requests.", headers={"Retry-After": str(found.rate_limit.seconds_to_reset())}
        )
    if found.verifier is None:
        raise HTTPException(503, "Sign-in is not configured.")
    if credentials is None:
        raise unauthorized("Sign in to use this route.")
    try:
        identity = found.verifier.verify(credentials.credentials)
    except InvalidToken as error:
        raise unauthorized("The token is not valid.") from error
    account = found.accounts.get(account_id(identity)) or found.accounts.create(new_account(identity))
    if account.disabled:
        raise HTTPException(403, "The account is disabled.")
    if not account.accepts(identity):
        raise unauthorized("The session has ended: sign in again.")
    current = refreshed(account, identity)
    if current != account:
        found.accounts.save(current)
    return Caller(account=current, identity=identity)


ServicesDep = Annotated[Services, Depends(services)]
CallerDep = Annotated[Caller, Depends(caller)]
