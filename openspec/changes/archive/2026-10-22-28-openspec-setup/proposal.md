## Why

Every story is an OpenSpec change, and the living specs hold the platform's agreed behavior. The tool has to be installed and checked like any other.

## What Changes

- Add `@fission-ai/openspec` 1.14.1 as a root dev dependency, run as `pnpm openspec`.
- Initialize `openspec/` with the project's context in `config.yaml`, without tool-specific files.
- Add `make specs` (`openspec validate`) and include it in `make check`.

## Impact

- Affected specs: none.
- Affected code: repository root, `openspec/`, `Makefile`.
- Story: #28.
