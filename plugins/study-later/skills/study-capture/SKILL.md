---
name: study-capture
description: Save a learning topic to the user's study-later vault with a full context snapshot. Trigger whenever the user says "study this later", "add this to my study list", "I want to study this later", "save this for studying", or any clear variant expressing that the current concept/error/fix should be banked as a future learning topic — in ANY project, mid-task, with or without a topic hint attached. Also triggers with no project context at all ("study this later — the new Svelte attachments feature"). Do NOT trigger on ordinary uses of the word "study", and do NOT trigger merely because the user is stuck or asking for help — banking a topic is a separate, explicit act that requires one of the trigger phrases.
---

# Study-Capture

The user wants to bank the current concept as a learning topic and get straight back to work. Your job: write a rich snapshot in ONE exchange, confirm in one line, return to the prior task. He has ADHD — a long detour here is its own harm. No summaries, no "would you like me to also...", no follow-up questions beyond the single one permitted below.

## Why the snapshot matters

The lesson gets built later, in the vault repo, possibly by a different agent with none of this conversation. Everything perishable must be captured now: the exact code, the error, what he was trying to do, what confused him *in his own words*. If it's not in the snapshot, it's gone. The lesson plan and exercises are durable — they are deliberately NOT built now.

The user cannot learn from abstract placeholders. The snapshot must preserve real names — his components, his variables, his project's vocabulary — verbatim, because the future lesson will be built entirely from them.

## Vault location

Default: `~/github/study-later/`. Check the user's global `~/.claude/CLAUDE.md` for an override before assuming the default.

**If the repo isn't there:** do not lose the capture. Write the complete topic folder to a temp directory instead, tell the user the path and that moving it into `topics/` in the vault (plus adding an index row) completes the save. Then return to the task.

## Workflow

1. **Infer the topic and the confusion from the conversation** — the error just hit, the concept just explained, the fix just applied, or the hint the user attached after the trigger phrase. State your inference as part of the confirmation rather than asking him to articulate it mid-frustration. **You may ask at most ONE question** ("what specifically confused you?") and only if the confusion genuinely cannot be inferred.

2. **Check for a duplicate.** Read the vault README index. If a topic with status `captured` or `in progress` covers the same concept (same lesson subject — judge from names/descriptions), append a dated `## Second encounter — YYYY-MM-DD` section to that topic's SNAPSHOT.md with the new context instead of creating a new topic. Hitting the same wall twice is lesson data. When uncertain whether it's the same concept, create a new topic — a near-duplicate is cheaper than a lost capture. This append is the ONLY permitted edit to an existing SNAPSHOT.md.

3. **Create the topic folder** `topics/<kebab-case-topic>/` and write:
   - `SNAPSHOT.md` — use `templates/SNAPSHOT-stuck.md` when there's project context, `templates/SNAPSHOT-curiosity.md` when the user is banking something he simply wants to learn (no project involved). Fill every section; write the confusion in the user's own words where you have them.
   - `snapshot/` — verbatim copies of the relevant code: the functions/components/queries involved, not whole files. Keep original file names where possible (flatten paths as `path__to__file.ext` if needed). Curiosity mode: may be empty.
   - `REFERENCES.md` — from `templates/REFERENCES.md`. Seed with docs/MCPs you know are relevant, and copy in any matching rows from the "Technology ground rules" table in the vault's CLAUDE.md.

4. **Update the vault README index** — new row: topic | `captured` | source project (or "curiosity") | today's date.

5. **Commit locally** in the vault repo (`git add` the topic + README, commit with message `capture: <topic>`). Do NOT push — no network dependency mid-flow.

6. **Confirm in one line and return to the task.** Format: `Saved to study list: <topic-name> — say "let's study" in your study-later repo when ready. Back to the task.` Then continue exactly what you were doing before the trigger. Nothing else.

## Hard rules

- One exchange. At most one question, and only when the confusion can't be inferred.
- SNAPSHOT.md is immutable after this (second-encounter appends excepted).
- Real code and real names in the snapshot, verbatim. Never substitute generic placeholders.
- Local commit only, never push.
- Never lose a capture: repo missing → temp folder + tell him where.
