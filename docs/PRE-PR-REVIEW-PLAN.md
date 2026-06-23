# Pre-PR Review Skill — Implementation Plan

> Status: **planning** (not yet scaffolded). Pick this up in a fresh session in the
> `my-claude-plugins` repo. Build order and collaboration protocol are intentional —
> read "Build Order & Collaboration Protocol" before writing any code.

## Goal

A manual slash command an ISoft developer runs on their branch **before opening a PR**.
It fans out a squad of independent reviewer subagents in parallel against the branch
diff, then writes one categorized report to a file ending in a clear
**Ready to hand off?** verdict. The point is to catch the mistakes a developer might
miss — and the common ones — *before* the work reaches a human reviewer.

## Background / source material

Two existing skills were studied and cherry-picked from (both in sibling repos under
`~/Documents/GitHub/`):

- **`claude-plugins/plugins/essentials/skills/squad-review`** — the parallel fan-out
  engine: pre-gathered git context via `!`-bash, scope detection, N reviewers dispatched
  in one message, each reading the diff itself, assembled into one categorized report.
- **`superpowers/skills/requesting-code-review`** — the packaging: a separate reviewer
  prompt file, severity tiers, Strengths section, and an explicit merge/handoff verdict.

This skill takes the squad-review architecture and the superpowers packaging, then adds
ISoft-specific reviewers and rules.

---

## Decisions (locked)

| Topic | Decision |
|---|---|
| Architecture | Parallel squad — reviewer subagents dispatched as `Task` calls in one message |
| Invocation | Manual only (`disable-model-invocation: true`); slash command, optional ticket arg |
| Audience | ISoft org / internal team; distributed via this repo's marketplace (`pnpm run sync`) |
| Scope | **Committed branch diff vs base only**; uncommitted/untracked work is warned about, not reviewed (see [ADR-0001](adr/0001-pre-pr-review-committed-only-scope.md)) |
| Output | Written to a file: `docs/reviews/YYYY-MM-DD-<branch>-review.md` **in the repo under review** |
| Verdict | **Ready to hand off?** = **No** if any Blocker OR failing test OR eslint error; else With fixes / Yes |
| Jira ticket | Inferred from branch name; `/pre-pr-review PROJ-123` arg overrides; reviewer skipped if no key |
| Jira reviewer gating | Runs only if a key exists **and** the Jira MCP is installed for that user |
| Tests | Run only changed-area tests (tests touching changed files), report pass/fail, suggest more |
| Codex MCP | Forward-compatible, availability-gated hook only — no-op today; do not hard-depend |

---

## Cross-cutting rules (apply to EVERY reviewer)

1. **No refactor suggestions.** A finding must be a concrete defect: a bug with a repro,
   an exploit path, a missing/wrong doc, a missing/failing test, or a violation of a
   written CLAUDE.md rule or an established repo pattern. "Could be cleaner / more
   idiomatic / extract a helper / DRY this up" is **not** a finding and is dropped at
   both the reviewer and assembly stages. This rule is non-negotiable — it is the reason
   the review feels like a gate and not nitpicking.
2. **Evidence required.** Every finding: `file:line`, what's wrong, why it matters, and
   for bugs a concrete repro/scenario. Confirm before reporting — no speculation.
3. **Scope to the diff.** Read surrounding code only to confirm a finding; do not review
   the whole repo.
4. **Exclusions.** Ignore lockfiles, `dist/`, `build/`, `node_modules/`, images, and
   pure auto-generated/synced manifests (e.g. this repo's `marketplace.json`).

---

## Target structure

```
plugins/pre-pr-review/
├── .claude-plugin/
│   └── plugin.json
└── skills/
    └── pre-pr-review/
        ├── SKILL.md                 ← orchestrator
        └── reviewers/
            ├── bugs.md              ← Potential Bugs (correctness)
            ├── security.md          ← Security Issues
            ├── tests.md             ← Tests (run changed-area + suggest)
            ├── conventions.md       ← Conventions (reads CLAUDE.md)
            ├── documentation.md     ← Documentation
            ├── component-reuse.md   ← Svelte 5 + internal component reuse
            └── case-alignment.md    ← Jira (conditional)
```

Invocation: `/pre-pr-review` or `/pre-pr-review <TICKET-KEY>`.

---

## Orchestrator (SKILL.md) flow

1. **Frontmatter** — `disable-model-invocation: true`; description tuned for the manual
   pre-PR use case.
2. **Pre-gather context** (via `!`-prefixed bash, executed once and shared with reviewers):
   - branch name, diff stat vs `master`, commit one-liners, untracked files
   - every `CLAUDE.md` path in the repo
   - **eslint**: detect a config, run it on the changed files, capture results; if no
     config or it errors, record "lint not configured / skipped" rather than guessing
3. **Scope detection** — auto-proceed on the normal feature-branch-vs-`master` case;
   ask the user to choose when ambiguous (on `master` with uncommitted work,
   untracked-only, feature branch with extra scratch). Apply the exclusions above.
4. **Resolve Jira key** — parse from branch name; arg overrides. Include the
   case-alignment reviewer only if a key exists **and** the Jira MCP is available.
5. **Codex hook (no-op today)** — if the future Codex MCP is available, fetch relevant
   conventions/gotchas/preferences for the touched files and prepend to every reviewer
   prompt. Skip silently when absent.
6. **Dispatch** — issue all applicable reviewers as `Task` calls in a single message;
   prepend the shared context block; tell each reviewer to read the diff via git.
7. **Assemble** — concatenate reviewer outputs under per-section headings, strip any
   refactor-flavored findings that slipped through, compute the verdict, and write the
   report file. Print a short terminal summary pointing at the file.

---

## Reviewers (sections in the report)

| Reviewer | Section | Core job |
|---|---|---|
| Bugs | **Potential Bugs** | logic errors, edge cases, silent failures, async mistakes, off-by-one — each with a repro |
| Security | **Security Issues** | critical/exploitable only — auth/trust-boundary, injection, IDOR, SSRF; confirm exploit path |
| Tests | **Tests** | run changed-area tests, report pass/fail, suggest additional tests *when appropriate* |
| Conventions | **Conventions** | must read every CLAUDE.md; cite a quoted rule or 3+ existing examples |
| Documentation | **Documentation** | missing/stale doc comments, README, public-API docs for the changed code |
| Component Reuse | **Component Reuse** | Svelte 5 correctness + reuse of the internal component library (uses the Svelte MCP) |
| Case Alignment | **Case Alignment** | (conditional) does the diff actually do what the Jira ticket describes? |

---

## Report shape

```markdown
# Pre-PR Review — <branch>
_<N> commits, <X> files changed vs master_   ·   Ticket: <KEY or "none">

## Strengths
- ...

## Security Issues        *N findings*
## Potential Bugs         *N findings*
## Tests                  *pass/fail + gaps*
## Conventions            *N findings*
## Documentation          *N findings*
## Component Reuse        *N findings*
## Case Alignment         *match / mismatch*   (omitted if not run)

---
## Handoff Summary

| Reviewer        | Blockers | Should-fix | Minor |
|-----------------|:--------:|:----------:|:-----:|
| Security        |    N     |     N      |   N   |
| Potential Bugs  |    N     |     N      |   N   |
| Conventions     |    N     |     N      |   N   |
| Documentation   |    N     |     N      |   N   |
| Component Reuse |    N     |     N      |   N   |
| Case Alignment  |   n/a    |    n/a     |  n/a  |   (n/a if not run)
| **Total**       |  **N**   |   **N**    | **N** |

Tests: <pass/fail>  ·  ESLint: <clean/errors/skipped>

### Must resolve before handoff (every Blocker — do not omit)
1. **[<Reviewer>]** <title> — `file:line`

### Should fix
1. **[<Reviewer>]** <title> — `file:line`

**Ready to hand off? — Yes | With fixes | No.**
```

**The summary is built by enumeration, not summarization.** Every Blocker and
every Should-fix from the sections above is re-listed (tagged by reviewer) under
the two lists — the lists must account for every Blocker/Should-fix in the table.
This is deliberate: a one-line "what to fix first" invites Claude to pick one or
two items and silently drop the rest, which breaks the gate once there are
several reviewers. Minor findings are counted in the table but not re-listed.

---

## Build Order & Collaboration Protocol

**Build the most critical pieces first so each can be tested and tweaked before the
next is added.** Each phase is built one reviewer at a time. For every reviewer/phase:
present the full prompt for line-by-line review, explain the rationale for any
non-obvious line, get approval, let the user test and tweak, commit, then move on.
Do **not** batch-generate all reviewers at once.

> **Progress (as of 2026-06-23):** Phases 0–2 and 5 are done and wired into the
> orchestrator (Potential Bugs, Security, Documentation reviewers). Phases 3–4
> were deliberately deferred ahead of a demo and remain to be built. Build order
> below was not followed strictly — Documentation (5) was pulled forward as a
> low-risk win. The skill stays shippable at each step regardless of order.

- **Phase 0 — Foundation.** ✅ Done. `plugin.json` + a minimal `SKILL.md` that gathers
  context, detects scope, dispatches a *single* reviewer, and writes the report file.
  Run `pnpm run sync`. Goal: prove the end-to-end pipeline on one reviewer.
- **Phase 1 — Potential Bugs reviewer.** ✅ Done. The highest-value lens; tune it
  against real ISoft diffs.
- **Phase 2 — Security reviewer.** ✅ Done. Source→sink discipline; confirmed-exploit
  findings are Blockers, plausible-but-unconfirmed cap at Should-fix.
- **Phase 3 — Tests reviewer + eslint in the orchestrator.** ⏳ Deferred. Wire up
  changed-area test execution and the lint step; fold both into the verdict gate.
  (Until this lands, the report shows Tests/ESLint as "skipped".)
- **Phase 4 — Conventions reviewer.** ⏳ Deferred. (reads CLAUDE.md)
- **Phase 5 — Documentation reviewer.** ✅ Done (pulled forward ahead of Phases 3–4).
  Caps at Should-fix — documentation never flips the verdict to "No". Concerns:
  missing Svelte prop docs, missing test-run docs, stale docs after a fix/feature,
  incorrect new docs, and (nice-to-have) unannotated new graphql/api endpoints.
- **Phase 6 — Component Reuse reviewer.** (Svelte MCP)
- **Phase 7 — Case Alignment reviewer.** (Jira, conditional)
- **Phase 8 — Codex MCP forward hook** + final verdict-gate polish.

At each phase the skill stays shippable: it just has fewer reviewers.

---

## Getting started (next session)

Phases 0–2 and 5 are built (Potential Bugs, Security, Documentation). Pick up the
deferred work:

1. **Phase 3 — Tests + eslint in the orchestrator.** This is the highest-value gap:
   it's the only remaining piece that folds into the verdict gate (a failing test or
   eslint error flips "Ready to hand off?" to **No**). Wire changed-area test
   execution and the lint step into `SKILL.md`, replacing the current
   "skipped (not wired until Phase 3)" placeholders in the report.
2. **Phase 4 — Conventions reviewer** (reads every CLAUDE.md; cite a quoted rule or
   3+ existing examples).
3. Then Phases 6–8 (Component Reuse, Case Alignment, Codex hook).

Per the collaboration protocol: build one reviewer at a time, present the full
prompt for line-by-line review, get approval, test on a real branch, commit.

---

## Open questions

- [x] Final plugin/skill name and whether to namespace it — **`isoft-pre-pr-review`** (namespaced).
- [x] Is `master` always the base, or detect the default branch? — **detect** (`origin/HEAD` → local `main`/`master` fallback → ask; see SKILL Step 2).
- [ ] Exact `docs/reviews/` location — always in the reviewed repo, or configurable?
- [ ] Which Jira project keys are in use (for branch-name parsing)?
- [x] Set a `version` in `plugin.json` or rely on git SHA — **manual `version` field**, bump on each release.
```

---

## Future tooling (beyond Phase 8, net-new scope)

### Reviewer eval harness

A **separate sibling skill** (not a phase of this one) to score the reviewer
prompts and catch regressions as they're tuned across phases.

- **Golden fixtures:** small diffs with *planted* bugs (off-by-one, swallowed
  exception, lying `as` cast, etc.) plus clean diffs with none.
- **Scores:** **recall** (found the planted bugs?), **precision** (no fabrication
  or refactor-noise leak?), **verdict correctness** (gate landed right?).
- **Why:** a human tuning prompts by hand won't notice silent regressions — e.g.
  Phase 0 testing caught the bugs reviewer *fabricating line numbers* on a
  177-line file. A fixture suite catches that class of drift automatically.
- **Two distinct mechanisms, solved separately:**
  1. *Guardrail (in-skill, every run)* — SKILL Step 6 validates every cited
     `file:line` resolves before writing the report. **Done in Phase 0.**
  2. *Eval harness (separate dev-time skill)* — build once 2–3 reviewers exist so
     it scores *any* reviewer rather than being rebuilt per reviewer. Deserves its
     own plan/ADR.
