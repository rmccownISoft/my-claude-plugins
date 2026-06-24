# Reviewer line-number drift — findings & recommendations

_Context: first real run of `isoft-pre-pr-review` (against `enterprise-api` @ `oauth-support`,
2026-06-24). The reviewers found genuine issues, but four cited `file:line` locations were
wrong. The assembly-stage validation (SKILL.md step 6.3) caught and corrected all four before
they reached the report, so the gate held — but the underlying cause is worth fixing in the
reviewer prompts._

## What happened

Four cited line numbers were wrong, all from the Security and Potential Bugs reviewers:

| Finding | Cited | Actual | Drift |
|---|---|---|---|
| Security #2 — default `CLIENT_SECRET` | `env.ts:558` | `env.ts:104` | +454 |
| Security #2 — `getClient` (secondary ref) | `enterprise-auth-model.ts:340` | `:37` | +303 |
| Security #2 — `CLIENT_SECRET` use (secondary ref) | `server.ts:704` | `:191` | +513 |
| Potential Bugs #2 — falsy-`0` guard | `oauth-authenticator.ts:202` | `:55` | +147 |

The **descriptions, snippets, and reasoning were all correct** — only the line numbers were off.

## Root cause

The drift is **systematic and one-directional** — every wrong cite was inflated, several by
hundreds of lines. That rules out random hallucination and points to a method problem:

- The reviewers inferred line numbers from `git diff` output rather than from the actual files.
- A diff hunk header (`@@ -x,y +a,b @@`) only gives the hunk's *start* line. To cite a specific
  line, the model counts forward through context + added lines.
- Across an 88-commit diff (much of it `package-lock.json` noise), that forward-counting
  accumulates error — and it drifts *up* because the running offset only grows.

The existing prompt rule ("never estimate or invent a line; a fabricated `file:line` is worse
than none") **did not prevent this**, because the model isn't knowingly inventing — it believes
it counted correctly. The fix has to change the *method*, not restate the prohibition.

## Recommendations (priority order)

### 1. Line numbers must come from the file, never from the diff — HIGHEST LEVERAGE
The reviewers all have Read/Bash. Add an explicit step to each reviewer prompt:

> When you have a finding, do NOT take the line number from the diff hunk. Obtain it by running
> `grep -n '<a unique substring of the offending line>' <file>` (or Read the file) and use the
> absolute line number that returns. The diff tells you *what* changed; the file tells you
> *where it is now*.

This alone should eliminate the drift — `grep -n` against the working tree is exactly what the
assembly step did to catch it.

### 2. Make the quoted snippet mandatory, not a fallback
The prompts currently say "quote the snippet *if unsure* of the line." Flip it: require **both**
a line number **and** a verbatim snippet on every finding.

- A snippet is self-validating (assembly can string-match it); a bare line is not.
- This turns step-6.3 validation from "re-derive the location" (what the orchestrator had to do
  — re-running greps by hand) into a cheap `grep -F` of the quoted string. Less assembly work,
  no judgment call.

### 3. Add a one-line self-check to each reviewer's hard rules

> Before writing any `file:line`, confirm it: the quoted text must appear on that exact line in
> the current file. If your grep disagrees with your diff-based guess, the grep wins.

### 4. (Optional, structural) Reviewers cite snippet-only; assembly resolves the line
The most robust version: reviewers cite `file` + verbatim snippet with **no line number**, and
the orchestrator resolves every line via `grep -n` at assembly time. Single source of truth,
drift becomes impossible. Bigger change (touches all five reviewer prompts *and* SKILL.md step
6), so hold in reserve — only worth it if drift recurs after 1–3.

## Suggested rollout

- Ship **#1, #2, #3** now: small, surgical edits to the five `reviewers/*.md` files and the
  shared "Cross-cutting rules" block in `SKILL.md`.
- Keep **#4** in reserve.
- This is a one-time correctness fix to the skill — no future obligation to track.

## Files involved

- `plugins/isoft-pre-pr-review/skills/isoft-pre-pr-review/SKILL.md` — cross-cutting rules block
  (rule 2, "Evidence required") and step 6.3 (location validation)
- `plugins/isoft-pre-pr-review/skills/isoft-pre-pr-review/reviewers/security.md`
- `plugins/isoft-pre-pr-review/skills/isoft-pre-pr-review/reviewers/bugs.md`
- `plugins/isoft-pre-pr-review/skills/isoft-pre-pr-review/reviewers/tests.md`
- `plugins/isoft-pre-pr-review/skills/isoft-pre-pr-review/reviewers/documentation.md`
- `plugins/isoft-pre-pr-review/skills/isoft-pre-pr-review/reviewers/lint-format.md` (no
  file:line citations — unaffected)
