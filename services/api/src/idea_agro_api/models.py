"""The shapes of the API's responses, as published in its OpenAPI document."""

from datetime import date, datetime
from enum import StrEnum
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, RootModel, StringConstraints

from idea_agro_api.activity import Action
from idea_agro_api.audit import AuditAction
from idea_agro_api.projects import MemberRole
from idea_agro_api.public_data import Indicator
from idea_agro_api.zones import Department, Division, SeasonalIndicator


class Health(BaseModel):
    status: str = Field(description="`ok` when the service answers.", examples=["ok"])


class SeasonalSeries(BaseModel):
    """One indicator's seasonal series in a zone: the zone's mean for each composite of the satellite record."""

    unit: str = Field(description="Unit of every value.", examples=["kg DM/ha per 16 days"])
    cadence_days: int = Field(description="Days between the start of two consecutive composites.", examples=[16])
    dates: list[date] = Field(description="First day of each composite, oldest first.")
    values: list[float | None] = Field(
        description="The zone's mean for each date, in the same order as `dates`; null where there is no data."
    )


class ZoneSeasonal(BaseModel):
    """The seasonal series of a zone. An indicator without data in the zone is left out."""

    division: Division = Field(description="The division the zone belongs to.")
    zone: str = Field(description="The zone's id within its division.", examples=["1806"])
    ppna: SeasonalSeries | None = Field(
        default=None, description="Aboveground net primary productivity: forage production, in 16-day totals."
    )
    apar: SeasonalSeries | None = Field(
        default=None, description="Absorbed photosynthetically active radiation, in 16-day totals."
    )
    et: SeasonalSeries | None = Field(default=None, description="Evapotranspiration, as a daily rate every 8 days.")


class Problem(BaseModel):
    """An error, as Problem Details (RFC 9457)."""

    type: str = Field(default="about:blank", description="A URI that identifies the kind of problem.")
    title: str = Field(description="A short summary of the kind of problem.", examples=["Not Found"])
    status: int = Field(description="The HTTP status code.", examples=[404])
    detail: str | None = Field(default=None, description="What went wrong in this request.")
    instance: str | None = Field(default=None, description="The path of the request that failed.")
    errors: list[dict[str, Any]] | None = Field(
        default=None, description="For invalid requests, each parameter that failed validation and why."
    )


class AccountRole(StrEnum):
    """`client` is every account; `editor` manages content and `admin` manages accounts. They combine."""

    CLIENT = "client"
    EDITOR = "editor"
    ADMIN = "admin"


class Me(BaseModel):
    """Your account."""

    id: str = Field(description="The account's id in IDEA-Agro.")
    email: str | None = Field(description="The email your sign-in provider reports.")
    name: str | None = Field(description="Your name, as your sign-in provider reports it.")
    picture: str | None = Field(description="URL of your picture, as your sign-in provider reports it.")
    roles: list[AccountRole] = Field(description="Your roles: always `client`, plus `editor` or `admin` if given.")
    created_at: datetime = Field(description="When the account was created, on its first sign-in.")


Position = Annotated[list[float], Field(min_length=2, max_length=3, description="Longitude and latitude, in degrees.")]
Ring = Annotated[list[Position], Field(min_length=4, description="A closed ring: its first and last positions match.")]


class Polygon(BaseModel):
    type: Literal["Polygon"]
    coordinates: list[Ring] = Field(min_length=1, description="The outer ring, then any holes.")


class MultiPolygon(BaseModel):
    type: Literal["MultiPolygon"]
    coordinates: list[Annotated[list[Ring], Field(min_length=1)]] = Field(min_length=1)


Geometry = Annotated[Polygon | MultiPolygon, Field(discriminator="type", description="A GeoJSON geometry, in WGS 84.")]


class Point(BaseModel):
    type: Literal["Point"]
    coordinates: Position


ZoneGeometry = Annotated[
    Polygon | MultiPolygon | Point,
    Field(discriminator="type", description="A zone's outline in WGS 84: a polygon, or a point for a site."),
]


# Spaces around a name are dropped before its length is checked.
ZoneName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]


class SavedZoneIn(BaseModel):
    """A zone to save to your library."""

    name: ZoneName = Field(description="A name for the zone.", examples=["Potrero 3"])
    source: Literal["drawn", "uploaded"] = Field(description="Whether it was drawn on the map or uploaded in a file.")
    geometry: ZoneGeometry


class SavedZonesImport(BaseModel):
    """Several zones to save at once, such as the polygons of an uploaded file."""

    zones: list[SavedZoneIn] = Field(min_length=1, description="The zones, at most as many as the import limit.")


class SavedZoneRename(BaseModel):
    name: ZoneName = Field(description="The zone's new name.")


class SavedZoneOut(BaseModel):
    """A zone of your library. Its outline is at `/v1/saved-zones/{id}/geometry`."""

    id: str = Field(description="The zone's id.")
    name: str = Field(description="The zone's name.")
    source: Literal["drawn", "uploaded"] = Field(description="Whether it was drawn on the map or uploaded.")
    version: int = Field(description="The version of its outline: it grows each time the outline changes.")
    area_ha: float = Field(description="Its area, in hectares, measured on the WGS 84 ellipsoid; 0 for a point.")
    bbox: list[float] = Field(min_length=4, max_length=4, description="West, south, east and north, in degrees.")
    department: str | None = Field(
        description="The department its interior (or the point) falls in, or null outside every one."
    )
    created_at: datetime
    updated_at: datetime


class SavedZoneFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    id: str
    properties: SavedZoneOut
    geometry: ZoneGeometry


class SavedZoneFeatures(BaseModel):
    """Your whole library as GeoJSON, to draw it on a map."""

    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[SavedZoneFeature]


ProjectName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
ProjectDescription = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]


class ProjectIn(BaseModel):
    """A new project."""

    name: ProjectName = Field(description="The project's name.", examples=["Campo Las Rosas"])
    description: ProjectDescription = Field(default="", description="What the project is about.")


class ProjectChange(BaseModel):
    """The fields to change; those left out keep their value."""

    name: ProjectName | None = Field(default=None, description="The project's new name.")
    description: ProjectDescription | None = Field(default=None, description="The project's new description.")


class SavedItemIn(BaseModel):
    """A zone of your library."""

    kind: Literal["saved"]
    zone_id: UUID = Field(description="The saved zone's id.")


class DivisionItemIn(BaseModel):
    """A zone of a predefined division."""

    kind: Literal["division"]
    division: Division
    zone_id: str = Field(pattern=r"^[0-9A-Za-z-]{1,40}$", description="The zone's id in its division.")


class PadronItemIn(BaseModel):
    """A cadastral parcel (padrón) of a department."""

    kind: Literal["padron"]
    department: Department
    padron: int = Field(ge=0, le=99_999_999, description="The parcel's number in its department.")


ProjectItemIn = Annotated[SavedItemIn | DivisionItemIn | PadronItemIn, Field(discriminator="kind")]

ITEM_ID = "The item's id in the project, used to remove it."


class SavedItem(SavedItemIn):
    id: str = Field(description=ITEM_ID)
    zone: SavedZoneOut | None = Field(description="The saved zone, or null if it was deleted meanwhile.")


class DivisionItem(DivisionItemIn):
    id: str = Field(description=ITEM_ID)


class PadronItem(PadronItemIn):
    id: str = Field(description=ITEM_ID)


ProjectItem = Annotated[SavedItem | DivisionItem | PadronItem, Field(discriminator="kind")]


ProjectRole = Literal["owner", "collaborator", "viewer"]
ROLE = "Your role in the project: `owner`, `collaborator` (edits its zones) or `viewer` (only reads)."
OTHERS_CAN_EDIT = "Whether someone else can change the outline of the zones you add: worth a warning."


class ProjectSummary(BaseModel):
    """One of your projects, or one shared with you, without its zones."""

    id: str = Field(description="The project's id.")
    name: str
    description: str
    zone_count: int = Field(description="How many zones the project holds.")
    member_count: int = Field(description="How many people it is shared with, invitations included.")
    role: ProjectRole = Field(description=ROLE)
    owner_name: str | None = Field(description="The owner's name.")
    others_can_edit: bool = Field(description=OTHERS_CAN_EDIT)
    created_at: datetime
    updated_at: datetime


class MemberIn(BaseModel):
    """Someone to share the project with, or a member's new role."""

    email: str = Field(
        max_length=254,
        # No characters that would change the meaning of a path, where emails go to remove a member.
        pattern=r"^[^@\s/?#%]+@[^@\s/?#%]+\.[^@\s/?#%]+$",
        description="Their email, as they sign in with it.",
    )
    role: MemberRole = Field(description="`collaborator` edits the project's zones; `viewer` only reads.")
    language: Literal["es", "en", "pt"] = Field(
        default="es", description="The language of the invitation email, the inviter's own."
    )


class MemberOut(BaseModel):
    email: str
    name: str | None = Field(description="Their name, once they joined.")
    role: MemberRole
    pending: bool = Field(description="Invited, and not yet joined: they join with the link their email carries.")
    invited_until: datetime | None = Field(
        default=None, description="While pending: when the invitation's link stops working."
    )
    you: bool = Field(description="Whether this member is you.")


class ProjectOut(BaseModel):
    """A project and its zones, in the order they were added."""

    id: str = Field(description="The project's id.")
    name: str
    description: str
    items: list[ProjectItem]
    role: ProjectRole = Field(description=ROLE)
    owner_name: str | None = Field(description="The owner's name.")
    members: list[MemberOut] = Field(description="Everyone the owner shared the project with.")
    others_can_edit: bool = Field(description=OTHERS_CAN_EDIT)
    created_at: datetime
    updated_at: datetime


class InvitationAgain(BaseModel):
    """How to send a pending invitation again."""

    language: Literal["es", "en", "pt"] = Field(default="es", description="The language of the email.")


class InvitationCode(BaseModel):
    """The project and the code an invitation's link carries."""

    project_id: UUID
    code: str = Field(min_length=16, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")


class InvitationOut(BaseModel):
    """What an invitation offers, for its page."""

    project_id: str
    project_name: str
    inviter_name: str | None = Field(description="The project's owner, who invited.")
    role: ProjectRole = Field(description="The role offered, or the caller's once they joined.")
    email: str = Field(description="The email it is for: only an account with that email accepts it.")
    invited_until: datetime | None
    state: Literal["pending", "expired", "joined"] = Field(
        description="`joined` when the caller is in the project already, as after accepting."
    )
    yours: bool = Field(description="Whether it is for the caller's verified email.")


class SharedOut(ProjectOut):
    """The project once shared, and whether the person invited was told by email."""

    invitation_sent: bool | None = Field(
        description="`true` when the invitation email left, `false` when it could not; `null` for a role change."
    )


class ActivityOut(BaseModel):
    """One change in a project."""

    at: datetime
    actor_name: str = Field(description="Who made the change, by their name at the time.")
    action: Action
    subject: str = Field(description="The item's id or the member's email the change was about, if any.")
    detail: str = Field(description="A zone's name or a role, when it helps to read the change.")


class OutlineChange(BaseModel):
    """A zone's new outline."""

    version: int = Field(ge=1, description="The version the change was made on: a newer one refuses it, with 409.")
    geometry: ZoneGeometry


class OutlineVersionOut(BaseModel):
    """One version of a zone's outline."""

    version: int
    created_at: datetime
    by_name: str = Field(description="Who made it, by their name at the time.")
    area_ha: float
    restored_from: int | None = Field(description="The version it brought back, when it was a restore.")
    current: bool


class AdminAccount(BaseModel):
    """An account, as admins see it."""

    id: str
    email: str | None
    name: str | None
    picture: str | None
    roles: list[AccountRole] = Field(description="Always `client`, plus `editor` or `admin` if given.")
    disabled: bool = Field(description="A disabled account cannot use any private route.")
    created_at: datetime


class RolesChange(BaseModel):
    """The roles an account has beyond `client`."""

    roles: list[Literal["editor", "admin"]] = Field(max_length=2, description="`editor`, `admin`, both or none.")


class AccessChange(BaseModel):
    disabled: bool = Field(description="True disables the account and ends its sessions; false enables it again.")


class AuditOut(BaseModel):
    """One admin action."""

    at: datetime
    actor_name: str = Field(description="The admin who acted, by their name at the time.")
    action: AuditAction
    target: str = Field(description="The account acted on.")
    target_email: str = Field(description="Its email at the time.")
    detail: str = Field(
        description="The roles given, for a role change; `provider_failed` when the sign-in provider did not take it."
    )


Bounds = Annotated[
    list[float], Field(min_length=4, max_length=4, description="West, south, east and north, in degrees.")
]


class IndicatorRange(BaseModel):
    """What an indicator holds."""

    kind: Literal["continuous", "binary", "categorical"] = Field(
        description="`continuous` values, `binary` (present or not) or `categorical` (classes)."
    )
    years: list[int] | None = Field(description="The years with a value, or null for an indicator measured once.")
    min: float | None = Field(default=None, description="The lowest value on the map, for its color scale.")
    max: float | None = Field(default=None, description="The highest value on the map, for its color scale.")
    classes: list[int] | None = Field(default=None, description="The classes of a categorical indicator.")


class PadronDepartment(BaseModel):
    name: str = Field(description="The department's name.")
    count: int = Field(description="How many rural parcels it has.")
    bbox: Bounds


class MapOutline(BaseModel):
    """The country's outline as an SVG path, in the pixels of the full map images."""

    width: float
    height: float
    d: str


class Catalog(BaseModel):
    """What data exists, and the frame of the map images."""

    bounds: Bounds = Field(description="The area the map images cover: west, south, east and north, in degrees.")
    size: list[int] = Field(min_length=2, max_length=2, description="Width and height of the full map images.")
    lite_size: list[int] = Field(min_length=2, max_length=2, description="Width and height of the light map images.")
    indicators: dict[Indicator, IndicatorRange]
    seasonal: dict[SeasonalIndicator, list[date]] = Field(
        description="The first day of each seasonal indicator's composites, in the order zone series list them."
    )
    divisions: dict[Division, int] = Field(description="How many zones each predefined division has.")
    padrones: dict[Department, PadronDepartment] = Field(description="The departments with rural parcels.")
    outline: MapOutline


class ZoneProperties(BaseModel):
    id: str = Field(description="The zone's id within its division.")
    name: str | None = Field(description="Its name, when it has one.")
    area_km2: float
    department: str | None = Field(default=None, description="The department of a police district.")
    section: int | None = Field(default=None, description="The number of a police district in its department.")
    parent: str | None = Field(default=None, description="The basin a grade 5 sub-basin belongs to.")


class ZoneFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    id: int | None = Field(default=None, description="A number for the map's feature state.")
    properties: ZoneProperties
    geometry: Geometry


class ZoneCollection(BaseModel):
    """A division's zones, with simplified outlines for the map."""

    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[ZoneFeature]


class ZoneDetail(BaseModel):
    """A zone with its full outline."""

    properties: ZoneProperties
    geometry: Geometry
    bbox: Bounds


class ValueSummary(BaseModel):
    mean: float | None
    p25: float | None
    p75: float | None


class DivisionValues(BaseModel):
    """Each zone's value of an indicator, by zone id.

    For an indicator with years, a list aligned with `years`; for one measured once, a summary; for a categorical
    one, each class's share.
    """

    years: list[int] | None
    values: dict[str, list[float | None] | ValueSummary | dict[str, float] | None]


class ZoneIndexEntry(BaseModel):
    """A zone, or a department to fly to, as the map's search lists them."""

    division: Division | Literal["department"]
    id: str
    label: str
    detail: str | None = None
    bbox: Bounds


class PadronIndex(RootModel[dict[Department, list[int]]]):
    """The parcel numbers of each department, sorted."""


class PadronProperties(BaseModel):
    padron: int = Field(description="The parcel's number in its department.")
    area_ha: float


class PadronFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    id: int | None = None
    properties: PadronProperties
    geometry: Geometry


class PadronCollection(BaseModel):
    """A department's rural parcels."""

    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[PadronFeature]
