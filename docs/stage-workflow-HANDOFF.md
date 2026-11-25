# stage-workflow — handoff

**Branch:** `stage-workflow` (off `master`). **Nothing committed yet.**
**Started:** 2026-11-23. **Goal:** my own issue workflow where stages, gates and "what comes next"
live in YAML and a tested script decides every move. Claude only does the judgment work.
This applies [VERIFIABLE-SKILLS-PLAN.md](VERIFIABLE-SKILLS-PLAN.md), checklist items 2 and 5.

## Where things are

| Path                                                         | What it is                                                              |
| ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `plugins/stage-workflow/skills/stage-workflow/workflow.yaml` | the workflow definition; schema documented in its header                |
| `…/scripts/workflow.mjs`                                     | `validate` and `promote` commands; pure functions, no tracker I/O       |
| `…/scripts/vendor/js-yaml.mjs`                               | js-yaml 4.3.1, vendored because plugins ship no node_modules            |
| `…/SKILL.md`                                                 | thin: build the snapshot, run the script, obey its output               |
| `tests/stage-workflow/`                                      | 13 `node:test` tests + a fixture; outside `plugins/` so they don't ship |

Run: `pnpm test` · `node <script> validate <yaml>` · `node <script> promote <yaml> <issue.json>`

## Decided (by me)

- The workflow definition is YAML: each stage's gate, when to promote, and what comes next.
- It lives in this repo.

## Built (Claude's choices — revisit freely)

- **Plugin name** `stage-workflow`.
- **Example stages** are copied from ISoft's `ai-workflow` plugin (Story/Task/Bug prep + dev
  children). Placeholder only.
- **Labels as state:** a membership label + exactly one stage label, and a done label at finish.
  Borrowed from `ai-workflow`.
- **The snapshot boundary:** Claude reads the tracker and writes `issue.json`. The script never
  does I/O. This keeps the script testable, but the snapshot fields are still model judgment.
- **Vendored js-yaml** instead of a build step or JSON.
- **CI:** a new `script-tests` job in `checks.yml` that runs `node --test`, plus a `test` script
  in `package.json`. `**/vendor/` was added to `.prettierignore`.

## Proposed, not built

- `enter` command: add membership + start-stage labels to a new issue.
- `rollback` command: needs a `back:` key per stage in the YAML.
- `status` command: report the stage from the labels alone.
- Snapshot helpers: e.g. count open `Q#` questions in a Jira ADF description by script, which
  shrinks the judgment surface further.
- `typecheck` coverage: the script has JSDoc types, but `tsconfig` doesn't include it yet.
- Running `pnpm sync` to add the plugin to `marketplace.json`. I held off because that publishes it.

## Kickoff session — start here

Build **one stage at a time**. The full example YAML is a map, not a plan; don't implement it all.

1. **Decide the first stage with Claude:** its name, what work happens in it, and its gate
   (the conditions that must be true before it can move on).
2. **Trim `workflow.yaml` to that one stage** with `finish: true`. Move the current example to
   `docs/stage-workflow-example.yaml` for reference.
3. **Write its gate tests**, adding any new gate check to `CHECKS` in `workflow.mjs`.
4. **Run its content step on a few real issues** and judge the output before adding stage two.
5. **Define its handoff:** what it must leave behind. That becomes the next stage's gate.

Then repeat for the next stage: change `finish: true` to `next: <stage>`.

## Open questions

1. What are my real stages, and does my workflow need two tracks (parent/child) or one?
   Answer only the first stage at kickoff.
2. Should `workflow.yaml` live in the plugin, or in each project that uses it? The script
   already takes the path as an argument, so either works.
3. When there are no children, should `children_at_least` fail (current behavior) or fall back
   to the issue's own PR, the way `ai-workflow` does?
