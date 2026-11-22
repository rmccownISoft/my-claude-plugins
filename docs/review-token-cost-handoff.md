# Handoff: cutting the token cost of `/bobs-plugins:review`

**Status:** findings and proposals only. Nothing in the plugin has been changed yet.
**Plugin:** `plugins/bobs-plugins/skills/review/` (`SKILL.md` + `reviewers/*.md`)
**Date:** 2026-11-20

## Why this exists

`/usage` showed the `bobs-plugins` plugin at **42%** of Bob's usage, and subagents spawned by
`bobs-plugins:review` at **28%**. The goal is to bring that down one change at a time and
measure each change, instead of guessing.

Work style for this task:

- **One change per round.** Make one change, run a clean measured review, compare to the
  baseline, then decide whether to keep it.
- **Show each change before making it.** Bob wants to see the edit before it is applied.
- Plain language in docs and comments. Concrete code over abstraction.

## How to measure a run

Two Node scripts in Bob's `claude-generated-utility-scripts` repo, folder
`claude-session-usage/` (see its README). They read the session transcript files directly, so
they cost no Claude tokens to run.

| Script | What it prints |
| --- | --- |
| `session-usage.mjs` | Totals per transcript (main session + each subagent) and overall; what each subagent reported vs what it actually processed; optional comparison with a headless run's `--result` file |
| `usage-calls.mjs` | One line per API call: context size, new (uncached) tokens, cached tokens, output, and what the call did (which tools, with their descriptions) |

Both accept a session id (searched for under `~/.claude/projects`) or a session `.jsonl` path:

```bash
node claude-session-usage/session-usage.mjs <session-id>
node claude-session-usage/usage-calls.mjs <session-id>
```

### Where the transcripts are

```
~/.claude/projects/<project-folder>/<session-id>.jsonl                    main session
~/.claude/projects/<project-folder>/<session-id>/subagents/agent-*.jsonl  one per subagent
~/.claude/projects/<project-folder>/<session-id>/subagents/agent-*.meta.json
```

The newest `.jsonl` in the project folder is the latest session. The `.meta.json` holds the
subagent's description (e.g. "Security review") and the model it ran on (`pickedEffortModel`).

### Test protocol

1. Open a **fresh** Claude session in the test repo, on a fixed branch with a fixed diff, so
   every run reviews the same changes.
2. Run only `/bobs-plugins:review local summary only`. Do nothing else in that session, since
   every extra message adds to the totals.
3. Close it, then run both scripts on its session id from a plain terminal.
4. Compare with the baseline below: the EVERYTHING total, each bucket (cache write / cache read /
   output), and each subagent's first call.
5. Also check the review quality held up: the same real findings, no new false ones.

**Take a new baseline in the test repo first.** The numbers below came from a different repo
(`isoft-employee-api`, branch `DOPS-443-web-component-release-guards`, 7 files / 2 commits vs
`origin/master`), so they show the shape of the cost, not a number to compare against directly.

### Gotchas in reading the numbers (all confirmed)

- **The VS Code agent map and the subagent completion notice do not show cost.** Their per-agent
  number ("62.6k tokens", `subagent_tokens`) is the size of that agent's **last API call** only.
  The real total for the run was about 8× higher. Use the scripts.
- **One API response can be written as several transcript lines** (one per content block), each
  with the same `usage`. Count each `message.id` once, or totals double. Both scripts do this.
- **Price differs by token type.** Cache reads cost about 0.1× the input price. Cache writes cost
  more than input (this setup uses the 1-hour cache, which has a higher write multiplier than the
  5-minute one). Output is the most expensive per token. A big cache-read count is less alarming
  than a big cache-write or output count.

## Baseline (clean run, session `63e1aaec-658e-463d-a0a3-24ca48825080`)

Everything ran on **Opus 5.5**. The reviewers are the built-in `general-purpose` agent type,
and the skill sets no model, so they inherit the main session's model.

| Part | API calls | Cache write | Cache read | Output | Total |
| --- | --: | --: | --: | --: | --: |
| Main session | 11 | 47,136 | 803,959 | 7,700 | 858,825 |
| Security | 3 | 62,139 | 104,526 | 922 | 167,593 |
| Tests | 4 | 61,612 | 164,692 | 2,435 | 228,747 |
| Potential Bugs | 6 | 71,116 | 303,447 | 4,706 | 379,281 |
| Documentation | 8 | 65,983 | 422,156 | 2,599 | 490,754 |
| **All subagents** | 21 | 260,850 | 994,821 | 10,662 | 1,266,375 |
| **Everything** | 32 | 307,986 | 1,798,780 | 18,362 | 2,125,200 |

(Input tokens were tiny, under 100 total, and are left out.)

## Findings, from `usage-calls.js`

1. **Each reviewer starts with ~44k tokens before it reads any code.** Every reviewer's first
   call shows ~44k new tokens and 0 cached. That is the system prompt, tool definitions, the
   lists of MCP tools / skills / plugins loaded in the session, CLAUDE.md, and the reviewer
   prompt. The four reviewers start at the same moment, so none can reuse another's cache: about
   **177k cache-write tokens** spent on the same overhead. This is the largest single cost.
   *Not yet confirmed:* how much of the 44k is the reviewer prompt vs. session-wide overhead.
   One way to check: run once with a near-empty reviewer prompt and compare the first call.
2. **The diff is read four times.** Each reviewer's second call adds ~15.7k new tokens: the output
   of its own `git diff`. About 63k in total.
3. **The main session wrote the four reviewer prompts by hand.** Main call #5 (the one that
   launches the four agents) produced **4,992 output tokens** on Opus, mostly the reviewer files
   copied into the Task prompts. Output is the priciest token type.
4. **Every extra tool call re-reads the whole context.** Documentation made 8 calls (422k cached
   tokens re-read); Security made 3 (105k). The tool calls were mostly small `Bash` checks to
   confirm a finding.
5. **The main session itself is ~65k context at its first call** and grows to ~90k. Each of its
   11 calls re-reads that, which is where its 804k cache reads come from.

## Proposed changes, biggest expected saving first

Do these one at a time and measure each.

1. **Shrink the starting overhead.** Subagents load the same plugins, MCP servers and skill
   lists as the session that spawned them. Turn off plugins and MCP servers a project doesn't
   use (in that project's `.claude/settings.json`), so both the main session and every reviewer
   start smaller. This is a settings change in the consuming project, not a plugin change, but it
   is likely the biggest win. Measure the first-call size of each reviewer before and after.
2. **Run the reviewers on a cheaper model.** Pass `model` (for example `"sonnet"`) on the four
   Task/Agent calls in `SKILL.md` Step 5, or define the reviewers as named agents in the plugin
   with a `model:` in their frontmatter. This lowers the price of all ~1.27M subagent tokens.
   Watch quality closely, especially Potential Bugs.
3. **Have each reviewer read its own prompt file** instead of the main session pasting the file
   into the Task prompt. Pass the shared scope block plus the path to `reviewers/<name>.md`. This
   should remove most of the ~5k output tokens in main call #5.
4. **Write the diff to a file once** and point reviewers at it, instead of four `git diff` runs.
   Small saving; each reviewer still reads the diff into its context.
5. **Limit verification calls.** Consider telling reviewers to batch their confirming reads into
   one or two tool calls. Each call saved re-reads the whole ~60k context.

## Related material

- In the `claude-plugins` repo (ISoft org), `handoff-reviewer-subagents-model-and-permissions.md`
  and `explainer-defined-subagents-vs-skill-prompts.md` cover the same model-selection question
  for the `isoft-dev` `pre-pr-review` skill, including how defined subagents differ from prompts
  passed to `general-purpose`. Read them before doing proposed change 2.
- `handoff-bugs-reviewer-token-budget.md` in the same repo covers narrowing reviewer input.
