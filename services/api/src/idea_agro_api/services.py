"""Everything the routes depend on, built once from the environment and injected into the app."""

import os
from dataclasses import dataclass, field

from idea_agro_api.accounts import AccountStore, MemoryAccounts, accounts_from
from idea_agro_api.auth import OidcVerifier, PublishedKeys, TokenVerifier
from idea_agro_api.identity_admin import IdentityAdmin, NoIdentityAdmin, identity_admin_from
from idea_agro_api.security import RateLimit
from idea_agro_api.zones import ZoneStore, files_from


@dataclass(frozen=True)
class Services:
    zones: ZoneStore
    accounts: AccountStore
    # None when sign-in is not configured: private routes then answer 503.
    verifier: TokenVerifier | None = None
    identity_admin: IdentityAdmin = field(default_factory=NoIdentityAdmin)
    rate_limit: RateLimit = field(default_factory=lambda: RateLimit(per_minute=60))

    @staticmethod
    def from_env() -> Services:
        """`ZONES_SOURCE` is required; sign-in needs `AUTH_ISSUER`, `AUTH_AUDIENCE` and `AUTH_JWKS_URL`."""
        env = os.environ
        verifier = None
        if issuer := env.get("AUTH_ISSUER"):
            verifier = OidcVerifier(issuer, env["AUTH_AUDIENCE"], PublishedKeys(env["AUTH_JWKS_URL"]))
        return Services(
            zones=ZoneStore(files_from(env["ZONES_SOURCE"])),
            accounts=accounts_from(env.get("ACCOUNTS_SOURCE", "memory://")),
            verifier=verifier,
            identity_admin=identity_admin_from(env.get("IDENTITY_ADMIN", "none")),
            rate_limit=RateLimit(per_minute=int(env.get("PRIVATE_REQUESTS_PER_MINUTE", "60"))),
        )


def services_for_tests(zones: ZoneStore, verifier: TokenVerifier | None = None) -> Services:
    return Services(zones=zones, accounts=MemoryAccounts(), verifier=verifier)
