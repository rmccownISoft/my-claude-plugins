# Pre-PR Review — verify / test / compare plan (handoff 2 of 2)

**Date:** 2026-09-24
**Repo:** `my-claude-plugins`
**Companion doc:** `PRE-PR-REVIEW-SCRIPT-MIGRATION.md` (what to change)
**Status:** Plan only. Self-contained — a clean session can execute this. It
assumes the migration doc's `assemble.mjs` and schema exist in your renamed skill.

---

## 0. The goal, and the trap to avoid

You're building evidence to justify moving logic from markdown into scripts, to
teammates. **Measure the thing the migration actually changes.**

The migration does **not** touch the reviewer prompts, so *detection quality*
(which bugs get found) should stay flat. If you lead with a bug-detection recall
number and it's unchanged, a skeptic says "so the rewrite bought us nothing." That
measures the wrong axis. Lead with the axes below.

| Axis | Does the migration change it? | Expected | Tier |
|---|---|---|---|
| **Assembly correctness** (counts, verdict, no omissions, no fabricated lines) | **Yes** — moved to code | markdown drifts; script ≈ 100% | 1 |
| **Consistency** (same input → same output) | **Yes** | markdown varies run-to-run; script identical | 1 |
| **Cost** (token proxy) | **Yes** | script lower | 2 |
| **Speed** | **Yes** | script faster | 2 |
| **Detection recall/precision** | No | ~flat (report it to prove "no regression") | 2 |

The winning sentence: **"same detection quality, but the report is always correct,
always identical, cheaper, and faster."**

---

## 1. Tier 1 — assembly unit tests (free, deterministic — do first)

This is the cheapest and most persuasive artifact. It isolates the exact step you
migrated, costs **zero tokens**, and a teammate can run it in seconds. It proves
correctness *and* consistency in one shot.

### Layout

```
<skill-dir>/scripts/
  assemble.mjs
  assemble.test.mjs          ← node --test
  fixtures/
    many-findings.json          + many-findings.expected.md
    cross-reviewer-dupes.json   + cross-reviewer-dupes.expected.md
    could-not-run.json          + could-not-run.expected.md
    all-clean.json              + all-clean.expected.md
```

Pick fixtures that are exactly where markdown assembly drifts:
- **many-findings** — several findings across all six reviewers (counting stress).
- **cross-reviewer-dupes** — the same defect flagged by two reviewers (the summary
  must list both, not merge them).
- **could-not-run** — Conventions could-not-run → `n/a` across its row.
- **all-clean** — no findings → verdict `Yes`.

Each `.expected.md` is the **one** correct assembled report for that input — the
ground truth.

### The test

`assemble.test.mjs` runs the script on each fixture and asserts the output matches
the expected report exactly. Sketch (Node's built-in test runner — no deps):

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = "<scratch-repo-with-cited-files>"; // so citation resolution passes

for (const name of ["many-findings", "cross-reviewer-dupes", "could-not-run", "all-clean"]) {
  test(name, () => {
    const out = execFileSync("node", [
      path.join(HERE, "assemble.mjs"),
      "--input", path.join(HERE, "fixtures", `${name}.json`),
      "--repo", REPO, "--base", "HEAD",
      "--branch", "test", "--commits", "1", "--files", "1", "--ticket", "none"
    ], { encoding: "utf8" });
    const { report } = JSON.parse(out);
    const expected = fs.readFileSync(path.join(HERE, "fixtures", `${name}.expected.md`), "utf8").trimEnd();
    assert.equal(report, expected);
  });
}
```

Run: `node --test scripts/`. Add negative tests too: assert the script **throws**
on a Conventions finding without `entryId` and on an absolute path, and that a
line past EOF shows up in `unresolved`.

### The consistency demo (the slide that wins the room)

Run the OLD markdown Step-6 assembly on one hard fixture **5 times** (paste the
reviewer outputs to the model with the old prose, no script). Capture the 5
tables. Then run `assemble.mjs` on the same input 5 times. Present side by side:

> Markdown assembly: 5 runs → 5 different tables (counts/verdict drift).
> Script assembly: 5 runs → byte-identical every time.

That contrast, with zero token cost on the script side, is the core argument.

---

## 2. Tier 2 — end-to-end A/B with `claude plugin eval`

Claude Code ships a native harness. It runs **cases** (a prompt + graders) N times
in a clean sandbox and writes JSON. Use it to compare the whole skill, markdown
version vs script version, on a real repo.

### Ground truth: a golden test repo with planted defects

Build a small fixed repo (or a fixed branch diff) where **you planted the defects
and know them**:

```
<golden-repo>/
  ...source with N known defects...
  defects.manifest.json   # [{ id, file, line, category, severity }]
```

The manifest is what graders check against: did the review surface each planted
defect, and is the verdict right?

### Case layout

```
plugins/<your-plugin>/evals/review-golden/
  prompt.md          # frontmatter: model, runs, allowed_tools, timeout_seconds
                     # body: the user request that invokes your skill against <golden-repo>
  graders/
    skill-fired.md   # type: tool_used   — assert the skill ran (asserts EXACT <skill-name>)
    verdict.md       # type: regex        — the correct "Ready to hand off? — X" string
    every-blocker.md # type: regex        — each planted-blocker marker present
    no-fabrication.md# type: regex        — (optional) no absolute paths / obvious fabricated cite
    detection.md     # type: llm          — fuzzy: did it find the planted defects
  case.yaml          # optional: fixtures / env (env keys must be EVAL_*)
```

Grader types (verify against your installed Claude Code version):

| Grader | Passes when | Model call? | Use for |
|---|---|:--:|---|
| `regex` | pattern matches / not-contains / exact count | No (free) | verdict string, each planted marker present |
| `tool_used` | tool/skill invoked (optional input pattern) | No (free) | assert the skill fired |
| `tool_order` | tool A before tool B | No (free) | gather → dispatch → assemble order |
| `file_exists` | a created file matches a glob | No (free) | the report file landed |
| `llm` | judge model votes PASS (≥2 of 3) | Yes | detection quality (fuzzy) |
| `baseline` | as good as a reference transcript | Yes | regression vs a saved good run |

Put the **assembly-correctness** checks on the free deterministic graders; reserve
`llm` for the fuzzy detection axis.

### Running the A/B (important nuance)

The eval's *default* compares **with-plugin vs. without-plugin** (`meanDelta`) —
that answers "does the plugin help at all", NOT "is the script version better than
the markdown version." For your comparison both arms are with-plugin, so run the
same suite against each version with `--ablation none` and compare the two JSON
files. Use git worktrees (or `--plugin-dir`) to hold both versions at once:

```bash
git worktree add ../fork-markdown  <markdown-branch>   # pre-migration skill
git worktree add ../fork-script    <script-branch>     # post-migration skill

claude plugin eval ../fork-markdown/plugins/<plugin> \
  --ablation none --runs 5 \
  --model claude-sonnet-5 --judge-model claude-haiku-4-5 \
  --json /tmp/A.json --trust-plugin --no-publish --max-cost-usd 30

claude plugin eval ../fork-script/plugins/<plugin> \
  --ablation none --runs 5 \
  --model claude-sonnet-5 --judge-model claude-haiku-4-5 \
  --json /tmp/B.json --trust-plugin --no-publish --max-cost-usd 30
```

Compare from each JSON: `aggregates.overallScore`, `costUsd`, `durationSeconds`,
and `cases[].aggregates.score`.

### CLI + JSON reference (verify vs your installed version)

- Flags: `--trust-plugin`, `--json [path]`, `--no-publish`, `--ablation none|with-without`,
  `--runs <n>`, `--threshold 0..1` (default 1.0), `--case <glob>`, `--tag <tag>`,
  `--plugin-dir <path>`, `-j/--concurrency 1-8`, `--max-cost-usd <usd>`, `--model`,
  `--judge-model`, `--output-dir <dir>`.
- Exit codes: `0` all-pass · `1` below-threshold / load error / no cases /
  untrusted-without-`--trust-plugin` · `2` partial (cost ceiling / auth) · `130`
  interrupted · `143` timeout.
- JSON: `schemaVersion`, `aggregates` (`overallScore`, `casesPassed`, `casesTotal`,
  `meanDelta`), `cases[]` (`name`, `aggregates.score`, `aggregates.delta`,
  `arms.with[]` / `arms.without[]` with per-run `graders[]`), `costUsd`,
  `durationSeconds`, `claudeVersion`.

## 3. The token caveat (matters — token count was a goal)

The eval JSON exposes **`costUsd`** (a list-price *estimate*) and
**`durationSeconds`** (suite-level) but **NOT per-run input/output/cache token
counts.** Three ways to get a token story anyway:

| Want | Use |
|---|---|
| Good-enough proxy | `costUsd` from the eval JSON — lower cost ≈ fewer tokens, and it's what you pay. Arguably the better number to show teammates. |
| Real per-skill tokens | `/skill-doctor` — reports tokens & uses per skill over a 7-day window |
| Exact headless token fields | run `claude -p "…" --output-format json` once and inspect its `usage` metadata (field names undocumented — verify empirically before relying on them) |

Per-run *timing* likewise isn't a JSON field; derive it from `durationSeconds`
divided by `runs × cases × arms`, or time the run yourself.

## 4. Handling nondeterminism honestly

A single run of each version proves nothing — a good reviewer will say so.

- **Run each version N times** (start 5–10), **same `--model` and `--judge-model`**.
- There is **no `--seed`**; you cannot force identical model output.
- **Report mean ± standard deviation**, not single numbers. Low variance on the
  script side is itself a result you're selling (Tier 1 shows variance = 0 for
  assembly).

## 5. How to present the results

One table your team can't argue with (fill from Tier 1 + Tier 2):

| Metric | Markdown (A) | Script (B) | Source |
|---|---|---|---|
| Assembly exact-match (Tier 1) | e.g. 6/10 | **10/10** | `node --test` |
| Output identical across 5 runs | No (5 variants) | **Yes** | Tier 1 consistency demo |
| Fabricated citations | e.g. 2.3 avg | **0** | eval regex / `unresolved` |
| Recall vs planted defects | 0.8x ± σ | 0.8x ± σ | eval `llm` grader (should be ~flat) |
| Cost / run | $X | **$<X** | eval `costUsd` |
| Wall-clock / run | Xs | **<Xs** | eval `durationSeconds` |

Lead with rows 1–3 (correctness + consistency), show row 4 to prove *no
regression*, close with rows 5–6 (cheaper + faster).

## 6. First move from a clean session

> Read this doc and its companion. Do **Tier 1 first** (§1): it's free, deterministic,
> and the strongest artifact — write `assemble.test.mjs` + a few `fixtures/*.json`
> with matching `*.expected.md`, run `node --test scripts/`, and capture the
> markdown-vs-script consistency demo. Only then build the Tier 2 golden repo and
> `claude plugin eval` suite (§2). Pin `<skill-name>` (migration doc D0) before
> writing the `tool_used` grader. Expect to verify the CLI flags / JSON fields (§2)
> against your installed Claude Code version.
