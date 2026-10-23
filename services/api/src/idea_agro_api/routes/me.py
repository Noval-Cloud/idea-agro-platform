from datetime import UTC, datetime

from fastapi import APIRouter, Response

from idea_agro_api.deps import CallerDep, ServicesDep
from idea_agro_api.errors import SessionsEndedLocally, problems
from idea_agro_api.models import AccountRole, Me

router = APIRouter(tags=["Account"])


@router.get("/v1/me", summary="Your account", responses=problems(401, 403, 429))
def get_me(caller: CallerDep) -> Me:
    account = caller.account
    return Me(
        id=account.id,
        email=account.email,
        name=account.name,
        picture=account.picture,
        roles=[AccountRole.CLIENT, *(AccountRole(role.value) for role in sorted(account.roles))],
        created_at=account.created_at,
    )


@router.post(
    "/v1/me/sessions/revoke",
    status_code=204,
    summary="Log out everywhere",
    description=(
        "Ends every session of your account, on every device: tokens from a sign-in before now are refused, "
        "and the sign-in provider stops renewing them."
    ),
    responses=problems(401, 403, 429, 503),
)
def revoke_my_sessions(caller: CallerDep, services: ServicesDep) -> Response:
    # Ours first: even if the provider fails below, older sign-ins are already refused.
    services.accounts.update(caller.account.id, sessions_valid_after=datetime.now(UTC).replace(microsecond=0))
    try:
        services.identity_admin.revoke_sessions(caller.identity)
    except Exception as error:
        raise SessionsEndedLocally("Your sessions ended here, but the sign-in provider did not answer.") from error
    return Response(status_code=204)
