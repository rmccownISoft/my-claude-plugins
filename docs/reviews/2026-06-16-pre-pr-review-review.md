# Pre-PR Review — pre-pr-review
_5 commits, 8 files changed vs master_   ·   Ticket: none

## Strengths
- Base-branch resolution correctly falls back to a local branch when `origin/HEAD`
  is unset (verified live: resolved to `master`).
- The committed-only scope (ADR-0001) is implemented consistently across the
  orchestrator and the shared reviewer context block.

## Potential Bugs         *2 findings*

### 1. Base-branch resolution treats a failed `origin/HEAD` lookup as success
**Severity:** Should-fix
**Location:** `plugins/isoft-pre-pr-review/skills/isoft-pre-pr-review/SKILL.md` — Step 1 & Step 2 rule 1
**What breaks:** `git rev-parse --abbrev-ref origin/HEAD` does not cleanly fail when
`origin/HEAD` is unset — it exits non-zero **and prints the literal string
`origin/HEAD` to stdout** (verified in this repo: exit 128, stdout = `origin/HEAD`).
An agent that keys off "the value" rather than the exit code captures `origin/HEAD`
as BASE; every later `git diff origin/HEAD...HEAD` then fails with "unknown revision"
and the review silently produces an empty diff instead of falling through to the
`main`/`master` local fallback.
**Repro:** Run in any repo where `origin/HEAD` is unset (`git remote set-head origin -d`
to reproduce). BASE resolves to the bogus ref `origin/HEAD` instead of `master`.
**Fix direction:** Step 2 rule 1 must condition on exit code 0 AND output not being
the literal `origin/HEAD` before accepting it as BASE.

### 2. Empty-scope message can fire on a populated branch when base resolution is off
**Severity:** Minor
**Location:** `plugins/isoft-pre-pr-review/skills/isoft-pre-pr-review/SKILL.md` — Step 3
**What breaks:** Combined with finding #1, a mis-resolved base makes
`BASE...HEAD` empty, so Step 3 reports "No changes to review" even when committed
changes exist. Largely intended behavior under ADR-0001, but a sanity cross-check
would prevent a confusing false negative.
**Fix direction:** Cross-check `git log BASE..HEAD` count before declaring
"nothing to review."

---
## Handoff Summary
- Blockers: 0 · Should-fix: 1 · Minor: 1
**Ready to hand off? — With fixes.**
Resolve finding #1 (base-resolution exit-code check) before opening the PR.
