## ADDED Requirements

### Requirement: The data job keeps ET in a public collection

The data job SHALL keep ET's 8-day composites in the ImageCollection `projects/pastizalesrou/assets/idea-agro/et`, one image per composite, from the first composite of `et/et-8` (2001-01-01) on. Each image SHALL be named after its start (`YYYY_MM_DD`) and hold `system:time_start`, `system:time_end`, the band `et`, and the properties `period` (`8-day`) and `unit` (`mm/day`). The job SHALL write no other asset, and anyone SHALL be able to read each image as soon as it exists.

#### Scenario: A composite is added

- **WHEN** a run adds the composite that starts on 2024-01-09
- **THEN** the collection holds the image `2024_01_09`, starting on that day, with its band `et`, `period` and `unit`
- **AND** anyone can read it, with no manual step

#### Scenario: The current asset stays as it is

- **WHEN** a run adds composites
- **THEN** `et/et-8` and every asset outside the collection are left unchanged

### Requirement: Each composite reproduces the current asset

Each image SHALL be computed as the owner's script computes `et/et-8`: MOD16A2's `ET` (`MODIS/061/MOD16A2`) times 0.1, with each gap filled linearly from the composites of its calendar year up to 72 days away, clipped to Uruguay's outline (`users/fgallego/Contorno_Uy`) and divided by 8, and exported over that outline at 231.656 m in MODIS's sinusoidal projection.

#### Scenario: A past composite matches

- **WHEN** a composite of a past year is compared with the same composite in `et/et-8`
- **THEN** their values agree within 0.01 mm/day

### Requirement: Composites are never rewritten

A composite added before the later composites of its year exist SHALL have its gaps filled from the earlier ones only, and SHALL NOT be rewritten when they arrive.

#### Scenario: A later composite arrives

- **WHEN** a run adds a composite of the current year
- **THEN** the composites of that year already in the collection stay as they are

### Requirement: Each run adds only what is missing

A run of the `collections` task SHALL export, one Earth Engine export task per image, each composite MODIS has published that the collection lacks and no export is writing yet. It SHALL keep at most 4 exports running, start none after 3 hours, and wait for its exports up to an hour more, leaving the rest to the next run. With `--since` and `--until`, it SHALL consider only the composites that start within those days. The daily run SHALL include this task.

#### Scenario: Nothing new

- **WHEN** every published composite is in the collection
- **THEN** the run starts no export and ends in seconds

#### Scenario: A new composite

- **WHEN** MODIS published a composite since the last run
- **THEN** the run exports it, waits for it, and logs that it was added

#### Scenario: Running it again

- **WHEN** a run is repeated, or starts while another run's exports are still running
- **THEN** it starts no export for a composite the collection holds or an export is writing

#### Scenario: Exports outlast the run

- **WHEN** exports are still running an hour after the last one could start
- **THEN** the run logs them and ends, and the next run starts no export for them while they run

#### Scenario: One year

- **WHEN** a run is given `--since 2024-01-01 --until 2024-12-31`
- **THEN** it adds only the missing composites that start in 2024

### Requirement: The job checks the collection before writing

Before it adds anything, a run SHALL check that the collection exists as an ImageCollection, that anyone can read it, and that the job can write it. Otherwise it SHALL fail with a message that says which, and add nothing.

#### Scenario: The collection is not public

- **WHEN** the collection is not readable by anyone
- **THEN** the run fails saying the collection must be readable by anyone, and starts no export

#### Scenario: The job cannot write it

- **WHEN** the job's account is not a writer of the collection
- **THEN** the run fails saying the collection must be shared with the job as a writer, and starts no export

### Requirement: Runs are recorded and failures alert

A run SHALL log each composite it added, with the Earth Engine compute its export used, and a summary of what it added and left. A failed export SHALL be logged as an error, which emails the admins; after 3 failed exports the run SHALL start no more.

#### Scenario: An export fails

- **WHEN** an export task fails
- **THEN** the run logs an error naming the composite and Earth Engine's reason
- **AND** the composite stays missing, so the next run exports it again

### Requirement: The job compares an indicator's current asset with its collection

On request, the `compare` task SHALL compare an indicator's multiband asset, with a band `b<year>-<day>` per composite, with its collection, over an optional date range, and SHALL write a new Markdown report under `jobs/comparisons/<indicator>/` in the public files' bucket. Other assets MAY be given in place of the indicator's own. It SHALL work for every indicator the job keeps a collection of.

#### Scenario: A year is compared

- **WHEN** someone runs `compare --since 2024-01-01 --until 2024-12-31`
- **THEN** a new report under `jobs/comparisons/et/` gives the statistics for each composite of 2024
- **AND** the run logs where the report is and its summary

### Requirement: The comparison report gives each composite's differences

For each composite, the report SHALL say whether it is only in one of the two. Otherwise it SHALL give, for the zone means of the seccionales and for a fixed sample of 5000 pixels: how many were compared, how many have a value in only one, the mean and maximum absolute difference, and the share within the indicator's tolerance.

#### Scenario: Differences per composite

- **WHEN** a composite is in both and some pixels differ by more than the tolerance
- **THEN** its row gives the share of pixels within the tolerance, below 100%, and the largest difference

#### Scenario: A composite only in one of them

- **WHEN** a composite of the range is in the current asset but not in the collection, or the other way round
- **THEN** the report lists it as only in that one
