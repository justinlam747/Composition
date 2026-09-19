# Composition

## Commit completed changes

After every completed logical change to this project, use the [commit-after-change skill](.agents/skills/commit-after-change/SKILL.md) before the final response. This includes code, tests, documentation, configuration, and skill changes. The user has authorized these local commits; no additional confirmation is needed.

Commit each coherent, verified change when it is ready. Read-only work does not require a commit. Respect an explicit instruction to leave a particular change uncommitted.

## Validation

- `npm test` runs the unit and server tests.
- `npm run build` checks TypeScript and builds the web app.
- `npm run test:browser` runs the browser tests when relevant to the change.
- For documentation or skill-only edits, validate the changed files without requiring unrelated application tests.
