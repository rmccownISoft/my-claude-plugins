# Handoff — `bobs-pr-review` silent run (no comments posted)

_Date: 2026-10-29 · Repo under review: `isoft-employee-client` · PR #45 (`DOPS-320-choose-release-type-revisited`) · Run `40942563292`_

## Symptom

The GitHub Action run completed **successfully** but posted **nothing** to PR #45 — no inline
comments, no review, and not even the mandatory Handoff Summary comment (SKILL.md step 8b, which is
supposed to post "always … the one guaranteed sign that the review ran").

## Verified facts

- Result block: `subtype: success`, `is_error: false`, `num_turns: 12`, `permission_denials_count: 0`,
  cost ~$1.11, model `claude-opus-5-5`. No crash, no timeout, no denied tool.
- Final action step logged **`No buffered inline comments`** → `create_inline_comment` was never called.
- PR #45 has 0 issue comments, 0 reviews, 0 inline review comments (checked via `gh api`).
- **The posting machinery works in this repo.** `claude[bot]` posted Handoff Summaries on PRs #43, #42,
  #40 (all "✅ No findings"). So auth / GitHub App token / `gh pr comment` are all fine here.
- #45 is **small and unremarkable**: 5 files, +204/−94, base `master`, 5 commits. Comparable turn count
  to the clean runs (they were 9–11; #45 was 12), so it did roughly the same amount of work then stopped
  without posting.
- Workflow + plugin are **identical in 4 other repos and work fine there** (per repo owner).
- Full SDK transcript was **not** captured (`show_full_output` was unset; no output artifact uploaded),
  so the actual reasoning / tool-call sequence for this run is unrecoverable.

## Ruled out

- Skill bug (works in 4 other repos).
- Repo / auth / token problem (other PRs here posted fine).
- Diff scale or "too large" (only 5 files).
- "First PR with findings ever" (other repos have presumably posted inline comments on real findings).

## Leading hypothesis (UNVERIFIED)

A **non-deterministic, one-off model-adherence miss**: on this single run the model completed the
review (reviewers ran, assembly happened) but skipped SKILL.md **step 8** entirely — never calling the
inline tool and never posting the summary — then reported success. No structural or data-specific cause
unique to #45 was found. If true, a re-trigger should post normally.

## Unverified assumptions / caveats

- Assuming the 4 other repos have actually exercised the **inline-posting path (8a)** on PRs with real
  findings, not just the summary path on clean PRs. Not confirmed — worth checking before concluding the
  inline path is proven elsewhere.
- Assuming the reviewers _did_ return findings on #45 (inferred from 12 turns / $1.11, not seen directly).
- Cannot distinguish "skipped step 8 up front" vs "entered 8a, failed to anchor an inline comment, bailed
  out of the whole step before 8b" without the transcript.
- The latent structural fragility still stands as a _contributing_ risk, even if not the trigger here:
  step 8 nests the always-post summary (8b) **inside** the same step as inline posting (8a), and the step
  is skipped wholesale on a negative "is this a live PR?" judgment — so any 8a hiccup or misjudgment
  swallows the summary too, and the run still reports success.

## Recommended next steps

1. **Re-trigger #45** — close & reopen the PR (no `synchronize` trigger, so a push won't fire it). If it
   posts normally → confirms transient one-off.
2. Diagnostic already staged in `isoft-employee-client`: `show_full_output: true` added to
   `.github/workflows/claude-pr-review.yml` (pending merge on the DOPS-320 branch). If #45 misses again,
   that run's transcript pinpoints where step 8 stopped.
3. **Possible hardening (only if it reproduces or recurs):** reorder SKILL.md step 8 so the Handoff
   Summary (8b) posts **first and unconditionally** whenever a PR number resolves, decoupled from the
   inline-comment path — so inline-anchoring trouble can never suppress the proof-of-life summary.
