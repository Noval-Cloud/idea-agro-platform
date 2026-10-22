## Why

Contributors, agents and CI need the same tool versions to get the same results, without installing a version manager.

## What Changes

- Pin Node 24 (`.node-version`) and pnpm 12.14 (`packageManager` in the root `package.json`).
- Pin Python 3.14 (`.python-version`) and uv 0.12 (`required-version` in the root `pyproject.toml`).
- Add `.editorconfig` and `.gitattributes` for shared editor defaults and LF line endings.
- List the required tools in the README.

## Impact

- Affected specs: none.
- Affected code: repository root.
- Story: #23.
