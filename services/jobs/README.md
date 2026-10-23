# Data jobs

Python on a Cloud Run job, `data`. The jobs keep every zone's values in BigQuery and publish the files the API serves from its bucket (their layout is in the [API's README](../api/README.md#data)).

`idea-agro-jobs <task>...` runs its tasks in order; the job's own arguments are `outlines values maps`.

## Values

`idea-agro-jobs values` adds to BigQuery the periods it is missing, then publishes from BigQuery the files that change.

- **Tables:** the dataset `zone_values` holds one row per zone, indicator and period:

  | Table        | Period      | Indicators                                         |
  | :----------- | :---------- | :------------------------------------------------- |
  | `composites` | `start`     | The seasonal ones (ppna, apar, et), per composite  |
  | `years`      | `year`      | Those with a value per year                        |
  | `summaries`  | `statistic` | Those measured once: mean, p25 and p75, or classes |

  The job is their only writer. A run loads the new rows and merges them, so running it again replaces rows instead of repeating them.

- **Source:** the values come from a `Source` (`sources.py`): Earth Engine by default, or `--source public-files` for the values the public files hold, which come from the prototype.
- **Published:** each division's `values/<division>/<indicator>.json` whose rows changed, and the catalog's seasonal calendars. A composite reaches the catalog only once every division has it, so a zone page never asks for a composite its zone lacks.

## Outlines

`idea-agro-jobs outlines` publishes, from the division and parcel assets, each division's simplified zones (`divisions/<division>.geojson`), each zone's file, the map's search index, the parcels of each department and their index, and the catalog's divisions, parcels and country outline.

- **Only on change:** it keeps each asset's last update time in `jobs/outlines.json` and does nothing until one changes; `--force` publishes anyway.
- **Shape:** the files keep the shape `scripts/seed_public_data.py` gave the prototype's (`outlines.py` ports its cleanup of names and outlines).
- **Values:** a zone whose outline changed keeps its values. To recompute a division, delete its rows from the three tables and run `values`.

## Maps

`idea-agro-jobs maps` draws each indicator's map of every year it does not have yet (or its only map), and the layer picker's thumbnails of the latest.

- **Images:** grayscale over the catalog's frame (Web Mercator, 1600 pixels wide, and 800 for the light copy), transparent where there is no value; the website colors them. Continuous maps are compressed WebP; classes and the no-data mask stay lossless.
- **Range:** a continuous map's gray spans the 2nd percentile of its lowest year to the 98th of its highest, kept fixed once in the catalog, so a time-lapse shows change rather than rescaled images.
- **Thumbnails:** colored with the website's palettes (`apps/web/src/design/generated/map-theme.json`, copied into the image).
- **Catalog:** the frame, and each indicator's kind, years, range and classes.

## Earth Engine

`earth.py` computes what the prototype computed (`apps/web/scripts/prototype-data/extract.mjs`). It reads the assets as they are, selecting only the bands it needs:

| Indicator     | Asset (under `projects/pastizalesrou/assets/` unless the path is complete)               | Bands                                     |
| :------------ | :--------------------------------------------------------------------------------------- | :---------------------------------------- |
| ppna, apar    | `ppna/ppna-16`, `apar/apar-16`                                                           | `b<year>-<day>`, one per 16-day composite |
| et            | `et/et-8`                                                                                | `b<year>-<day>`, one per 8-day composite  |
| rh            | `rh/rh_PromedioAnual`                                                                    | `b<year>`                                 |
| iose          | `iose/iose_Historica`                                                                    | `b<year>`                                 |
| cob           | `projects/MapBiomas_Pampa/public/collection2/mapbiomas_pampa_collection2_integration_v1` | `classification_<year>`, class 12         |
| compn         | `users/bagnato/PronosticoForrajero/ComunidadesDePastizal/ComunidadesPastizal`            | one map of classes 1 to 5                 |
| divtfe        | `EFT/TFE_17-19`                                                                          | one map of functional types               |
| csue, ahppn   | `Soil/RUSLE_agricola_17-19`, `AHPPN/AHPPN_17-19_sin0`                                    | one map                                   |
| The divisions | `Seccionales_Policiales` (id `CODIGOSECC`), `cuencas/Cuencas_G1` to `G5` (`codcuenca`)   | outlines                                  |
| The parcels   | `padrones/padrones_ajustado` (`PADRON`, `area_ha`, `NOMDEPTO`)                           | outlines                                  |
| The country   | `general/limite_oficial_rou_km2`                                                         | the outline the maps are clipped to       |

- **Periods:** a composite is the band's start date. A productive year runs from mid July to mid July and counts once it has every composite; for the others, a year is a band.
- **Values:** a zone's value is the mean of its pixels: at 1 km for composites, at 500 m for years (1 km for rh) and summaries (250 m for the communities' classes).
- **Access:** the job's account (`data-jobs@<project>`) computes in the project, which must be registered for Earth Engine (noncommercial), and needs read access to the assets above. Until then a run stops at Earth Engine's error and changes nothing.

## Schedule

Cloud Scheduler runs the job every day at 6:00 (Montevideo) with its own arguments. A run with nothing new ends in a minute or two.

## Running it

```bash
make jobs-deploy ENV=dev                                  # build the image from git and update the job
make jobs-run ENV=dev                                     # one run, as the schedule does, waiting for it to end
make jobs-run ENV=dev ARGS="values --source public-files" # one run from the public files
```

Locally, the job reads and writes a folder instead of the bucket, while still writing BigQuery. That is how a first run from Earth Engine is checked: into a copy of the published files, compared with them before the job writes the bucket.

```bash
cp -R .cache/public-data .cache/earth-engine
PUBLIC_DATA=.cache/earth-engine EARTH_ENGINE_PROJECT=<project> uv run idea-agro-jobs outlines --force
diff <(jq -S . .cache/public-data/zone-index.json) <(jq -S . .cache/earth-engine/zone-index.json)
```

The job, its tables and its permissions are in Terraform (`infrastructure/terraform/modules/services/jobs`); the dataset is in the `platform` module, since the API reads it too.
