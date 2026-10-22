## Why

Every Python service and job needs one environment and shared lint, format, type and test settings, so they are checked the same way.

## What Changes

- Turn the root `pyproject.toml` into a virtual uv workspace over `services/*`, with a single `uv.lock`.
- Add a `dev` dependency group with Ruff, pyright and pytest.
- Add the shared Ruff, pyright and pytest settings at the root.

## Impact

- Affected specs: none.
- Affected code: repository root.
- Story: #25.
