"""The shapes of the API's responses, as published in its OpenAPI document."""

from datetime import date, datetime
from enum import StrEnum
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, StringConstraints

from idea_agro_api.activity import Action
from idea_agro_api.audit import AuditAction
from idea_agro_api.projects import MemberRole
from idea_agro_api.zones import Department, Division


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


# Spaces around a name are dropped before its length is checked.
ZoneName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]


class SavedZoneIn(BaseModel):
    """A zone to save to your library."""

    name: ZoneName = Field(description="A name for the zone.", examples=["Potrero 3"])
    source: Literal["drawn", "uploaded"] = Field(description="Whether it was drawn on the map or uploaded in a file.")
    geometry: Geometry


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
    area_ha: float = Field(description="Its area, in hectares, measured on the WGS 84 ellipsoid.")
    bbox: list[float] = Field(min_length=4, max_length=4, description="West, south, east and north, in degrees.")
    department: str | None = Field(description="The department its interior falls in, or null outside every one.")
    created_at: datetime
    updated_at: datetime


class SavedZoneFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    id: str
    properties: SavedZoneOut
    geometry: Geometry


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


class MemberOut(BaseModel):
    email: str
    name: str | None = Field(description="Their name, once they joined.")
    role: MemberRole
    pending: bool = Field(description="Invited, and not yet joined: they join when they open their projects.")
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
    geometry: Geometry


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
    detail: str = Field(description="The roles given, for a role change.")
