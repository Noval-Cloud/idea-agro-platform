"""Runs a data job: `idea-agro-jobs values --source public-files`.

`PUBLIC_DATA` is where the API's public files are (`gs://<bucket>` or a folder), and `VALUES_STORE` the BigQuery
dataset of the zones' values (`bigquery://<project>/<dataset>`).
"""

import argparse
import logging
import os

from idea_agro_jobs import values
from idea_agro_jobs.files import files_from
from idea_agro_jobs.sources import PublicFiles
from idea_agro_jobs.store import store_from


def main() -> None:
    parser = argparse.ArgumentParser(prog="idea-agro-jobs", description=__doc__)
    tasks = parser.add_subparsers(dest="task", required=True)
    values_task = tasks.add_parser("values", help="Add the missing periods to BigQuery and publish the values")
    values_task.add_argument("--source", choices=["public-files"], default="public-files")
    arguments = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    files = files_from(os.environ["PUBLIC_DATA"])
    store = store_from(os.environ["VALUES_STORE"])
    if arguments.task == "values":
        values.refresh(PublicFiles(files), store, files)


if __name__ == "__main__":
    main()
