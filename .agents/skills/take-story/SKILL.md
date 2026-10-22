---
name: take-story
description: Act as the team leader for one user story of the IDEA-Agro board. Read its labels, create its branches, run the matching flow with the architect, developer and code-reviewer roles, and move the story on the board until its pull request is ready to merge. Use it when a person asks to take, start, work on or resume a story ("take story #24").
---

# Take a story

You are the team leader for one story. You never write the spec or the code yourself: you invoke the roles in `.agents/agents/` as subagents, check what they return, and move the story on the board. Subagents cannot start other subagents, so this skill always runs in the main session.

The flow is the one in `.agents/context/workflow.md`. Read it first.

## Board

`scripts/board.py` reads and moves the story. Only you, the team leader, run it.

```bash
uv run python scripts/board.py show <story>
uv run python scripts/board.py move <story> --status "In progress" --phase Dev --iteration current
```

## Steps

1. **Read the story.**
   1. `gh issue view <story> --json number,title,body,labels,assignees,state`, and `scripts/board.py show <story>`.
   2. It must be a user story. If it is not Ready within the current iteration, tell the person and continue only if they confirm.
   3. If it is already In progress or In review, go to "Resume".
2. **Create the story branch** from an up-to-date `main`: `<type>/<story>/<slug>`, where the type is the Conventional Commits type of the story's main change and the slug is a short kebab-case form of the title. Push it.
3. **Move the story:** Status `In progress`, Iteration `current` if it has none, and Phase `Spec` if it has `needs-spec`, otherwise `Dev`.
4. **Spec**, only with `needs-spec`:
   1. Invoke the **architect** with the story, the branch and whether the spec needs review.
   2. If it returns open questions, stop and give them to the person. The story stays in Phase `Spec`.
   3. With `needs-spec-review`:
      - move Phase to `Spec review`;
      - give the person the spec pull request and wait until they merge it into the story branch;
      - check that the change is now on the story branch.
5. **Development:**
   1. Move Phase to `Dev` and invoke the **developer** with the story and the branch.
   2. If it returns an open question, stop and give it to the person.
   3. Check that it opened the pull request into `main`, with `Closes #<story>`.
6. **Review:**
   1. Move Status to `In review` and Phase to `Review`.
   2. Invoke the **code-reviewer** with the pull request.
   3. If the verdict is `changes needed`, invoke the developer with the blocking findings, then the code reviewer again.
   4. After three rounds without `ready`, stop and ask the person.
7. **Hand over:** tell the person the pull request is ready to merge, with the reviewer's summary. Once they merge it, move Status to `Done`.

## Resume

When the story is already In progress or In review:

1. Find its branch: `git branch -r --list "origin/*/<story>/*"`.
2. Find its change in `openspec/changes/`, and the first unticked task in its `tasks.md`.
3. Continue from the step that matches its Phase: `Spec` and `Spec review` go to step 4, `Dev` to step 5, and `Review` to step 6.

## Rules

- **Check every claim against the repository before moving the story:** the branch and its commits, the spec merged into the story branch, the pull request open.
- **Never decide what the story or its spec leaves open.** Ask the person.
- **Everything you write is in English:** branch names, commits, pull requests and comments.
