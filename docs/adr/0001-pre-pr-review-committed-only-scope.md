# ADR-0001 — Pre-PR Review reviews committed work only

- **Status:** Accepted
- **Date:** 2026-06-16
- **Component:** `plugins/isoft-pre-pr-review`
- **Related:** [PRE-PR-REVIEW-PLAN.md](../PRE-PR-REVIEW-PLAN.md)

## Context

The `isoft-pre-pr-review` skill was seeded from `squad-review`, which detects
three possible review scopes — committed branch diff, uncommitted tracked
changes, and untracked files — and, when more than one is present, prompts the
user with a menu to choose which to review.

For a tool whose entire purpose is to be run **immediately before opening a PR**,
that flexibility is a mismatch. A PR contains exactly one thing: the commits on
the branch relative to its base. Uncommitted edits and untracked files are, by
definition, **not** in the PR. Offering to review them:

- invites the developer to "review" work that the human reviewer will never see,
  giving false confidence;
- blurs what the verdict actually certifies (is "Ready to hand off" about the PR,
  or about whatever scratch happened to be in the working tree?);
- adds an interactive menu to a flow we want to be one-shot.

## Decision

The skill reviews **only the committed branch diff vs the resolved base branch**
(`git diff BASE...HEAD`). It does **not** review uncommitted or untracked changes.

Loose work is not silently ignored — it is surfaced as a **warning**:

- If committed changes exist **and** there is loose work, the report and terminal
  summary lead with a warning naming the count of uncommitted/untracked files
  that are excluded because they aren't part of the PR.
- If there are **no** committed changes but loose work exists, the skill does not
  run; it tells the developer to commit first and re-run.

The multi-scope selection menu inherited from `squad-review` is removed.

## Consequences

- **Positive:** the verdict means one unambiguous thing — "is the PR's actual
  diff ready to hand off?" The flow is non-interactive in the common case. The
  warning still protects against the easy mistake of forgetting to commit/add.
- **Negative:** a developer who genuinely wants to review work-in-progress before
  committing can't use this skill for that; `squad-review` remains the tool for
  ad-hoc/uncommitted review. We accept this — pre-PR review and WIP review are
  different jobs.
- **Reversible:** if demand appears, an explicit opt-in flag (e.g.
  `/isoft-pre-pr-review --include-uncommitted`) could re-enable WIP scope without
  changing the default. Not built now (YAGNI).
