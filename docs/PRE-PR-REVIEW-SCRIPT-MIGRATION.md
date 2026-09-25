# Pre-PR Review — script-extraction plan (handoff 1 of 2)

**Date:** 2026-09-24
**Repo:** `my-claude-plugins`
**Companion doc:** `PRE-PR-REVIEW-EVAL-PLAN.md` (how to verify / test / compare)
**Status:** Plan only. Self-contained — a clean Claude session can execute this
with no prior conversation and no other repo. Every file you need is embedded here.

---

## 0. Assumptions (what you've already done by hand)

- You have **manually copied the canonical 6-reviewer pre-PR reviewer** into this
  repo and **renamed** it to your own plugin/skill name.
  - Canonical source = the `isoft-dev` plugin's `pre-pr-review` skill (6 reviewers:
    Security, Potential Bugs, Tests, Documentation, Lint & Format, Conventions).
    NOT this repo's older 4-reviewer demo, and NOT any stale clone.
- Throughout this doc, `<skill-dir>` = the skill's directory in your copy, and
  `<skill-name>` = the invocable skill name (e.g. `your-plugin:your-skill`). Pin
  `<skill-name>` now — the eval graders (doc 2) assert on it exactly. **Decision D0.**
- All work happens on a **branch** in this repo.

## 1. Why (the case you're making)

The reviewer's `SKILL.md` (~596 lines, 6 reviewers) is markdown orchestrating six
subagents. Across many hands it began **hallucinating** (inventing file lists /
line numbers), **ignoring rules** buried in prose, and became **hard to review.**
Root cause, one line:

> **Markdown instructions are *suggestions* to a probabilistic model; script logic is a *guarantee*.**

All three symptoms are the same mistake: asking an LLM to do deterministic work
(gathering, counting, validating, rendering) in prose.

## 2. The decision framework

| Test | If yes → |
|---|---|
| Same input should always give the same output? | **Script** |
| Requires reading code and forming a judgment? | **Prompt** (keep in `reviewers/*.md`) |
| A rule that must *never* be skipped? | A **script must enforce it** — prose can't guarantee it |

**The "tell":** any bolded MUST / NEVER / "counts may not drift" / "do not omit"
in an orchestration file is a script trying to be born. The reviewer prompts are
genuine judgment — **leave them as prompts.**

Where each `SKILL.md` step lands:

| Step | Kind | Target |
|---|---|---|
| 1–4 Gather context / base / scope / diff stats | deterministic | → `gather.mjs` (later) |
| 5 Dispatch reviewers | orchestration | stays in `SKILL.md` (only the agent can spawn subagents) |
| 6 Assemble (count/table/verdict/validate/render) | deterministic | **→ `assemble.mjs` (this doc)** |
| 7–8 Choose destination / write / post | mixed | validation → script later; the ask + PR posting stay |

## 3. Build step A — the schema (keystone)

Reviewers emit **markdown** today, so the orchestrator must *parse prose to count
it* — the source of count-drift and omission bugs. Give findings a schema and
counting/verdict/omission become tiny pure functions.

Create `<skill-dir>/schemas/reviewer-output.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://isoftdata.com/pre-pr-review/reviewer-output.schema.json",
  "title": "Pre-PR Review — reviewer output",
  "description": "The structured result ONE reviewer subagent returns. assemble.mjs consumes an array of these and derives all counts, the verdict, and the rendered report.",
  "type": "object",
  "required": ["reviewer", "status", "findings"],
  "additionalProperties": false,
  "properties": {
    "reviewer": {
      "description": "Drives section order + whether it can carry a Blocker.",
      "enum": ["security", "bugs", "tests", "documentation", "lint-format", "conventions"]
    },
    "status": { "enum": ["ran", "could-not-run"] },
    "couldNotRunReason": { "type": ["string", "null"] },
    "findings": { "type": "array", "items": { "$ref": "#/$defs/finding" } },
    "strengths": { "type": "array", "items": { "type": "string" } },
    "notes": {
      "description": "Free-text notes shown verbatim under the reviewer's section (e.g. Conventions' scope-fallback note). Not findings.",
      "type": "array", "items": { "type": "string" }
    },
    "tests": {
      "description": "Tests reviewer only — feeds the status line.",
      "type": "object", "additionalProperties": false,
      "properties": {
        "ran": { "type": "string" }, "result": { "type": "string" },
        "status": { "enum": ["pass", "fail", "none", "could-not-run"] }
      }
    },
    "lint": {
      "description": "Lint & Format reviewer only — feeds the status line.",
      "type": "object", "additionalProperties": false,
      "properties": { "eslint": { "type": "string" }, "prettier": { "type": "string" } }
    }
  },
  "allOf": [
    {
      "if": { "properties": { "status": { "const": "could-not-run" } } },
      "then": { "required": ["couldNotRunReason"], "properties": { "findings": { "maxItems": 0 } } }
    }
  ],
  "$defs": {
    "finding": {
      "type": "object",
      "required": ["severity", "title", "what"],
      "additionalProperties": false,
      "properties": {
        "severity": { "enum": ["blocker", "should-fix", "minor"] },
        "title": { "type": "string" },
        "file": { "description": "Repo-relative; NEVER absolute; null only if snippet-only.", "type": ["string", "null"] },
        "line": { "description": "1-based, or null when unknown (then snippet set). assemble.mjs verifies it resolves.", "type": ["integer", "null"], "minimum": 1 },
        "snippet": { "type": ["string", "null"] },
        "what": { "type": "string" },
        "evidence": { "type": ["string", "null"] },
        "fix": { "description": "Optional one-line direction; never a rewrite.", "type": ["string", "null"] },
        "entryId": { "description": "Conventions only: the codex standard id. Required for Conventions findings; null otherwise.", "type": ["string", "null"] },
        "standardSeverity": { "description": "Conventions only: cited entry's severity.", "enum": ["blocking", "advisory", null] },
        "type": { "description": "Tests only: 'Failing test' | 'Uncovered change' | ...", "type": ["string", "null"] },
        "deleted": { "description": "Cited code was DELETED — assemble.mjs resolves against BASE (git show BASE:path).", "type": "boolean", "default": false }
      },
      "anyOf": [
        { "required": ["file"], "properties": { "file": { "type": "string" } } },
        { "required": ["snippet"], "properties": { "snippet": { "type": "string" } } }
      ]
    }
  }
}
```

## 4. Build step B — `assemble.mjs`

Create `<skill-dir>/scripts/assemble.mjs` with the code below verbatim. It:
1. **validates** the array (bad output fails LOUDLY — a Conventions finding
   missing `entryId`, or an absolute path, throws a named error + non-zero exit),
2. **resolves** every cited `file:line` against the tree (or BASE for deletions),
   returning an `unresolved` list (a line past EOF → `line 999 out of range
   (1..N)`, not passed through),
3. **counts** by severity per reviewer + totals,
4. **computes** the verdict,
5. **renders** the report markdown in `SKILL.md`'s shape.

It makes **no judgments** — it hands back `unresolved` for the agent to
relocate-or-drop, then the agent re-runs. Verdict rules live in `REVIEWER_META`:
security/bugs/tests/conventions can raise a Blocker; documentation/lint-format cap
at Should-fix (render `n/a` in the Blockers column). **Decision D1:** whether Tests
can Blocker is `REVIEWER_META.tests.canBlock` — canonical says yes (a failing
in-scope test blocks); flip it if your team disagrees.

```javascript
#!/usr/bin/env node
// Pre-PR Review — deterministic assembly.
//
// Replaces the hand-counted parts of SKILL.md Step 6. Given an array of
// reviewer results (each matching schemas/reviewer-output.schema.json), this:
//   1. validates the shape (bad reviewer output fails LOUDLY, not silently),
//   2. resolves every cited file:line against the tree (or BASE for deletions),
//   3. counts findings by severity per reviewer + totals,
//   4. computes the Ready-to-hand-off verdict,
//   5. renders the full report markdown in the exact shape SKILL.md specifies.
//
// It does NOT make judgments (is-this-really-a-refactor, relocate-vs-drop) —
// those stay with the main agent, which acts on the `unresolved` list this
// returns and re-runs. Determinism here; judgment there.
//
// Usage:
//   node assemble.mjs --input <results.json> [--repo <dir>] [--base <ref>] \
//                     [--branch <name>] [--commits N] [--files N] [--ticket KEY]
//   ...or pipe the results JSON on stdin instead of --input.
//
// Output: JSON { verdict, counts, report, unresolved } on stdout.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

// Section order + display names, and which reviewers can carry a Blocker.
// Documentation and Lint & Format cap at Should-fix, so their Blockers column
// renders `n/a` and they can never flip the verdict to "No".
const REVIEWER_META = {
  security: { name: "Security Issues", short: "Security", canBlock: true },
  bugs: { name: "Potential Bugs", short: "Potential Bugs", canBlock: true },
  tests: { name: "Tests", short: "Tests", canBlock: true },
  documentation: { name: "Documentation", short: "Documentation", canBlock: false },
  "lint-format": { name: "Lint & Format", short: "Lint & Format", canBlock: false },
  conventions: { name: "Conventions", short: "Conventions", canBlock: true }
};
const ORDER = Object.keys(REVIEWER_META);
const SEVERITIES = ["blocker", "should-fix", "minor"];

// ---- input ---------------------------------------------------------------

function parseCliArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        opts[key] = true;
      } else {
        opts[key] = next;
        i += 1;
      }
    }
  }
  return opts;
}

function readInput(opts) {
  const raw = opts.input
    ? fs.readFileSync(path.resolve(String(opts.input)), "utf8")
    : fs.readFileSync(0, "utf8"); // fd 0 = stdin
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("Input must be a JSON array of reviewer results.");
  }
  return parsed;
}

// ---- validation ----------------------------------------------------------
// Lightweight structural check of the rules that matter. A production version
// could swap this for ajv against reviewer-output.schema.json; kept dependency
// free here so the plugin needs no install step.

function validate(results) {
  const errors = [];
  const seen = new Set();
  for (const [i, r] of results.entries()) {
    const at = `results[${i}]`;
    if (!REVIEWER_META[r?.reviewer]) {
      errors.push(`${at}.reviewer "${r?.reviewer}" is not a known reviewer.`);
      continue;
    }
    if (seen.has(r.reviewer)) errors.push(`${at}: duplicate reviewer "${r.reviewer}".`);
    seen.add(r.reviewer);

    if (r.status !== "ran" && r.status !== "could-not-run") {
      errors.push(`${at}.status must be "ran" or "could-not-run".`);
    }
    if (r.status === "could-not-run") {
      if (!r.couldNotRunReason) errors.push(`${at}: could-not-run requires couldNotRunReason.`);
      if (Array.isArray(r.findings) && r.findings.length) {
        errors.push(`${at}: a could-not-run reviewer must not carry findings.`);
      }
      continue;
    }
    if (!Array.isArray(r.findings)) {
      errors.push(`${at}.findings must be an array.`);
      continue;
    }
    for (const [j, f] of r.findings.entries()) {
      const fat = `${at}.findings[${j}]`;
      if (!SEVERITIES.includes(f?.severity)) errors.push(`${fat}.severity invalid.`);
      if (!f?.title) errors.push(`${fat}.title required.`);
      if (!f?.what) errors.push(`${fat}.what required.`);
      if (!f?.file && !f?.snippet) errors.push(`${fat}: needs file or snippet.`);
      if (typeof f?.file === "string" && path.isAbsolute(f.file)) {
        errors.push(`${fat}.file must be repo-relative, not absolute: ${f.file}`);
      }
      if (r.reviewer === "conventions" && !f?.entryId) {
        errors.push(`${fat}: Conventions findings must cite an entryId.`);
      }
    }
  }
  if (errors.length) {
    throw new Error(`Reviewer output failed validation:\n- ${errors.join("\n- ")}`);
  }
}

// ---- citation resolution -------------------------------------------------
// Deterministic replacement for "validate every cited location" (Step 6.3).
// Returns findings whose file:line does not resolve, for the agent to relocate
// or drop. A finding with no line (snippet only) is not checked here.

function fileLineCount(repo, file) {
  const abs = path.resolve(repo, file);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, "utf8").split(/\r?\n/).length;
}

function deletedFileLineCount(repo, base, file) {
  try {
    const out = execFileSync("git", ["show", `${base}:${file}`], { cwd: repo, encoding: "utf8" });
    return out.split(/\r?\n/).length;
  } catch {
    return null;
  }
}

function resolveCitations(results, { repo, base }) {
  const unresolved = [];
  for (const r of results) {
    if (r.status !== "ran") continue;
    for (const f of r.findings) {
      if (!f.file || f.line == null) continue; // snippet-only: not line-checked
      const total = f.deleted
        ? deletedFileLineCount(repo, base, f.file)
        : fileLineCount(repo, f.file);
      const ok = total != null && f.line >= 1 && f.line <= total;
      if (!ok) {
        unresolved.push({
          reviewer: r.reviewer,
          title: f.title,
          file: f.file,
          line: f.line,
          reason: total == null ? "file not found" : `line ${f.line} out of range (1..${total})`
        });
      }
    }
  }
  return unresolved;
}

// ---- counts + verdict ----------------------------------------------------

function countFor(result) {
  const c = { blocker: 0, "should-fix": 0, minor: 0 };
  if (result.status === "ran") {
    for (const f of result.findings) c[f.severity] += 1;
  }
  return c;
}

function computeVerdict(results) {
  const anyBlocker = results.some(
    (r) => r.status === "ran" && r.findings.some((f) => f.severity === "blocker")
  );
  if (anyBlocker) return "No";
  const anyOther = results.some(
    (r) => r.status === "ran" && r.findings.length > 0
  );
  return anyOther ? "With fixes" : "Yes";
}

// ---- rendering -----------------------------------------------------------

function loc(f) {
  if (f.file && f.line != null) return `\`${f.file}:${f.line}\``;
  if (f.file) return `\`${f.file}\``;
  return "(see snippet)";
}

function renderFinding(f, n) {
  const lines = [`### ${n}. ${f.title}`, ""];
  lines.push(`**Severity:** ${labelSeverity(f.severity)}`);
  lines.push(`**Location:** ${loc(f)}`);
  if (f.entryId) lines.push(`**Standard:** \`[${f.entryId}]\` (${f.standardSeverity ?? "advisory"})`);
  if (f.type) lines.push(`**Type:** ${f.type}`);
  lines.push(`**What's wrong:** ${f.what}`);
  if (f.evidence) lines.push(`**Evidence:** ${f.evidence}`);
  if (f.fix) lines.push(`**Fix direction:** ${f.fix}`);
  return lines.join("\n");
}

function labelSeverity(s) {
  return s === "blocker" ? "Blocker" : s === "should-fix" ? "Should-fix" : "Minor";
}

function renderSection(result) {
  const meta = REVIEWER_META[result.reviewer];
  if (result.status === "could-not-run") {
    return `## ${meta.name} _n/a_\n\n_Reviewer could not run: ${result.couldNotRunReason}_`;
  }
  const parts = [`## ${meta.name} _${result.findings.length} findings_`, ""];
  if (result.findings.length === 0) {
    parts.push("_No issues identified._");
  } else {
    parts.push(result.findings.map((f, i) => renderFinding(f, i + 1)).join("\n\n"));
  }
  for (const note of result.notes ?? []) parts.push(`\n_${note}_`);
  return parts.join("\n");
}

function cell(value, canBlock, ran, severity) {
  if (!ran) return "n/a";
  if (severity === "blocker" && !canBlock) return "n/a";
  return String(value);
}

function renderTable(byReviewer) {
  const rows = [
    "| Reviewer       | Blockers | Should-fix | Minor |",
    "| -------------- | :------: | :--------: | :---: |"
  ];
  const totals = { blocker: 0, "should-fix": 0, minor: 0 };
  for (const reviewer of ORDER) {
    const entry = byReviewer[reviewer];
    if (!entry) continue;
    const { meta, counts, ran } = entry;
    for (const s of SEVERITIES) if (ran) totals[s] += counts[s];
    rows.push(
      `| ${meta.short.padEnd(14)} | ${cell(counts.blocker, meta.canBlock, ran, "blocker").padStart(5)}    ` +
        `| ${cell(counts["should-fix"], meta.canBlock, ran, "should-fix").padStart(6)}     ` +
        `| ${cell(counts.minor, meta.canBlock, ran, "minor").padStart(3)}   |`
    );
  }
  rows.push(
    `| **Total**      |  **${totals.blocker}**   |   **${totals["should-fix"]}**    | **${totals.minor}** |`
  );
  return rows.join("\n");
}

function renderSeverityList(results, severity) {
  const items = [];
  for (const r of results) {
    if (r.status !== "ran") continue;
    for (const f of r.findings) {
      if (f.severity !== severity) continue;
      items.push(`**[${REVIEWER_META[r.reviewer].short}]** ${f.title} — ${loc(f)}`);
    }
  }
  if (!items.length) return "None.";
  return items.map((line, i) => `${i + 1}. ${line}`).join("\n");
}

function renderStatusLine(results) {
  const tests = results.find((r) => r.reviewer === "tests");
  const lint = results.find((r) => r.reviewer === "lint-format");
  const t = tests?.status === "could-not-run" ? "could-not-run" : tests?.tests?.status ?? "none";
  const eslint = lint?.status === "could-not-run" ? "could-not-run" : lint?.lint?.eslint ?? "no config";
  const prettier = lint?.status === "could-not-run" ? "could-not-run" : lint?.lint?.prettier ?? "no config";
  return `Tests: ${t} · ESLint: ${eslint} · Prettier: ${prettier}`;
}

function renderReport(results, meta) {
  const byReviewer = {};
  for (const r of results) {
    byReviewer[r.reviewer] = {
      meta: REVIEWER_META[r.reviewer],
      counts: countFor(r),
      ran: r.status === "ran"
    };
  }

  const strengths = results.flatMap((r) => r.strengths ?? []);
  const verdict = computeVerdict(results);

  const out = [];
  out.push(`# Pre-PR Review — ${meta.branch}`);
  out.push("");
  out.push(`_${meta.commits} commits, ${meta.files} files changed vs ${meta.base}_ · Ticket: ${meta.ticket}`);
  out.push("");
  out.push("## Strengths");
  out.push("");
  out.push(strengths.length ? strengths.map((s) => `- ${s}`).join("\n") : "- None noted.");
  out.push("");
  for (const reviewer of ORDER) {
    const r = results.find((x) => x.reviewer === reviewer);
    if (!r) continue;
    out.push(renderSection(r));
    out.push("");
  }
  out.push("---");
  out.push("");
  out.push("## Handoff Summary");
  out.push("");
  out.push(renderTable(byReviewer));
  out.push("");
  out.push(renderStatusLine(results));
  out.push("");
  out.push("### Must resolve before handoff (every Blocker — do not omit)");
  out.push("");
  out.push(renderSeverityList(results, "blocker"));
  out.push("");
  out.push("### Should fix");
  out.push("");
  out.push(renderSeverityList(results, "should-fix"));
  out.push("");
  out.push(`**Ready to hand off? — ${verdict}.**`);

  return { report: out.join("\n"), verdict, counts: byReviewer };
}

// ---- main ----------------------------------------------------------------

function main() {
  const opts = parseCliArgs(process.argv.slice(2));
  const results = readInput(opts);
  validate(results);

  const repo = path.resolve(String(opts.repo ?? process.cwd()));
  const base = String(opts.base ?? "HEAD");
  const meta = {
    branch: String(opts.branch ?? "HEAD"),
    base,
    commits: opts.commits ?? "?",
    files: opts.files ?? "?",
    ticket: opts.ticket ?? "none"
  };

  const unresolved = resolveCitations(results, { repo, base });
  const { report, verdict, counts } = renderReport(results, meta);

  process.stdout.write(JSON.stringify({ verdict, counts, unresolved, report }, null, 2) + "\n");
}

main();
```

## 5. Build step C — smoke-test it

Create `<skill-dir>/scripts/fixtures/sample-reviewers.json`:

```json
[
  { "reviewer": "security", "status": "ran", "findings": [], "strengths": ["Parameterizes the new SQL query."] },
  { "reviewer": "bugs", "status": "ran", "findings": [
    { "severity": "should-fix", "title": "Empty catch swallows the parse error", "file": "src/parse.ts", "line": 2,
      "what": "A malformed payload is silently treated as {}.", "evidence": "Send `{` — parse throws, catch returns {}." } ] },
  { "reviewer": "tests", "status": "ran", "tests": { "ran": "vitest run src/parse.test.ts", "result": "3 passed, 1 failed", "status": "fail" },
    "findings": [ { "severity": "blocker", "title": "parse() rejects valid input", "file": "src/parse.test.ts", "line": 1,
      "type": "Failing test", "what": "In-scope test fails.", "evidence": "AssertionError: expected {a:1} to equal {}" } ] },
  { "reviewer": "documentation", "status": "ran", "findings": [
    { "severity": "minor", "title": "README documents removed --legacy flag", "file": "README.md", "line": 3, "what": "Flag was deleted." } ] },
  { "reviewer": "lint-format", "status": "ran", "lint": { "eslint": "clean", "prettier": "clean" }, "findings": [] },
  { "reviewer": "conventions", "status": "could-not-run", "couldNotRunReason": "Codex corpus is empty (run `npm run rebuild`).", "findings": [] }
]
```

Run it (point `--repo` at a dir that actually contains `src/parse.ts`,
`src/parse.test.ts`, `README.md` — create a scratch dir with those files, any
content, enough lines to satisfy the cited line numbers):

```bash
cd <skill-dir>
node scripts/assemble.mjs --input scripts/fixtures/sample-reviewers.json \
  --repo <scratch-dir> --base HEAD --branch feature/DEMO --commits 3 --files 4 --ticket DEMO-1
```

**Expect:** `verdict: "No"` (the Tests Blocker), `unresolved: []` when files
resolve, Documentation/Lint `n/a` in the Blockers column, Conventions `n/a` across
its row. **Negative checks that must fail loudly:** add a `conventions` finding
with no `entryId`, or an absolute `file` path → validation throws + exits non-zero.
Set a finding's `line` past end-of-file → it appears in `unresolved`.

## 6. Build step D — rewrite `SKILL.md` Step 6

Replace the deterministic guts of Step 6 (concatenate / strip / validate / count /
build table / compute verdict / render) with this thin version. Keep only judgment:

```markdown
## Step 6 — Assemble the report

> **Migration status:** the deterministic assembly is done by
> `scripts/assemble.mjs`, which consumes structured reviewer results
> (`schemas/reviewer-output.schema.json`) and returns the rendered report, the
> verdict, per-reviewer counts, and any unresolved citations. This step assumes
> each reviewer emits that JSON. Until the reviewer prompts are converted, keep
> the previous prose assembly.

When the reviewers return, do the **judgment** work here and hand the
**deterministic** work to the script.

1. **Judgment pass.** Drop any finding whose only substance is
   "cleaner / more idiomatic / extract / DRY" (a refactor in disguise). Leave
   everything else untouched — you no longer count or build tables by hand.
2. **Assemble.** Collect the reviewers' structured results into one JSON array and
   run `assemble.mjs --input <results.json> --repo <repo> --base <BASE>
   --branch <branch> --commits <N> --files <N> --ticket <KEY|none>`. It returns
   `{ verdict, counts, unresolved, report }`.
3. **Resolve unresolved citations (judgment).** For each entry in `unresolved`,
   relocate it from the diff if the defect is real, else drop it. Never keep a
   `file:line` the script could not confirm. Re-run `assemble.mjs` after editing.
4. **Hold `report`** for Step 7/8 delivery. `verdict`/`counts` feed the terminal
   summary.

The report shape, the per-reviewer table (incl. the `n/a` rules), the "list every
Blocker / every Should-fix — do not omit" enumeration, and the verdict rule are
owned by `assemble.mjs`. Change the script (its logic is unit-testable), not this prose.
```

## 7. Sequencing

1. Branch. Confirm your copied reviewer is the 6-reviewer version (§0).
2. **Schema (§3) + `assemble.mjs` (§4) + fixture; smoke-test (§5).** Highest leverage; no reviewer changes yet.
3. **Tier 1 unit tests** — see `PRE-PR-REVIEW-EVAL-PLAN.md`. Free, and your justification artifact. Do this before touching reviewers.
4. **Convert reviewers to emit the schema JSON**, one at a time (start `bugs.md` — simplest). Only after this is the slice *live*.
5. **Rewrite Step 6 (§6)** to call `assemble.mjs`; remove the migration-status note.
6. **Tier 2 eval A/B** — see eval doc. Run it; write up the numbers.
7. **Later extractions:** `gather.mjs` (Steps 1–4) and `deliver.mjs` (Steps 7–8 delivery + PR posting). If your copy kept the demo's inline-comment PR posting, that logic goes in `deliver.mjs` too — reconcile the two posting mechanisms there.

## 8. Decisions & risks

- **D0 — plugin/skill name** (§0). Pin it before writing evals; graders assert on it.
- **D1 — Tests as Blocker** (§4). `REVIEWER_META.tests.canBlock`. Canonical = yes.
- **Validation is hand-rolled** (no `ajv`) to stay dependency-free. This repo uses
  pnpm, so adding `ajv` to validate against the schema file is easy if preferred.
- **Invalid JSON from reviewers:** LLMs sometimes emit malformed JSON. When you
  convert reviewers (step 4), the dispatch/assemble path must treat a reviewer whose
  output fails `validate()` like could-not-run (or re-ask), not crash. If subagent
  dispatch supports an enforced output schema, use it — validation becomes a cheap
  backstop instead of a repair loop.
- **PR-posting reconciliation:** if you merged the demo's inline-comment posting
  with the canonical `github-post.md` review flow, keep both behaviors deliberately;
  don't let one silently overwrite the other.

## 9. First move from a clean session

> Read this doc. Confirm §0 (reviewer copied + renamed, 6 reviewers, on a branch).
> Do §7 step 2: write `schemas/reviewer-output.schema.json` (§3), `scripts/assemble.mjs`
> (§4 verbatim), `scripts/fixtures/sample-reviewers.json` (§5); make a scratch dir
> with the cited files; run the smoke test until `verdict` and `unresolved` look
> right and the negative checks fail loudly. Then open `PRE-PR-REVIEW-EVAL-PLAN.md`
> for Tier 1. Do NOT touch reviewer prompts until §7 step 4.
