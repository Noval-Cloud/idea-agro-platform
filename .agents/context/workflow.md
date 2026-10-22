# Workflow

How work goes from the project board to `main`. The same flow applies to a person working with their coding agent and to the agent factory planned for later: roles and skills are defined once, in [`.agents/agents/`](../agents) and [`.agents/skills/`](../skills).

## Board

The GitHub Project **IDEA-Agro** (organization Noval-Cloud) holds every work item.

| Field                | Values                                           |
| :------------------- | :----------------------------------------------- |
| Status               | Backlog → Ready → In progress → In review → Done |
| Phase                | Spec → Spec review → Dev → Review                |
| Stage                | `0 · Foundations` … `5 · Forecasts`, `Anytime`   |
| Iteration            | Two-week sprints                                 |
| Priority, Size, Area | Planning aids                                    |

## Work items

- **Hierarchy:** Epic → Feature → User Story, linked as sub-issues.
- **Features only group stories.** They are never assigned, and close when their stories finish.
- **Only stories are assigned:** to a person (assignee) or to an agent (label `agent:developer`, `agent:architect`).
- **Everything is decided before a story is written.** No story exists to "decide" or "discuss" something.
- **Tasks are not issues.** They live in the story's `tasks.md` (see "OpenSpec changes").

Story labels choose the flow:

| Label               | Meaning                                                    |
| :------------------ | :--------------------------------------------------------- |
| `needs-spec`        | The architect writes a spec before development             |
| `needs-spec-review` | The spec goes through a pull request that a person reviews |

## Team leader

The team leader is the only one that changes the board.

- **Local mode:** the person's coding agent acts as team leader for the session, through the `take-story` skill.
- **Factory (later):** a deployed team leader acts on board events, on agents' reports and on a periodic sweep.

It takes a story that is **Ready within the current iteration**, and moves it as the work advances:

| When                                     | Status      | Phase       |
| :--------------------------------------- | :---------- | :---------- |
| The story is taken, with `needs-spec`    | In progress | Spec        |
| The story is taken, without `needs-spec` | In progress | Dev         |
| A spec pull request is opened            | In progress | Spec review |
| The spec is in the story branch          | In progress | Dev         |
| The pull request into `main` is opened   | In review   | Review      |
| The pull request is merged               | Done        | —           |

## Branches

- Story branch: `<type>/<story>/<slug>`, with the Conventional Commits type, e.g. `chore/23/pin-tool-versions`.
- Spec branch: `<type>/<story>/specs`, created from the story branch.
- A branch is never named just `<type>/<story>`: git cannot hold it next to `<type>/<story>/specs`.
- When a story depends on another one that is not merged yet, its branch starts from that story's branch. Its pull request targets that branch, and is rebased onto `main` once the other merges.

## OpenSpec changes

Every story is an OpenSpec change, created with `pnpm openspec new change <story>-<slug>`, in `openspec/changes/<story>-<slug>/`:

- **`.openspec.yaml`:** created by the command. A change that does not alter the platform's behavior (tooling, infrastructure, docs) adds `skip_specs: true`.
- **`proposal.md`:** `## Why`, `## What Changes`, `## Impact` (affected specs, affected code, `Story: #<number>`).
- **Spec deltas** in `specs/<capability>/spec.md` (`## ADDED`, `## MODIFIED`, `## REMOVED` or `## RENAMED Requirements`, each requirement with at least one `#### Scenario:`), when the story changes behavior.
- **`tasks.md`:** numbered checkboxes, the last one archiving the change.

```markdown
## 1. Implementation

- [ ] 1.1 First task
- [ ] 1.2 Archive the change
```

Rules for tasks:

- Each task is one or more commits, and **the commit that finishes a task ticks its checkbox**. Interrupted work resumes from the first unticked task.
- The last task archives the change: tick it first, then run `pnpm openspec archive <change> --yes`, adding `--skip-specs` when the change has `skip_specs: true`. Spec deltas are merged into `openspec/specs/` in the same pull request.
- `make specs` validates every change and spec, and fails if an archived change still has an unticked task. It is part of `make check`.

## Flows

1. **Spec with review** (`needs-spec`, `needs-spec-review`):
   1. The team leader creates the story branch; the architect creates the spec branch from it.
   2. It writes the change (proposal, spec deltas, and `tasks.md` with the spec task ticked) and opens a pull request into the story branch.
   3. A person reviews and merges it. The `main` rules do not apply to it, and merging deletes the spec branch.
   4. The developer continues on the story branch.
2. **Spec without review** (`needs-spec`): the architect commits the change directly on the story branch, then the developer continues.
3. **Simple story:** the developer writes the change with a minimal proposal (the story's text) and its own `tasks.md`.

In every flow:

- The developer implements the tasks and opens the pull request into `main`.
- The code reviewer reviews that pull request and posts its findings on it. The developer fixes them on the same branch until the verdict is `ready`.
- A person merges the pull request, which closes the story.

## Pull requests

- **One pull request into `main` per story,** never one per task. A story whose pull request is too big to review is split into two stories.
- **Title:** Conventional Commits.
- **Body:**
  - `Closes #<story>`;
  - a summary;
  - the changes;
  - the checks run;
  - when stacked, which pull request merges first.
- **Before opening it:** `make check` passes. The code reviewer reviews it once it is open, so its review is recorded on GitHub.
- **`main` accepts only pull requests,** merged with squash, with no exceptions. The branch is deleted on merge.
- **Today the person merges.** Agents open pull requests with the owner's token, and GitHub does not allow approving your own pull request.
