# AGENTS.md

IDEA-Agro is an open platform of environmental and productive indicators for Uruguay's agricultural land. This is its monorepo: TypeScript (pnpm workspace with Vite+) and Python (uv workspace).

## Read first

| File                                                               | What it covers                                                   |
| :----------------------------------------------------------------- | :--------------------------------------------------------------- |
| [.agents/context/workflow.md](.agents/context/workflow.md)         | The board, stories, branches, OpenSpec changes and pull requests |
| [.agents/context/conventions.md](.agents/context/conventions.md)   | How code and text are written                                    |
| [.agents/context/architecture.md](.agents/context/architecture.md) | The parts of the platform, the data flow and what exists today   |
| [.agents/context/domain.md](.agents/context/domain.md)             | Indicators, zones and glossary                                   |

Roles (architect, developer, code reviewer) live in `.agents/agents/`, and skills in `.agents/skills/`.

Before changing a part of the repository, read its README, such as [infrastructure/README.md](infrastructure/README.md): it says how that part is laid out and worked on.

## Commands

`make setup` installs everything, and `make check` is the gate before every pull request. The folders are in the [README layout](README.md#layout) and every command in [README commands](README.md#commands).

## Rules

- Everything in the repository is in English.
- Never commit secret values.
- Comments are short and never tell history.
- Every change belongs to a story and reaches `main` through one pull request per story.
- Run `make check` before opening a pull request.
