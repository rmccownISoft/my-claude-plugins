---
name: isoft-pre-pr-review
description: >-
  Manual pre-PR review for ISoft branches. Dispatches independent reviewer
  subagents in parallel against the branch diff and writes one categorized
  report ending in a clear "Ready to hand off?" verdict. Run it on your
  branch BEFORE opening a PR to catch the mistakes a human reviewer would.
  User-invocable only.
disable-model-invocation: true
---

# ISoft Pre-PR Review

Run this on a feature branch before opening a PR. It gathers the branch diff,
dispatches a squad of independent reviewer subagents in parallel, assembles
their findings into one categorized report, computes a **Ready to hand off?**
verdict, and writes the report to a file in the repo under review.

> **Phase 2 (current):** two reviewers wired up — Security Issues and Potential
> Bugs. The pipeline is complete end-to-end; later phases add reviewers without
> changing this flow.

Invocation: `/isoft-pre-pr-review` or `/isoft-pre-pr-review <TICKET-KEY>`.
(The ticket arg is accepted now but unused until the Case Alignment reviewer lands.)

## Cross-cutting rules (every reviewer must obey)

These are prepended to every reviewer prompt. They are the reason this review
is a gate and not nitpicking:

1. **No refactor suggestions.** A finding must be a concrete defect: a bug with
   a repro, an exploit path, a missing/wrong doc, a missing/failing test, or a
   violation of a written CLAUDE.md rule or established repo pattern.
   "Could be cleaner / more idiomatic / extract a helper / DRY this up" is **not**
   a finding and is dropped at both the reviewer and assembly stages.
2. **Evidence required.** Every finding needs `file:line`, what's wrong, why it
   matters, and for bugs a concrete repro/scenario. Confirm before reporting —
   no speculation.
3. **Scope to the diff.** Read surrounding code only to confirm a finding; do
   not review the whole repo.
4. **Exclusions.** Ignore lockfiles, `dist/`, `build/`, `node_modules/`, images,
   and pure auto-generated/synced manifests (e.g. a repo's `marketplace.json`).

## Step 1 — Gather context

Run these from the repo root (use the Bash tool; they are read-only git queries):

```bash
git rev-parse --abbrev-ref HEAD                       # current branch
git rev-parse --abbrev-ref origin/HEAD 2>/dev/null    # default branch as origin/<name>; empty + non-zero exit if unset
git branch --format='%(refname:short)'                # local branches (fallback base detection)
git ls-files --others --exclude-standard              # untracked files
git ls-files '**/CLAUDE.md' 'CLAUDE.md'               # CLAUDE.md files in the repo (for later phases)
```

## Step 2 — Resolve the base branch

The base is the branch this work will merge into. Detect it, do not assume:

1. Accept `git rev-parse --abbrev-ref origin/HEAD` as the base **only if it both
   exits 0 and prints a real ref** (e.g. `origin/main`). When `origin/HEAD` is
   unset, this command exits non-zero **and prints the literal string
   `origin/HEAD`** — do NOT accept that. Treat exit≠0, empty output, or output
   equal to `origin/HEAD` as "not resolved" and fall through to rule 2.
2. Otherwise, fall back to the first of these that exists as a local branch:
   `main`, then `master`. Use the local name (e.g. `master`).
3. If neither exists, ask the user which branch to diff against. Do not guess.

Before continuing, sanity-check the resolved base: `git rev-parse --verify BASE`
must succeed. If it doesn't, the base is wrong — fall back (rule 2) or ask
(rule 3) rather than running diffs against a bogus ref.

Record the resolved base; every diff below uses it. Let `BASE` denote it.

## Step 3 — Detect scope (committed work only)

This is a **pre-PR** review, so the unit of review is the **committed branch diff
vs `BASE`** — exactly what the PR will contain. Uncommitted and untracked changes
are **not** reviewed; they won't be in the PR. This is a deliberate decision —
see [ADR-0001](../../../../docs/adr/0001-pre-pr-review-committed-only-scope.md).

Gather:

- **committed diff** (what gets reviewed): `git diff BASE...HEAD --stat`
- **loose work** (for a warning only):
  - uncommitted tracked: `git diff HEAD --stat`
  - untracked: `git ls-files --others --exclude-standard`

Decision rules:

1. **Committed diff has files** → review it. If any loose work exists, prepend a
   warning to the report header and the terminal summary, e.g.:
   _"⚠ N uncommitted + M untracked file(s) are NOT included in this review — they
   aren't part of the PR. Commit them and re-run if they should be reviewed."_
2. **Committed diff empty, but loose work exists** → do not dispatch. Warn:
   _"No committed changes vs `BASE`. You have N uncommitted / M untracked file(s)
   — commit them first, then re-run."_ Stop.
3. **Nothing anywhere** → respond _"No changes to review."_ and stop.

Apply the exclusions from the cross-cutting rules to the committed diff.

## Step 4 — Gather diff stats for the report header

For the chosen scope, capture:

```bash
git diff BASE...HEAD --stat        # (branch-diff scope) file/line counts
git log BASE..HEAD --oneline       # (branch-diff scope) commit one-liners
```

Note the file count and commit count for the report header.

## Step 5 — Dispatch reviewers

Issue all applicable reviewers as `Task` calls **in a single message** so they
run in parallel. (Phase 2: the Security Issues and Potential Bugs reviewers —
dispatch both in one message; adding more reviewers needs no restructuring.)

For each reviewer:

- `subagent_type`: `general-purpose` (reviewers need full read/grep access)
- `description`: the reviewer's short name (e.g. "Potential Bugs review")
- `prompt`: the contents of the reviewer file under `reviewers/`, with the
  **shared context block** below prepended.

Shared context block to prepend (fill in from the steps above):

```
## Scope
Branch: <current branch>
Base: <BASE>
Read the committed diff yourself with:
  git diff <BASE>...HEAD
This is the exact set of changes the PR will contain. Uncommitted and untracked
work is out of scope and must not be reviewed.
Do NOT paste-review from this prompt — read the diff via git.

## Cross-cutting rules
1. No refactor suggestions — concrete defects only.
2. Every finding needs file:line, what's wrong, why it matters, and concrete
   evidence (a repro for bugs, a source→sink exploit path for security).
3. Scope to the diff; read surrounding code only to confirm a finding.
4. Ignore lockfiles, dist/, build/, node_modules/, images, generated manifests.
```

## Step 6 — Assemble and write the report

When the reviewer(s) return:

1. Concatenate each reviewer's output verbatim under its section heading.
   Do not re-rank or summarize their findings.
2. **Strip any refactor-flavored findings that slipped through** (anything whose
   only substance is "cleaner / more idiomatic / extract / DRY"). This is the
   second enforcement point for rule 1.
3. **Validate every cited location.** For each finding, confirm its `file:line`
   actually exists — the file is in the changed set and the line is within the
   file (or the quoted snippet genuinely appears in it). Reviewers occasionally
   fabricate line numbers; do not pass them through. For any finding whose
   location does not resolve: re-locate it from the diff if the described defect
   is real, otherwise drop the finding and note in the terminal summary that a
   finding was dropped for an unverifiable location. Never write a `file:line`
   into the report that you have not confirmed.
4. Count findings by severity (Blocker / Should-fix / Minor) **per reviewer**.
   These counts feed the per-reviewer table in the Handoff Summary and MUST match
   the `*N findings*` count in each section heading — if they disagree, recount;
   the numbers may not drift.
5. **Build the Handoff Summary by enumeration, not summarization.** This is the
   anti-omission rule: with multiple reviewers it is tempting to mention only the
   one or two most salient items — do not. The summary must:
   - render the per-reviewer count **table** (a row per reviewer that ran; `n/a`
     for a reviewer that did not run, e.g. Case Alignment without a ticket; a
     **Total** row);
   - under **"Must resolve before handoff"**, list **every Blocker** — copied
     (title + location) from the sections above and tagged with its reviewer;
   - under **"Should fix"**, list **every Should-fix**, likewise tagged.
   The two lists must account for **every** Blocker and Should-fix in the table —
   do not merge, rank, or drop any. Minor findings are counted in the table but
   stay in their sections (not re-listed). An item present in a count but missing
   from its list is a defect in the report — reconcile before writing.
6. Compute the verdict:
   - **No** if there is **any Blocker** (later phases also: any failing test or
     eslint error).
   - **With fixes** if there are Should-fix or Minor findings but no Blocker.
   - **Yes** if nothing of substance was found.
7. Write the report to `docs/reviews/YYYY-MM-DD-<branch>-review.md` **in the repo
   under review**. Create `docs/reviews/` if it does not exist. Use today's date.
8. Print a short terminal summary: the verdict, the total counts, and the report path.

### Report shape

```markdown
# Pre-PR Review — <branch>
_<N> commits, <X> files changed vs <BASE>_   ·   Ticket: <KEY or "none">

## Strengths
- <genuine strengths, if any — a single merged list is fine here>

## Security Issues        *N findings*
<reviewer output verbatim>

## Potential Bugs         *N findings*
<reviewer output verbatim>

---
## Handoff Summary

| Reviewer       | Blockers | Should-fix | Minor |
|----------------|:--------:|:----------:|:-----:|
| Security       |    N     |     N      |   N   |
| Potential Bugs |    N     |     N      |   N   |
| **Total**      |  **N**   |   **N**    | **N** |

Tests: <pass/fail or skipped>  ·  ESLint: <clean/errors/skipped>

### Must resolve before handoff (every Blocker — do not omit)
1. **[<Reviewer>]** <title> — `file:line`
   <add one line per Blocker; "None." if there are no Blockers>

### Should fix
1. **[<Reviewer>]** <title> — `file:line`
   <add one line per Should-fix; "None." if there are none>

**Ready to hand off? — Yes | With fixes | No.**
```

Later phases add `## Tests`, `## Conventions`, `## Documentation`,
`## Component Reuse`, and (conditional) `## Case Alignment` sections above the
Handoff Summary — each becomes its own row in the table, and its
Blockers/Should-fix items flow into the two lists. Tests/ESLint also fold into
the verdict gate. (The table shows Security and Potential Bugs rows today because
those are the two reviewers wired up in Phase 2.)
