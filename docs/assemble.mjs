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
