"""The shapes of the API's responses, as published in its OpenAPI document."""

from datetime import date, datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field

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
