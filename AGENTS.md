# AGENTS.md

IDEA-Agro is an open platform of environmental and productive indicators for Uruguay's agricultural land. This is its monorepo: TypeScript (pnpm workspace with Vite+) and Python (uv workspace).

## Read first

| File                                                               | What it covers                                                   |
| :----------------------------------------------------------------- | :--------------------------------------------------------------- |
| [.agents/context/workflow.md](.agents/context/workflow.md)         | The board, stories, branches, OpenSpec changes and pull requests |
| [.agents/context/conventions.md](.agents/context/conventions.md)   | How code and text are written                                    |
| [.agents/context/architecture.md](.agents/context/architecture.md) | The parts of the platform and the data flow                      |
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

## Cost

Spend tokens and time where they buy quality, never at its expense.

- Settle the design with the person before a story is dispatched, and split a story that touches several parts or leaves choices open.
- Tests and `make check` are the default proof. Run the app only for what tests can't show, and once.
- Don't re-check what a tool already reported.
- The developer runs on a cheaper model for routine stories; the architect, the reviewer and hard stories keep the strongest one.
- One session per story.
