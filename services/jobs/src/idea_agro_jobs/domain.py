"""The divisions, indicators and value tables the jobs work with."""

from datetime import date
from enum import StrEnum


class Division(StrEnum):
    """A predefined division of Uruguay into zones."""

    SECCIONALES = "seccionales"
    CUENCAS_1 = "cuencas-1"
    CUENCAS_2 = "cuencas-2"
    CUENCAS_3 = "cuencas-3"
    CUENCAS_4 = "cuencas-4"
    CUENCAS_5 = "cuencas-5"


class Indicator(StrEnum):
    APAR = "apar"
    COB = "cob"
    PPNA = "ppna"
    COMPN = "compn"
    RH = "rh"
    ET = "et"
    IOSE = "iose"
    DIVTFE = "divtfe"
    CSUE = "csue"
    AHPPN = "ahppn"


# Indicators with a value per composite, per year, or a summary of one map.
SEASONAL = (Indicator.PPNA, Indicator.APAR, Indicator.ET, Indicator.RH)
YEARLY = (Indicator.PPNA, Indicator.APAR, Indicator.ET, Indicator.RH, Indicator.IOSE, Indicator.COB)
SUMMARIZED = (Indicator.COMPN, Indicator.DIVTFE, Indicator.CSUE, Indicator.AHPPN)


class Table(StrEnum):
    """A BigQuery table of values, one row per zone, indicator and period."""

    COMPOSITES = "composites"
    YEARS = "years"
    SUMMARIES = "summaries"


# A composite's start date, a year, or a summary's statistic (mean, p25, p75, or a class of a categorical map).
type Period = date | int | str
type ZoneValues = dict[str, dict[Period, float | None]]
