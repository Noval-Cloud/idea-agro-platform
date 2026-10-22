## Why

The session's coding agent must be able to act as the team leader for a story, running the same flow the factory will run, so a person working with an agent gets the same process and quality.

## What Changes

- Add `.agents/skills/take-story/SKILL.md`. It reads the story and its labels, creates the branches, runs the matching flow with the architect, developer and code reviewer roles, and moves the story on the board.
- Add `.agents/skills/take-story/scripts/board.py`. It reads and moves a story's Status, Phase and Iteration on the project board, finding the field and option ids by name.
- Link `.claude/skills` to `../.agents/skills`.

## Impact

- Affected specs: none.
- Affected code: `.agents/skills/`, `.claude/`.
- Story: #30.
