## Why

The session's coding agent must be able to act as the team leader for a story, running the same flow the factory will run, so a person working with an agent gets the same process and quality.

## What Changes

- Add `.agents/skills/take-story/SKILL.md`. It reads the story and its labels, creates the branches, runs the matching flow with the architect, developer and code reviewer roles, and moves the story on the board.
- Add `scripts/board.py`, with its tests. It reads and moves a story's Status, Phase and Iteration on the project board, finding the field and option ids by name. It lives in `scripts/` (where logic goes) and not inside the skill, because pyright skips dot-folders and the script must be type-checked.
- Link `.claude/skills` to `../.agents/skills`.

## Impact

- Affected specs: none.
- Affected code: `.agents/skills/`, `.claude/`, `scripts/`, `pyproject.toml` (pyright and pytest settings).
- Story: #30.
