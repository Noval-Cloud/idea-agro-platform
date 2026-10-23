"""Runs a data job: `idea-agro-jobs values`.

`PUBLIC_DATA` is where the API's public files are (`gs://<bucket>` or a folder), `VALUES_STORE` the BigQuery
dataset of the zones' values (`bigquery://<project>/<dataset>`), and `EARTH_ENGINE_PROJECT` the Cloud project
registered for Earth Engine.
"""

import argparse
import logging
import os

from idea_agro_jobs import values
from idea_agro_jobs.earth import EarthEngine
from idea_agro_jobs.files import files_from
from idea_agro_jobs.sources import PublicFiles, Source
from idea_agro_jobs.store import store_from


def main() -> None:
    parser = argparse.ArgumentParser(prog="idea-agro-jobs", description=__doc__)
    tasks = parser.add_subparsers(dest="task", required=True)
    values_task = tasks.add_parser("values", help="Add the missing periods to BigQuery and publish the values")
    values_task.add_argument(
        "--source",
        choices=["earth-engine", "public-files"],
        default="earth-engine",
        help="Compute the values in Earth Engine, or read those the public files hold",
    )
    arguments = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    files = files_from(os.environ["PUBLIC_DATA"])
    store = store_from(os.environ["VALUES_STORE"])
    if arguments.task == "values":
        source: Source
        if arguments.source == "earth-engine":
            source = EarthEngine(os.environ["EARTH_ENGINE_PROJECT"])
        else:
            source = PublicFiles(files)
        values.refresh(source, store, files)


if __name__ == "__main__":
    main()
