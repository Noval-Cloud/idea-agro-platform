# Data jobs

Python on a Cloud Run job, `data`. The jobs keep every zone's values in BigQuery and publish the files the API serves from its bucket (their layout is in the [API's README](../api/README.md#data)).

## Values

`idea-agro-jobs values` adds to BigQuery the periods it is missing, then publishes from BigQuery the files that change.

- **Tables:** the dataset `zone_values` holds one row per zone, indicator and period:

  | Table        | Period      | Indicators                                         |
  | :----------- | :---------- | :------------------------------------------------- |
  | `composites` | `start`     | The seasonal ones (ppna, apar, et), per composite  |
  | `years`      | `year`      | Those with a value per year                        |
  | `summaries`  | `statistic` | Those measured once: mean, p25 and p75, or classes |

  The job is their only writer. A run loads the new rows and merges them, so running it again replaces rows instead of repeating them.

- **Source:** the values come from a `Source` (`sources.py`). `--source public-files` reads the values the public files hold today, which come from the prototype.
- **Published:** each division's `values/<division>/<indicator>.json` whose rows changed, and the catalog's seasonal calendars. A composite reaches the catalog only once every division has it, so a zone page never asks for a composite its zone lacks.

## Running it

```bash
make jobs-deploy ENV=dev                                  # build the image from git and update the job
make jobs-run ENV=dev ARGS="values --source public-files" # one run, waiting for it to end
```

Locally, the job reads and writes a folder instead of the bucket, while still writing BigQuery:

```bash
PUBLIC_DATA=.cache/public-data VALUES_STORE=bigquery://<project>/zone_values uv run idea-agro-jobs values
```

The job, its tables and its permissions are in Terraform (`infrastructure/terraform/modules/services/jobs`); the dataset is in the `platform` module, since the API reads it too.
