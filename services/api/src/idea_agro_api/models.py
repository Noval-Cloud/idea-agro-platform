"""The shapes of the API's responses, as published in its OpenAPI document."""

from datetime import date, datetime
from enum import StrEnum
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, StringConstraints

from idea_agro_api.zones import Division


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
