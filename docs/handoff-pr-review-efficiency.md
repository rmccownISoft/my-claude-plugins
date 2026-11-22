# Handoff: make `isoft-pre-pr-review` cheaper and more faithful

**For:** a Claude Code session working in this repo (`my-claude-plugins`).
**Goal:** change how `plugins/isoft-pre-pr-review` dispatches its reviewers and assembles their findings, so that
(1) every reviewer and the assembler run on a model the skill chooses, (2) reviewer instructions reach each reviewer
exactly as written, (3) the assembler cannot reword findings, and (4) the orchestrator stops spending output tokens
re-typing files. Then prove it with the measurement harness described at the end.

Evidence for everything below is in `C:\Users\kc0hw\Documents\ai-pr-review-evidence\` — start with `FINDINGS.md` there.
It comes from 10 headless runs of the sibling skill `ai-workflow:ai-pr-review` (in the `claude-plugins` repo), which
shares this skill's design: same reviewers, same Step 5 dispatch, same "concatenate verbatim" assembly.

---

## 1. How this skill works today

`plugins/isoft-pre-pr-review/skills/isoft-pre-pr-review/SKILL.md`, Step 5 (around line 115):

```markdown
Issue all applicable reviewers as `Task` calls **in a single message** ...
- `subagent_type`: `general-purpose`
- `description`: the reviewer's short name (e.g. "Potential Bugs review")
- `prompt`: the contents of the reviewer file under `reviewers/`, with the
  **shared context block** below prepended.
```

What that produces at run time, step by step:

```
orchestrator turn ─────────────────────────────────────────────────────────────
  Read(reviewers/security.md)        file text comes in        (input tokens)
  Read(reviewers/bugs.md) …
  Task(prompt: "<shared block> + <security.md re-typed>")       (OUTPUT tokens)
  Task(prompt: "<shared block> + <bugs.md re-typed>") …
                                     turn ends; reviewers run in the background
next turn (reviewer results arrive) ──────────────────────────────────────────
  assemble + write report            runs on the SESSION's model
```

Three things in that picture are worth knowing before you change anything.

### 1a. A tool argument can only be filled by the model writing it out

`Task`/`Agent` has no "attach this file" option. When the skill says "`prompt`: the contents of the reviewer file",
the model must read the file, then generate its text again as the argument. That costs output tokens, the most
expensive kind. It is also not a copy, so the model can and does change it. Measured on the sibling skill (32 prompts):

| What the orchestrator sent | Count |
| --- | --- |
| The file verbatim | 17 |
| 99% of the file's lines | 3 |
| 25–78% of the file's lines | 8 |
| Only "Read the file … and follow it exactly" | 4 |

### 1b. A model choice made in a skill lasts one turn

A skill's frontmatter `model:` "applies for the rest of the current turn", per https://code.claude.com/docs/en/skills.
The reviewers run in the background. Their results come back as a **new turn**, and that turn runs on the session's
model. So whoever started the session decides which model writes the report. In the sibling skill, a Haiku session
meant Haiku assembled the report, and an Opus session meant Opus assembled it. That cost $0.82 more per run, for the
same output.

This skill has no `model:` in its frontmatter and no `model` on its `Task` calls. So today **every reviewer and the
assembler run on whatever model the session uses**. In the GitHub Action, that means whatever model the workflow
configures.

### 1c. The assembler's model affects whether "verbatim" holds

This skill's Step 6 says to "Concatenate each reviewer's output verbatim … Do not re-rank or summarize." In the
sibling skill, an Opus assembler kept every reviewer line in 3/3 runs. A Haiku assembler reworded or shortened finding
bodies in 5 of 7 runs. One example from run `e75eb44d`:

| Reviewer returned | Report showed |
| --- | --- |
| `**Severity:** Should-fix (correctness side; the injection vector itself belongs to the Security reviewer)` | `**Severity:** Should-fix` |
| `**Fix direction:** Pass the term as a bound parameter …` | (removed) |

No finding was ever dropped. The text *inside* findings changed.

---

## 2. Changes, in priority order

### Change 1: Make each reviewer a defined plugin agent

**Why:** this moves three things that currently depend on the model following prose into config that Claude Code
enforces: which model runs, which tools the reviewer can use, and the exact instructions it gets.

A plugin agent is a markdown file in the plugin's `agents/` folder. Frontmatter sets its name, description, model and
tool allowlist. The body becomes the subagent's **system prompt**, which Claude Code loads directly. The orchestrator
never reads or re-types it. Working examples in the sibling repo (`C:\Users\kc0hw\Documents\GitHub\claude-plugins`):

- `plugins/ideation/agents/reviewer.md`, with `tools: Read, Grep, Bash`. Its description says "Cannot edit files —
  enforced by tool restrictions."
- `plugins/consultant/agents/claude-researcher.md`, with `model: sonnet`.

**Before:** `skills/isoft-pre-pr-review/reviewers/security.md`, plain instructions, pasted by the orchestrator.

**After:** `plugins/isoft-pre-pr-review/agents/security-reviewer.md`

```markdown
---
name: security-reviewer
description: 'Security reviewer for isoft-pre-pr-review. Only dispatched by that skill; do not use directly.'
model: opus
tools: Read, Grep, Glob, Bash
---

You are a security reviewer for an ISoft branch. ...   ← the current body of reviewers/security.md, unchanged
```

**Step 5 becomes:**

```markdown
For each reviewer, issue an `Agent` call (all in one message):

| Reviewer        | `subagent_type`                              |
| --------------- | -------------------------------------------- |
| Security Issues | `isoft-pre-pr-review:security-reviewer`      |
| Potential Bugs  | `isoft-pre-pr-review:bugs-reviewer`          |
| Tests           | `isoft-pre-pr-review:tests-reviewer`         |
| Documentation   | `isoft-pre-pr-review:documentation-reviewer` |

- `prompt`: the shared context block only. The reviewer's instructions load from its agent file.
```

Notes:

- Plugin agents are addressed as `<plugin-name>:<agent-name>`. In this session's agent list, `ideation:reviewer` is
  the sibling repo's `plugins/ideation/agents/reviewer.md`.
- The tool is called `Agent` now. This skill still says `Task`, the old name.
- Each agent's `description` sits in the agent list of every session where the plugin is enabled. Keep it short, and
  say it is only dispatched by this skill, so Claude does not start reviewers on its own.
- Follow this repo's `CLAUDE.md` rule for descriptions: a single-line, single-quoted scalar. It is written for
  `SKILL.md`, but the same loader risk applies.
- `model:` in agent frontmatter outranks the session model but is outranked by a per-call `model`
  (https://code.claude.com/docs/en/sub-agents, "resolution order"). So don't pass `model` on the call. Let the agent
  file be the single source of truth.
- `Bash` is needed for `git diff`. Whether `tools:` accepts a pattern like `Bash(git *)` to block everything else is
  **unverified**. Check the sub-agents docs before relying on it.

### Change 2: Take the assembler's model out of the session's hands

**Why:** see 1b and 1c. Today the assembler is the one component whose model the skill cannot set, and its model
decides whether "verbatim" holds.

Options, from most deterministic to least. None is implemented or tested yet:

| Option | How | Trade-off |
| --- | --- | --- |
| A. Script assembly | Each reviewer writes its section to a file (e.g. `.pre-pr-review/<reviewer>.md`). A bundled `.mjs` script concatenates them and computes counts and the verdict. | Verbatim by construction, no model involved. The verdict logic must be expressible as code. Your `scriptify-rewrite-pr-reviewer` branch may already head this way (not checked). |
| B. Assembler subagent | One more defined agent, `report-assembler` with `model: sonnet`, that reads the reviewer files and writes the report | The model stays fixed, but a model still writes the report, so 1c can still happen at a lower rate |
| C. Keep it in the orchestrator, but pass files | Reviewers write files; the orchestrator assembles from those files | Removes nothing from 1b. Only worth it as a step toward A. |

If reviewers write files, they need `Write` (or Bash redirection) in their `tools:`. Choose that deliberately, because
it re-opens the "reviewer can modify the repo" gap that Change 1 closes. Writing outside the repo (a temp dir passed in
the shared block) limits the damage.

### Change 3: Fix the reviewer file path, if the files stay

Step 5 says "the reviewer file under `reviewers/`". The sibling repo's `CLAUDE.md` warns that relative paths in skill
content are resolved against the user's working directory, not the plugin, and "fail silently". Use
`${CLAUDE_PLUGIN_ROOT}/skills/isoft-pre-pr-review/reviewers/security.md`. Change 1 makes this moot.

---

## 3. How to verify

The harness in `C:\Users\kc0hw\Documents\ai-pr-review-evidence\scripts\` runs the skill headlessly against a
throwaway fixture repo (no remote, so nothing is posted) and records what really happened.

```bash
E=/c/Users/kc0hw/Documents/ai-pr-review-evidence/scripts
bash $E/run-experiment.sh "$PWD/plugins/isoft-pre-pr-review" /isoft-pre-pr-review:isoft-pre-pr-review ./pr-review-runs \
  A haiku 3  B opus 3
mkdir -p ./pr-review-runs/reviewers && cp plugins/isoft-pre-pr-review/skills/isoft-pre-pr-review/reviewers/*.md ./pr-review-runs/reviewers/
node $E/analyze.mjs ./pr-review-runs      # writes ./pr-review-runs/TABLES.md
```

- Run it **before** changing anything, to get this skill's own baseline. The numbers above are from the sibling skill.
- Each run costs roughly $0.65–$2.10 and is capped at $5. Six runs is enough to see the pattern.
- The fixture has no remote, so the GitHub Action posting path is never exercised.
- `run-experiment.sh` appends `base=main` to the command. This skill takes no such argument. That's harmless: the
  fixture has no `origin`, so Step 2 falls back to local branches and resolves `main`.
- **Adjust `analyze.mjs` before trusting its section 4.** It looks for reviewer lines in the session's final message
  (`result.json` → `result`). This skill writes its report to a file in the reviewed repo instead, so section 4 will
  under-count until it reads that file. The fixture repo is deleted after each run, so also have `run-experiment.sh`
  copy the report file into `runs/<sid>/`.
- Keep `pr-review-runs/` out of git.
- `analyze.mjs` identifies reviewers by the words Security / Potential / Bugs / Tests / Documentation in each
  subagent's description. Keep those words in the descriptions.
- After Change 1, the "prompt fidelity" table in `TABLES.md` stops applying, because prompts no longer contain the
  file. It will read near 0%, and that is expected.

**Done looks like this:**

| Check (from `TABLES.md`) | Today (expected) | Target |
| --- | --- | --- |
| Reviewers dispatched, calls/message | 4 / 1 | 4 / 1 |
| Reviewer models under a Haiku session | haiku ×4 | as set in each agent file |
| "Final report written by" | the session model | fixed (Option B), or none (Option A) |
| Reviewer lines intact in report | varies with the assembler | every line, every run |
| Orchestrator output tokens | ~12–14K | far lower; nothing re-typed |
| Both planted defects found | yes | yes |

---

## 4. Unverified, so check before relying on it

- Whether `tools:` in agent frontmatter accepts `Bash(git *)`-style patterns.
- Whether `Agent` calls can be forced to run in the foreground, keeping assembly in the skill's turn. In the runs
  above they always ran in the background.
- How the GitHub Action sets the session model for this skill, which decides today's reviewer and assembler models in CI.
- All measurements come from one small fixture, with 3–5 runs per arm. Treat the rates as signals.
