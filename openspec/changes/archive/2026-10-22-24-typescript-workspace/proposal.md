## Why

Every TypeScript app and package needs one shared toolchain, so a single command checks and tests all of them.

## What Changes

- Add `pnpm-workspace.yaml` with `apps/*` and `packages/*`, and the Vite+ catalog and overrides.
- Add `vite-plus` as a root dev dependency, with the root scripts `check` (`vp check`) and `test` (`vp test`).
- Add the root `vite.config.ts` with the formatting and lint settings shared by the workspace.

## Impact

- Affected specs: none.
- Affected code: repository root.
- Story: #24.
