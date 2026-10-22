## Why

The roles that take part in a story must be defined once, so a person's coding agent (as subagents) and the future agent factory work the same way and produce the same quality.

## What Changes

- Add `.agents/agents/architect.md`, `developer.md` and `code-reviewer.md` in the Claude Code subagent format. Each body is self-contained, so a deployed agent can load it as its instructions.
- Each role states its responsibilities, its steps in the flows, what it receives and what it returns, and what it never does.
- Link `.claude/agents` to `../.agents/agents`.
- The developer opens the pull request into `main`, and the code reviewer reviews that pull request, so the review is recorded on GitHub in both modes. `workflow.md` is updated to match.

## Impact

- Affected specs: none.
- Affected code: `.agents/agents/`, `.claude/`, `.agents/context/workflow.md`.
- Story: #29.
