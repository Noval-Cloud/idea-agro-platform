import json
import logging

from idea_agro_jobs.__main__ import CloudFormatter


def test_cloud_logs_carry_their_severity() -> None:
    record = logging.LogRecord("idea_agro_jobs.values", logging.ERROR, "", 0, "ppna: %s", ("stale",), None)

    assert json.loads(CloudFormatter().format(record)) == {
        "severity": "ERROR",
        "message": "idea_agro_jobs.values: ppna: stale",
    }
