import json
import logging
import sys

from idea_agro_jobs.__main__ import CloudFormatter


def test_cloud_logs_carry_their_severity() -> None:
    record = logging.LogRecord("idea_agro_jobs.values", logging.ERROR, "", 0, "ppna: %s", ("stale",), None)

    assert json.loads(CloudFormatter().format(record)) == {
        "severity": "ERROR",
        "message": "idea_agro_jobs.values: ppna: stale",
    }


def test_a_cloud_log_keeps_its_exception_and_accents_on_one_line() -> None:
    try:
        raise ValueError("Paysandú")
    except ValueError:
        record = logging.LogRecord("idea_agro_jobs.earth", logging.ERROR, "", 0, "failed", None, sys.exc_info())

    line = CloudFormatter().format(record)

    assert "\n" not in line
    assert "Paysandú" in line
    assert json.loads(line)["message"].endswith("ValueError: Paysandú")
