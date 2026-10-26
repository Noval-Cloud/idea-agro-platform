"""Runs the data jobs' tasks, in the order given: `idea-agro-jobs outlines values maps`.

`PUBLIC_DATA` is where the API's public files are (`gs://<bucket>` or a folder), `VALUES_STORE` the BigQuery
dataset of the zones' values (`bigquery://<project>/<dataset>`), `EARTH_ENGINE_PROJECT` the Cloud project
registered for Earth Engine, and `MAP_THEME` the website's map palettes.
"""

import argparse
import json
import logging
import os
from pathlib import Path

from idea_agro_jobs import maps, outlines, values
from idea_agro_jobs.earth import EarthEngine
from idea_agro_jobs.files import files_from
from idea_agro_jobs.sources import PublicFiles, Source
from idea_agro_jobs.store import store_from

TASKS = {
    "outlines": "publish the zones, the search index and the parcels when an Earth Engine asset changed",
    "values": "add the periods BigQuery is missing and publish the values",
    "maps": "draw the maps of new years, and the thumbnails of the latest",
}
MAP_THEME = "apps/web/src/design/generated/map-theme.json"


class CloudFormatter(logging.Formatter):
    """One JSON object per line, which Cloud Logging reads with its severity."""

    def format(self, record: logging.LogRecord) -> str:
        message = f"{record.name}: {record.getMessage()}"
        if record.exc_info:
            message += "\n" + self.formatException(record.exc_info)
        return json.dumps({"severity": record.levelname, "message": message}, ensure_ascii=False)


def main() -> None:
    parser = argparse.ArgumentParser(prog="idea-agro-jobs", description=__doc__)
    parser.add_argument("tasks", nargs="+", choices=list(TASKS), help="; ".join(f"{t}: {h}" for t, h in TASKS.items()))
    parser.add_argument(
        "--source",
        choices=["earth-engine", "public-files"],
        default="earth-engine",
        help="where the values come from: Earth Engine, or the values the public files hold",
    )
    parser.add_argument("--force", action="store_true", help="publish the outlines even if no asset changed")
    arguments = parser.parse_args()

    handler = logging.StreamHandler()
    # Cloud Run sets CLOUD_RUN_JOB; a local run keeps plain lines.
    cloud = "CLOUD_RUN_JOB" in os.environ
    handler.setFormatter(CloudFormatter() if cloud else logging.Formatter("%(levelname)s %(name)s: %(message)s"))
    logging.basicConfig(level=logging.INFO, handlers=[handler])
    files = files_from(os.environ["PUBLIC_DATA"])
    earth: EarthEngine | None = None

    def earth_engine() -> EarthEngine:
        nonlocal earth
        earth = earth or EarthEngine(os.environ["EARTH_ENGINE_PROJECT"])
        return earth

    for task in arguments.tasks:
        if task == "outlines":
            outlines.refresh(earth_engine(), files, force=arguments.force)
        elif task == "values":
            source: Source = earth_engine() if arguments.source == "earth-engine" else PublicFiles(files)
            values.refresh(source, store_from(os.environ["VALUES_STORE"]), files)
        elif task == "maps":
            maps.refresh(earth_engine(), files, maps.themes_from(Path(os.environ.get("MAP_THEME", MAP_THEME))))


if __name__ == "__main__":
    main()
