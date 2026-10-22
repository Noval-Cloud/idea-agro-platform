## Why

Checking the repository should take one command from the root, whatever the language of each part.

## What Changes

- Add a root `Makefile` whose targets only delegate to `vp`, `uv` and, once it exists, `terraform`.
- `make help` is the default target and lists every target from its `## ` comment.
- Document the commands, and the `ENV` and `YES=1` convention for the infrastructure targets to come.

## Impact

- Affected specs: none.
- Affected code: repository root.
- Story: #26.
