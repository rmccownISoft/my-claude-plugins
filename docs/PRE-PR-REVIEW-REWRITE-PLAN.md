# Pre-PR Review Rewrite — Priorities & Plan

> **Status:** planning. No code changed yet.
> **Written:** 2026-09-28 · **Branch:** `scriptify-rewrite-pr-reviewer` (this repo)
> **Purpose:** resume this work in a fresh session without re-deriving anything.
> Read this file first. It supersedes the "what to do next" parts of the older docs
> listed under [Related docs](#related-docs).

---

## 1. Background: why this rewrite exists

`isoft-pre-pr-review` started as a demo: a review the developer runs **locally,
before** opening a PR. After it was shared with the org, other devs added:

- optional arguments (`base=`, `destination=`, `output=`, ticket key)
- real-PR vs. no-PR behavior (post a review, or open a draft PR first)
- local file vs. chat output vs. posted GitHub comments
- unattended (CI) runs

Each change was made by editing prose in markdown and hoping the model would follow
it. The skill is now hard to read, review, or predict.

### Where the code lives

| Location | What it is | Trust level |
|---|---|---|
| `../claude-plugins` (org repo), commit `d056a7f` | **Live version.** `plugins/isoft-dev/skills/pre-pr-review/` | Real, in use |
| `../claude-plugins/plugins/ai-workflow/skills/ai-pr-review/` | **Fork** of the same squad for the AI coding workflow | Real, in use |
| `plugins/isoft-pre-pr-review/` (this repo) | Older copy used for experimenting | Snapshot |
| `docs/assemble.mjs`, `docs/reviewer-output.schema.json`, `docs/sample-reviewers.json` (this repo) | Claude-generated on this branch | **Unverified. Examples only.** |
| `docs/PRE-PR-REVIEW-EVAL-PLAN.md`, `docs/PRE-PR-REVIEW-SCRIPT-MIGRATION.md` (this repo) | Claude-generated plans | **Unverified.** The ideas are reusable. Don't assume the code works. |

---

## 2. Goals and constraints

**Goals (in priority order):**

1. **Scripts for decisions.** Anything that needs consistency or a yes/no decision
   moves from markdown prose into a tested script.
2. **Evals as proof.** Show with numbers that scripts beat iterating on markdown.
3. **Readable skills.** A person or a model can follow the `SKILL.md` top to bottom.

**Constraints:**

| Constraint | What it means here |
|---|---|
| Token/usage cost stays reasonable | Don't add agents without measuring what they buy |
| Claude **subscription**, not API keys | The company pays for subscriptions. CI uses `CLAUDE_CODE_OAUTH_TOKEN` |
| Works in 3 contexts | Manual command, AI-driven coding workflow, GitHub Actions |
| Adversarial / multi-agent verification | Wanted, but must earn its cost in the eval |

---

## 3. Findings (evidence gathered 2026-09-28)

| # | Finding | Evidence | Why it matters |
|---|---|---|---|
| F1 | The live orchestrator is 596 lines. Much of it is routing logic, not review logic. | Org `SKILL.md` Steps 1–4 (branch/base/PR/scope) and Steps 7–8 (destination) | Branching prose is what drifts and what the model gets wrong |
| F2 | Step 7 alone (lines ~431–493) decides the destination from 3 inputs, about 30 combinations | `destination=` (5 states) × `PR_OPEN` (3) × interactive or CI (2) | Nobody can check that all 30 still behave correctly after a prose edit. A script with one test per row can. |
| F3 | Two orchestrators wrap near-identical reviewers | `pre-pr-review` (596 lines) vs `ai-pr-review` (730 lines). Reviewer diffs: bugs/security/documentation differ by 2 lines each. `tests.md` differs by about 167 lines. | Copies drift. There should be one shared reviewer set and thin entry points. |
| F4 | The org `SKILL.md` `description` uses a `>-` block scalar | Line 7 of org `SKILL.md` | Violates [ADR-0002](adr/0002-skill-descriptions-single-line-scalar.md). Line-based loaders drop everything after line 1, including the trigger keywords. |
| F5 | The branch's draft schema + `assemble.mjs` have the right idea | [reviewer-output.schema.json](reviewer-output.schema.json), [assemble.mjs](assemble.mjs) | Reviewers return JSON and a script counts, decides the verdict, and renders. Treat it as a sketch to rebuild and test, not as working code. |

---

## 4. The design direction

### 4.1 Rule of thumb: prose for judgment, scripts for decisions

> If a paragraph of `SKILL.md` contains "if", it's probably a script.

| Part of the skill | Kind of work | Goes to |
|---|---|---|
| Branch, base-branch detection, open-PR detection, scope, loose-work warning | Yes/no decisions | `gather` script → `context.json` |
| Reviewer prompts (`reviewers/*.md`) | Judgment | Stays markdown |
| Counts, verdict, Blocker/Should-fix enumeration, citation checks, rendering | Arithmetic + formatting | `assemble` script |
| "Is this finding really a refactor?" / "Relocate or drop a bad citation?" | Judgment | Model. It acts on `assemble`'s `unresolved[]` list, then re-runs `assemble`. |
| Destination, create PR, post review, write file | Yes/no decisions | `deliver` script, driven by flags |

### 4.2 Target `SKILL.md` shape

The orchestrator becomes a short pipeline, roughly:

```markdown
1. Run gather.mjs with the args  → context.json (base, scope, PR, mode, reviewers), or a STOP reason
2. Dispatch the reviewers named in context.json; each returns JSON matching the schema
3. Run assemble.mjs              → report + verdict + unresolved citations
   (judgment: fix or drop each unresolved finding, strip refactor findings, re-run)
4. Run deliver.mjs --mode <from context.json>
```

Mechanics (from Claude Code skills docs, `code.claude.com/docs/en/skills.md`):

- `${CLAUDE_SKILL_DIR}` resolves to the skill's folder, e.g.
  `node ${CLAUDE_SKILL_DIR}/scripts/gather.mjs`.
- Listing the same path in `allowed-tools` frontmatter lets it run without
  permission prompts: `allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/scripts/*)`.
- `` !`command` `` in `SKILL.md` runs the command before the model sees the skill
  and inlines its output. Use it for `gather`.

### 4.3 One explicit mode table

The sprawl came from modes that were never written down in one place. `gather`
resolves the mode once, up front:

| Context | Triggered by | Default destination | May ask questions? |
|---|---|---|---|
| Local, before a PR | Dev typing the command | show / file | Yes |
| AI coding workflow | Another skill, after a draft PR exists | PR comment | **No** |
| GitHub Action | Workflow on a PR event | PR review | **No** |

- GitHub Actions sets `CI=true`. When it's set, the script never prompts.
- `ai-pr-review` becomes a thin entry point that passes a mode flag and reuses the
  same reviewers and scripts. **Do this merge only after the approach is proven in
  this repo.**

---

## 5. Scope

| In scope now | Deferred, and why |
|---|---|
| Baseline eval of the current org version (`d056a7f`) | New reviewers (Component Reuse, Case Alignment). They add variables mid-measurement. |
| Reviewer output JSON schema (the keystone contract) | Reviewer prompt tuning. **Freeze prompts** so evals isolate the script change. |
| `gather`, `assemble`, `deliver` scripts, each with unit tests | Adversarial / multi-agent verification. Test it as a hypothesis later (§7). |
| Mode table + `CI=true` handling | Codex feedback write path. It's conversational judgment, not pipeline. |
| Fix the org `description` block scalar (F4) | Merging with `ai-pr-review` in the org repo. Do it after proof. |

---

## 6. Eval plan: how to prove it

**Order matters: measure the baseline first.** Once the refactor lands, the old
behavior is gone and there's nothing to compare against.

### 6.1 Three layers

| Layer | Proves | How | Cost |
|---|---|---|---|
| **1. Script unit tests** | Moved logic is correct for every case | `node --test` against fixture JSON. One test per mode-table row and per Step-7 combination. | Free, deterministic |
| **2. Same-input drift test** | Prose varies run to run; scripts don't | Feed **identical** pre-recorded reviewer outputs to (a) the old Step 6 prose, ×10 runs via `claude -p`, and (b) `assemble`, ×1. Count wrong totals, dropped Blockers, wrong verdicts. Repeat for routing: fixed scenarios through the old Step 7 prose vs `deliver`. | Low. No reviewers run. |
| **3. End-to-end** | Detection doesn't regress; cost and time drop | `claude plugin eval` on fixture repos with known defects. Old version vs new version. | Highest |

**Layer 2 is the most convincing result**, because it isolates exactly what
changed. Target headline: *"same findings, but the report is always correct, always
identical, and cheaper."*

### 6.2 Metrics

| Metric | Expected change | Layer |
|---|---|---|
| Assembly correctness (counts, verdict, no omitted Blockers, no fabricated `file:line`) | Prose drifts; script ≈ 100% | 1, 2 |
| Routing correctness (right destination, never prompts in CI) | Prose drifts; script ≈ 100% | 1, 2 |
| Consistency (same input → same output) | Script identical | 2 |
| Cost (`total_cost_usd` from `claude -p --output-format json`) | Lower | 3 |
| Wall-clock time | Lower | 3 |
| Detection recall / precision / verdict | ~Flat. Report it to show no regression. | 3 |

### 6.3 `claude plugin eval` facts (from `code.claude.com/docs/en/plugin-evals.md`)

- Cases live in `evals/<case>/prompt.md` + `evals/<case>/graders/*.md`. The folder
  can be changed via `plugin.json` `experimental.evals`.
- An optional `case.yaml` can run a scaffold script. Use it to build a small git
  repo with a branch containing planted defects.
- Grader types: `regex`, `tool_used`, `tool_order`, `file_exists`, `llm` (rubric
  judged by a model), `baseline` (vs. a reference transcript). It can also mock
  external calls, so routing can be tested without really posting to GitHub.
- Defaults to 3 runs per case. CI flags: `--trust-plugin --json results.json
  --threshold 0.8 --max-cost-usd N --judge-model claude-haiku-4-5 --no-publish`.
  Exit codes: 0 pass, 1 fail, 2 partial (cost ceiling / auth failure).
- **Gap:** its built-in two-arm mode compares *with plugin vs. without*, not *old
  version vs. new version*. Run it once per plugin version with `--ablation none`
  and compare the two JSON results.

### 6.4 Fixtures

- **Best source:** past ISoft PRs where a human reviewer caught a real bug. That's
  real ground truth.
- **Fallback:** small planted-defect diffs (off-by-one, swallowed exception, wrong
  `as` cast) plus clean diffs with no defects.

---

## 7. Other considerations

| Topic | Position |
|---|---|
| **Adversarial / multi-agent verification** | A hypothesis, not a default. A verify pass costs roughly one extra agent per finding. Try the cheap version first: **verify only Blockers**, because only they flip the verdict. Keep it only if layer-3 precision measurably improves. |
| **Token cost** | Scripts are the biggest saving, because the orchestrator stops reasoning over hundreds of lines of branches. |
| **Subscription auth in CI** | Supported: `claude setup-token` → secret `CLAUDE_CODE_OAUTH_TOKEN` → `claude_code_oauth_token:` input on `anthropics/claude-code-action`. The token is **tied to whoever generated it**. The docs don't say how automated use counts against plan limits. |
| **Cost numbers on a subscription** | `total_cost_usd` is a list-price estimate, not a bill. Use it as a relative measure between versions. |
| **Eval spend on a subscription** | Layers 1–2 are nearly free. Layer 3: keep fixtures small, `--runs 3`, Haiku judge. |

---

## 8. Open questions

- [ ] Does `claude plugin eval` authenticate with a subscription (OAuth) login?
      Exit code 2 includes auth failure, so one test run will answer it.
- [ ] Who should own the CI OAuth token (it's tied to one person)? Confirm
      automated-use limits with the org admin before org-wide rollout.
- [ ] Script language: Node `.mjs` (matches this repo's tooling) is the working
      assumption. Confirm Node is available in every target context (GHA runner,
      dev machines).
- [ ] Which past ISoft PRs make good ground-truth fixtures?
- [ ] Reviewer output transport: do reviewers write JSON to a temp file, or return
      it in their final message for the orchestrator to save?

---

## 9. Next steps (in order)

- [ ] **1. Schema.** Write the reviewer output JSON schema. The draft at
      [reviewer-output.schema.json](reviewer-output.schema.json) is a starting
      point, not a given.
- [ ] **2. Baseline drift test (layer 2).** Hand-write 3–4 reviewer-output fixtures
      (many findings; cross-reviewer duplicate; one reviewer could-not-run; all
      clean). Run the **org** Step 6 prose ×10 via `claude -p` on each. Record
      error rates. *This is the "before" number. Aim to have it within a day.*
- [ ] **3. `assemble` script + unit tests.** Rebuild or verify against the draft
      [assemble.mjs](assemble.mjs). Re-run the same fixtures and record results.
- [ ] **4. Routing baseline + `deliver` script.** Same pattern for Step 7/8: baseline
      the prose on fixed scenarios, then build and test the script.
- [ ] **5. `gather` script.** Steps 1–4 plus the mode table and `CI=true`.
- [ ] **6. Shrink `SKILL.md`** to the §4.2 pipeline. Reviewer prompts unchanged.
- [ ] **7. Layer 3** end-to-end comparison, old vs new.
- [ ] **8. Then** consider verification passes, the `ai-pr-review` merge, and new
      reviewers.

---

## Related docs

| Doc | Status |
|---|---|
| [PRE-PR-REVIEW-PLAN.md](PRE-PR-REVIEW-PLAN.md) | Original demo-era plan (phases, reviewers, report shape). Still useful for reviewer intent and cross-cutting rules. |
| [PRE-PR-REVIEW-SCRIPT-MIGRATION.md](PRE-PR-REVIEW-SCRIPT-MIGRATION.md) | Claude-generated. Unverified. Useful reasoning on what moves to scripts. |
| [PRE-PR-REVIEW-EVAL-PLAN.md](PRE-PR-REVIEW-EVAL-PLAN.md) | Claude-generated. Unverified. Good "measure what the migration changes" framing. |
| [adr/0001-pre-pr-review-committed-only-scope.md](adr/0001-pre-pr-review-committed-only-scope.md) | Still in force: only committed branch diff is reviewed. |
| [adr/0002-skill-descriptions-single-line-scalar.md](adr/0002-skill-descriptions-single-line-scalar.md) | Basis for finding F4. |
