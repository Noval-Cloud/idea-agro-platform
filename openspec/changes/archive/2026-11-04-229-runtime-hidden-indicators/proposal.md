## Why

The site learns which indicators are hidden only when it is built. Between an editor's switch and the next build, the explorer still offers a hidden indicator and its map stays loading, because the API answers its data with the `indicator-temporarily-unavailable` problem.

## What Changes

- **Runtime marks:** the explorer and the zone page also treat as hidden every indicator that the catalog they load marks `unavailable`, in the same disabled state, with the same info button and dialog.
- **Unavailable answers:** a map or values request that the API answers with the `indicator-temporarily-unavailable` problem marks that indicator unavailable on the page, so the loading stops and the indicator shows as disabled.
- **Links:** a link that names an indicator hidden at runtime opens the default one.
