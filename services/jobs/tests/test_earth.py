from datetime import date, timedelta

from idea_agro_jobs.earth import band_start, band_years, complete_years, productive_year, zone_id, zone_values


def bands(days: int, until: date) -> list[str]:
    """Every composite's band from 2001 on: one each `days` days, restarting on January 1st."""
    found: list[str] = []
    for year in range(2001, until.year + 1):
        for day in range(1, 366, days):
            if date(year, 1, 1) + timedelta(days=day - 1) <= until:
                found.append(f"b{year}-{day}")
    return found


def test_a_band_names_the_day_its_composite_starts() -> None:
    assert band_start("b2001-17") == date(2001, 1, 17)
    assert band_start("b2024-353") == date(2024, 12, 18)


def test_a_productive_year_runs_from_mid_july_to_mid_july() -> None:
    assert productive_year("b2001-177", 23) == 2000
    assert productive_year("b2001-193", 23) == 2001
    assert productive_year("b2002-177", 23) == 2001
    assert productive_year("b2002-185", 46) == 2002


def test_only_years_with_every_composite_count() -> None:
    sixteen = complete_years(bands(16, date(2026, 9, 14)), 23)
    eight = complete_years(bands(8, date(2026, 9, 22)), 46)

    # The record starts in January 2001, and 2026 runs until July 2027.
    assert list(sixteen) == list(range(2001, 2026))
    assert list(eight) == list(range(2001, 2026))
    assert sixteen[2025][0] == "b2025-193"
    assert sixteen[2025][-1] == "b2026-177"


def test_zone_ids_read_the_same_whether_numbers_or_text() -> None:
    assert zone_id(44510.0) == "44510"
    assert zone_id(44510) == "44510"
    assert zone_id("0101") == "0101"


def test_reduced_values_are_rounded_and_named_by_period() -> None:
    features = [
        {"properties": {"codcuenca": 44510.0, "b2026-257": 12.3456, "b2026-273": None}},
        {"properties": {"codcuenca": 44520.0, "b2026-257": 1.0}},
    ]
    outputs = {"b2026-257": date(2026, 9, 14), "b2026-273": date(2026, 9, 30)}

    assert zone_values(features, "codcuenca", outputs, 2) == {
        "44510": {date(2026, 9, 14): 12.35, date(2026, 9, 30): None},
        "44520": {date(2026, 9, 14): 1.0, date(2026, 9, 30): None},
    }


def test_years_come_only_from_bands_named_after_them() -> None:
    assert band_years(["b2021", "b2003", "b2003_count", "mean"], "b") == [2003, 2021]
    assert band_years(["classification_1985", "classification_2021"], "classification_") == [1985, 2021]
