"""Everything the routes depend on, built once from the environment and injected into the app."""

import os
from dataclasses import dataclass, field, replace
from pathlib import Path

from idea_agro_api.accounts import AccountStore, MemoryAccounts, accounts_from
from idea_agro_api.activity import ActivityStore, MemoryActivity, activity_from
from idea_agro_api.audit import AuditStore, MemoryAudit, audit_from
from idea_agro_api.auth import OidcVerifier, PublishedKeys, TokenVerifier
from idea_agro_api.documents import (
    DocumentFiles,
    DocumentStore,
    MemoryDocumentFiles,
    MemoryDocuments,
    document_files_from,
    documents_from,
)
from idea_agro_api.emails.templates import Templates
from idea_agro_api.emails.words import BuiltInTemplates
from idea_agro_api.geometries import GeometryStore, MemoryGeometries, geometries_from
from idea_agro_api.identity_admin import IdentityAdmin, NoIdentityAdmin, identity_admin_from
from idea_agro_api.mail import Mailer, NoMailer, mailer_from
from idea_agro_api.platform_invitations import (
    MemoryPlatformInvitations,
    PlatformInvitationStore,
    platform_invitations_from,
)
from idea_agro_api.projects import MemoryProjects, ProjectStore, projects_from
from idea_agro_api.public_data import PublicData
from idea_agro_api.saved_zones import MemorySavedZones, SavedZoneStore, saved_zones_from
from idea_agro_api.security import RateLimit
from idea_agro_api.series import ZoneStore, values_from
from idea_agro_api.shapes import Departments
from idea_agro_api.zone_jobs import NoZoneJobs, ZoneJobs, zone_jobs_from
from idea_agro_api.zones import Files, LocalFiles, files_from


@dataclass(frozen=True)
class Limits:
    """Caps against abuse and runaway cost, each set by an environment variable."""

    saved_zones_per_account: int = 500
    geometry_bytes: int = 1_000_000
    # The whole library is drawn at once on the map, so its outlines are capped together too.
    library_bytes: int = 20_000_000
    zones_per_import: int = 100
    import_bytes: int = 5_000_000
    projects_per_account: int = 50
    zones_per_project: int = 500
    members_per_project: int = 20
    # How long an invitation's link works.
    invitation_days: int = 7
    # How long an invitation waits before it can be emailed again.
    invitation_resend_minutes: int = 10
    # The oldest versions of an outline beyond this many are dropped.
    outline_versions: int = 50
    # How recent a sign-in sensitive admin actions need.
    recent_sign_in_seconds: int = 300
    document_bytes: int = 10_000_000
    documents_per_zone: int = 20
    documents_bytes_per_account: int = 200_000_000
    # Invitations to the platform a person may start a day, and keep pending at once.
    platform_invitations_per_day: int = 10
    platform_invitations_pending: int = 50
    # West, south, east, north: Uruguay with a margin. A zone must touch it.
    coverage: tuple[float, float, float, float] = (-58.6, -35.1, -53.0, -30.0)

    @staticmethod
    def from_env() -> Limits:
        env = os.environ
        return Limits(
            saved_zones_per_account=int(env.get("SAVED_ZONES_PER_ACCOUNT", "500")),
            geometry_bytes=int(env.get("GEOMETRY_MAX_BYTES", "1000000")),
            library_bytes=int(env.get("LIBRARY_MAX_BYTES", "20000000")),
            zones_per_import=int(env.get("ZONES_PER_IMPORT", "100")),
            import_bytes=int(env.get("IMPORT_MAX_BYTES", "5000000")),
            projects_per_account=int(env.get("PROJECTS_PER_ACCOUNT", "50")),
            zones_per_project=int(env.get("ZONES_PER_PROJECT", "500")),
            members_per_project=int(env.get("MEMBERS_PER_PROJECT", "20")),
            invitation_days=int(env.get("INVITATION_DAYS", "7")),
            invitation_resend_minutes=int(env.get("INVITATION_RESEND_MINUTES", "10")),
            outline_versions=int(env.get("OUTLINE_VERSIONS", "50")),
            recent_sign_in_seconds=int(env.get("RECENT_SIGN_IN_SECONDS", "300")),
            document_bytes=int(env.get("DOCUMENT_MAX_BYTES", "10000000")),
            documents_per_zone=int(env.get("DOCUMENTS_PER_ZONE", "20")),
            documents_bytes_per_account=int(env.get("DOCUMENTS_MAX_BYTES_PER_ACCOUNT", "200000000")),
            platform_invitations_per_day=int(env.get("PLATFORM_INVITATIONS_PER_DAY", "10")),
            platform_invitations_pending=int(env.get("PLATFORM_INVITATIONS_PENDING", "50")),
        )

    def body_bytes(self, path: str) -> int:
        """The largest request body a route takes: a document, an import, or else one outline."""
        if path.startswith("/v1/saved-zones/") and path.endswith("/documents"):
            # The form around the file takes a little more than the file.
            return self.document_bytes + 64_000
        return self.import_bytes if path == "/v1/saved-zones/import" else self.geometry_bytes


@dataclass(frozen=True)
class Services:
    zones: ZoneStore
    public_data: PublicData
    accounts: AccountStore
    saved_zones: SavedZoneStore
    projects: ProjectStore
    activity: ActivityStore
    audit: AuditStore
    geometries: GeometryStore
    departments: Departments
    # None when sign-in is not configured: private routes then answer 503.
    verifier: TokenVerifier | None = None
    identity_admin: IdentityAdmin = field(default_factory=NoIdentityAdmin)
    mailer: Mailer = field(default_factory=NoMailer)
    # The emails' words: the code's own, until a store people edit replaces them.
    templates: Templates = field(default_factory=BuiltInTemplates)
    # Documents kept with saved zones: their records, and their files beside the outlines.
    documents: DocumentStore = field(default_factory=MemoryDocuments)
    document_files: DocumentFiles = field(default_factory=MemoryDocumentFiles)
    platform_invitations: PlatformInvitationStore = field(default_factory=MemoryPlatformInvitations)
    # Computes saved zones' series when their outline changes.
    zone_jobs: ZoneJobs = field(default_factory=NoZoneJobs)
    # The website's address, which emails link to.
    site_url: str = ""
    rate_limit: RateLimit = field(default_factory=lambda: RateLimit(per_minute=60))
    limits: Limits = field(default_factory=Limits)
    # Verified emails made admins when they sign in: the first admins, who name the rest.
    admin_emails: frozenset[str] = frozenset()
    # Whether people can sign in with a password, which is what a recovery link recovers.
    password_sign_in: bool = False

    @staticmethod
    def from_env() -> Services:
        """`ZONES_SOURCE` is required; sign-in needs `AUTH_ISSUER`, `AUTH_AUDIENCE` and `AUTH_JWKS_URL`.

        `VALUES_SOURCE` rebuilds the zones' series from BigQuery; without it they are served as stored.
        """
        env = os.environ
        verifier = None
        if issuer := env.get("AUTH_ISSUER"):
            verifier = OidcVerifier(issuer, env["AUTH_AUDIENCE"], PublishedKeys(env["AUTH_JWKS_URL"]))
        files = files_from(env["ZONES_SOURCE"])
        records = env.get("RECORDS_SOURCE", "memory://")
        outlines = env.get("GEOMETRIES_SOURCE", "memory://")
        if verifier and "memory://" in (records, outlines) and env.get("ALLOW_MEMORY_RECORDS") != "1":
            # Records in memory differ on every instance and vanish on restart: refuse to run that way.
            raise RuntimeError(
                "Sign-in needs RECORDS_SOURCE and GEOMETRIES_SOURCE, unless ALLOW_MEMORY_RECORDS=1 for a local run."
            )
        return Services(
            zones=ZoneStore(files, values_from(env.get("VALUES_SOURCE", "none"))),
            public_data=PublicData(files),
            accounts=accounts_from(records),
            saved_zones=saved_zones_from(records),
            projects=projects_from(records),
            activity=activity_from(records),
            audit=audit_from(records),
            geometries=geometries_from(outlines),
            documents=documents_from(records),
            platform_invitations=platform_invitations_from(records),
            document_files=document_files_from(outlines),
            departments=Departments(files),
            verifier=verifier,
            identity_admin=identity_admin_from(env.get("IDENTITY_ADMIN", "none")),
            mailer=mailer_from(env.get("MAILER", "none"), env.get("MAIL_API_KEY", ""), env.get("MAIL_FROM", "")),
            site_url=env.get("SITE_URL", ""),
            zone_jobs=zone_jobs_from(env.get("ZONE_JOB", "none")),
            rate_limit=RateLimit(per_minute=int(env.get("PRIVATE_REQUESTS_PER_MINUTE", "60"))),
            limits=Limits.from_env(),
            admin_emails=frozenset(e.strip().lower() for e in env.get("ADMIN_EMAILS", "").split(",") if e.strip()),
            password_sign_in=env.get("PASSWORD_SIGN_IN") == "1",
        )


def services_for_tests(
    zones: ZoneStore | None = None,
    verifier: TokenVerifier | None = None,
    files: Files | None = None,
    **overrides: object,
) -> Services:
    """Every store in memory; `files` holds the zone files and the police districts."""
    found = files or LocalFiles(Path("/nonexistent"))
    base = Services(
        zones=zones or ZoneStore(found),
        public_data=PublicData(found),
        accounts=MemoryAccounts(),
        saved_zones=MemorySavedZones(),
        projects=MemoryProjects(),
        activity=MemoryActivity(),
        audit=MemoryAudit(),
        geometries=MemoryGeometries(),
        departments=Departments(found),
        verifier=verifier,
    )
    return replace(base, **overrides)  # pyright: ignore[reportArgumentType]
