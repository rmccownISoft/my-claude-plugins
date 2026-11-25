# ts-standard — handoff

**Branch:** `stage-workflow` (shared with that project; see "Committing" below). **Nothing committed yet.**
**Started:** 2026-11-23. **Goal:** my rewrite of isoft-dev's `typescript-project` skill
(org repo `claude-plugins`). The ISoft TypeScript standard becomes a list of **checks** in YAML,
not "whatever the scaffolder produces today". One tested script runs them:

```
survey  = run the checks              → failing checks ARE the gap list
verify  = run the agreed checks again → done = none of them fail   (--only id,id)
```

This drops the scaffolder from modernize mode, and with it most of the original skill's prose:
registry login, staleness check, `pnpm dlx` caching, flag matching, the throwaway reference project.

## Where things are

| Path                                                   | What it is                                                            |
| ------------------------------------------------------ | --------------------------------------------------------------------- |
| `plugins/ts-standard/skills/ts-standard/standard.yaml` | the standard: 8 checks; schema and facts documented in its header     |
| `…/scripts/check.mjs`                                  | `check` and `validate`; reads files only, no network, no writes       |
| `…/scripts/vendor/js-yaml.mjs`                         | same vendored js-yaml 4.3.1 as stage-workflow                         |
| `…/SKILL.md`                                           | thin: run survey, agree scope, run verify with `--only`               |
| `tests/ts-standard/check.test.mjs`                     | 12 tests on temp-dir fixture projects (1 compliant + broken variants) |

Run: `pnpm test` · `node <script> validate <yaml>` · `node <script> check <yaml> <project> [--only a,b]`

## Decided (by me)

- Rewrite the skill myself; experiment in this repo, not the org repo.
- Infer what I can from the project instead of running the scaffolder.

## Built (Claude's choices — revisit freely)

- **Plugin name** `ts-standard`.
- **Two kinds of "correct":** project-specific values are inferred as `facts` (package manager,
  library, outDir, test runner, Jira prefix). The ISoft standard itself is written down in
  `standard.yaml`, because a project's code can't tell you what it _should_ have.
- **The 8 checks** come from the original SKILL.md's text, with line references in each
  `description`. The ESLint config `min: 3.0.0` is a placeholder.
- **Assertion types:** `file`, `contains`, `absent`, `devDependencies` (with `min`), `scripts`,
  `packageJson` (`has` / `lacks` / `equals`, dotted fields). `validate` rejects unknown keys and
  facts, so a typo fails loudly instead of never matching.
- **Smoke run** (read-only) on 4 local projects: `Discord-MCP`, `agg-deploy-tool-redo`,
  `aggregator-plugin-logger`, `aggregator-plugin-types`. The output was sensible; all were far from the standard.

## Known weaknesses

- **`library` is a weak guess:** any package without `"private": true` counts. `Discord-MCP` got a
  changesets failure it probably shouldn't. The original skill uses `pnpm view` + the repository
  URL; that needs the network and a login.
- **No real project has passed yet.** Only the fixture passes. Run it on a project that has been
  modernized (`utility-db`'s tooling branch was the original reference) to confirm the checks.
- **Presence, not correctness:** checks confirm `eslint.config.js` exists, not that it's right.
  Run `pnpm run build/lint/format:check/test` for that (the original skill's Step 5), still not scripted.

## Proposed, not built

- **Drift test:** scaffold a fresh project with `create-typescript` and assert it passes every
  check. That turns the scaffolder into the test oracle (the thing a test compares against)
  instead of a run-time step. Needs the private registry login, so probably a manual or scheduled
  run, not every CI run.
- **Fixes:** template files next to `standard.yaml`, one per check, so closing a gap doesn't need
  the scaffolder either. ESLint reconciliation stays model judgment.
- **Command checks:** a check type that runs a command and expects exit 0 (`build`, `lint`, …),
  plus the hook probe.
- **New mode:** keep the scaffolder for brand-new projects; port that part of the old skill.
- Branch-stacking and history backfill from the old skill: not started; decide whether they belong here.

## Kickoff — start here

Same rule as stage-workflow: **one check at a time.** Pick one check, confirm it against a real
modernized project and a fresh scaffold, tighten it, then move to the next.

## Committing

Both projects sit uncommitted on the `stage-workflow` branch. Commit them separately: first
`stage-workflow` (its plugin, tests, handoff, and the shared `package.json` / `checks.yml` /
`.prettierignore` changes), then cut a `ts-standard` branch for this one.
