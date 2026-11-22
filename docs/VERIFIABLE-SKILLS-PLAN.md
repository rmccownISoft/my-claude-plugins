# Verifiable Skills — plan & checklist

**Status:** backburner (mentally parked for months), intend to start.
**Owner:** Robert McCown
**Goal:** move my plugins toward real evals, tests, and deterministic behavior — so a change is *reviewable* and its effect is *measurable*, not taken on faith.

## Why this exists

A markdown skill is a *prompt*, not code. Left unstructured, the reviewable surface (the prose) has no behavioral test, and the tested surface (scripts) is the part a human can't easily vet. The point of this effort is to invert that: push as much of each skill as possible into a layer that can be tested, and shrink the un-testable judgment surface to the smallest honest remainder.

This is **not** an argument for more scaffolding. Complexity a reviewer can't follow, with no behavioral test, isn't rigor — it's unfalsifiable surface area. Keep skills reviewable in one sitting.

## The core principle

> Push the boundary between **"deterministic and tested"** and **"left to model judgment"** as far toward the former as the task allows — and be explicit about the remainder.

## The failure mode we're defending against

**Confident narrative completion.** Given a report/output shape, the model will produce a fluent, plausible, well-structured result *whether or not the underlying work happened*. A bare "here's the template, fill it out" is the *maximal* version of this failure, not the minimal-complexity baseline — empty-looking slots beg to be filled, so the model fabricates to complete them. The job of good structure is to break narrative completion by forcing externally-visible actions and checkable evidence.

## The checklist

Hold every one of my skills to this. Each item names **what to test**.

1. **Explicit argument contract.** Arguments are parsed and validated in one place with a defined grammar and real error messages — not left to the model to "figure out" from an `argument-hint`. (Hints are documentation; they don't parse, validate, or error. Inference-only args are the first thing to break on a weaker model.)
   - *Test:* good inputs parse to the expected structure; bad inputs (`--scope=typo`, missing required arg) error and name the valid options. Deterministic, unit-tested.

2. **Deterministic core extracted.** Anything with a correct, computable answer (counts, semver math, file parsing, lookups) lives in testable functions/scripts, never in prose instructions.
   - *Test:* unit tests with fixtures covering normal + edge cases.

3. **Output contract.** The artifact has a checkable shape, enforced by a linter the run must pass before it's shown.
   - *Test:* the linter has its **own** good/bad examples — test the checker, not just *with* it. (A linter with no test is just more untested prose.)

4. **Actions emit artifacts.** Where the model must *do* work, it produces an externally-visible file or command output a check can confirm — so "it happened" is verifiable, not a claimed sentence.
   - *Test:* a completeness assertion over the emitted artifacts (e.g. every input row has a corresponding output row), not a trust in the narrative.

5. **Judgment surface is small and named.** The irreducibly-model parts are few, explicit, and labeled as such, so a reviewer knows exactly where the unverifiable risk lives.
   - *Test:* n/a by code — but it must be *visible*. If you can't point to the judgment steps on one hand, the skill is doing too much in prose.

6. **Reviewable in one sitting.** If a human can't hold the whole skill in their head, that's the smell, not a feature. Prefer one tight SKILL.md over a sprawling reference tree; prefer a table or code over a prose decision tree.
   - *Test:* a size budget in CI (bytes per file), and new rules must *replace* old text, not accrete.

## Applying it

- **Per-plugin audit.** For each skill, mark every instruction as one of: *deterministic (tested)* / *prose pretending to be a rule* / *genuine judgment*. The middle bucket is the work list — convert each to an argument contract, a script, or an output-linter assertion.
- **Evals where judgment is irreducible.** Don't build a heavyweight grading rubric for everything. For most skills a **golden-output test on a pinned input** is enough: fixed repo/input → run → assert the output contract + a few known-true facts. Reserve full ground-truth rubrics for skills whose whole value is a judgment call (scores, verdicts, plans).
- **Degrade-across-models check.** If a skill is meant to run on Sonnet/Haiku, the determinism and explicitness matter *more*. Test on the weakest target model, not just Opus. "Fine on Opus" hides inference-only args and skipped steps.

## The eval trap to avoid (learned the hard way reviewing others' skills)

A skill's rules are usually justified against the **wrong baseline**: "model did X wrong with no rule → added rule." That compares *rule vs nothing*. It never compares *this rule vs a lean template + the deterministic scripts + a few forcing instructions*. Without that control group, a skill accretes inert prose nobody can tell from the load-bearing prose.

When evaluating whether structure is worth its cost:
- Build the **lean baseline** (template + scripts + a handful of "run this, don't describe it" rules).
- A/B it against the full version on the pinned inputs, **N runs each**.
- A single run can't separate a real improvement from model variance — compare the grade delta against the **run-to-run variance band**. A change inside the band is not a result.

Prose edits to a prompt are only verifiable *statistically*. Until there's an ablation like this, a markdown-skill change is unfalsifiable judgment — fine to make, but don't mistake it for a tested change.

## First moves (when I pick this up)

1. Pick the one skill I use most in `my-claude-skills` and do the per-plugin audit (three-bucket pass).
2. Extract its argument contract into a tested parser. (Smallest, highest-leverage, most reusable.)
3. Write its output linter + the linter's own tests.
4. Stand up one golden-output test on a pinned input in CI.
5. Only then decide whether a full eval rubric is worth it for that skill.

---

*Companion context: the two plugin repos I work in are noted in Claude memory (`plugin-repos`): `my-claude-skills` (this repo, personal) and `claude-plugins` (org, shared).*
