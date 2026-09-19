---
name: commit-after-change
description: Automatically commit each completed logical change in the Composition repository after relevant verification. Use when finishing code, tests, documentation, configuration, or skill edits; skip read-only tasks and changes the user explicitly wants left uncommitted.
---

# Commit after each change

The user has authorized a local Git commit after each completed logical change in this repository. Apply this workflow before reporting completion, without asking again for permission to commit. A logical change includes the implementation and any related tests or documentation needed to make it complete.

1. Inspect the branch, `git status --short`, and any staged changes before editing. Keep track of which changes belong to this task, including any existing edits the user explicitly asks to commit.
2. Finish a coherent change and run checks appropriate to its scope. Use the repository's `AGENTS.md` for available commands. Fix failures caused by the change before committing. Report unrelated existing failures accurately; do not claim they passed. Do not commit incomplete or unverified implementation work merely to satisfy this workflow.
3. Review the diff and stage only the intended files or hunks. Respect `.gitignore`. Exclude secrets, local environment files, dependencies, generated build/test output, and unrelated user edits. Preserve unrelated staged work; never use a blanket add or reset to tidy the working tree.
4. Inspect `git diff --cached --stat`, `git diff --cached`, and `git diff --cached --check`. Resolve accidental changes and new whitespace errors. If another process changes a file during review, inspect that change before including it.
5. Create a commit with a concise imperative message describing the actual result. Use normal Git author/committer metadata. Do not create empty commits, amend existing commits, rewrite history, or bypass hooks unless the user explicitly requests that operation.
6. Verify the new commit with `git log -1 --oneline` and check `git status --short`. Confirm the task's intended changes were committed and describe any remaining unrelated changes. Include the short commit hash and relevant verification results in the final response.

Repeat for each independently completed change during a longer task; intermediate saves and unfinished edits do not need separate commits. If nothing changed, no commit is necessary. If a commit fails because of identity, hooks, conflicts, or another concrete blocker, resolve it within the authorized task when possible; otherwise report the blocker and keep the work intact.

This skill authorizes local commits. Push when the user has requested or otherwise authorized pushing for the active task; do not infer permanent automatic push permission from a request to commit.
