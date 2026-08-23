---
name: quick-learn-concept
description: 'Produces a short (~10 minute), hands-on teaching doc for ONE JavaScript / Node / project concept the user hit while working, anchored to the current repo''s real code. The lightweight counterpart to the study-later plugin: a quick single-sitting grasp of one thing, not a multi-session course. Run with the concept as the argument (e.g. /quick-learn-concept JavaScript Map). Trigger when the user says "I''m not comfortable enough with X to write it myself", "quickly explain X so I get it next time", "teach me X", "make me a quick practice doc for X", or "/quick-learn-concept X".'
---

# Quick-Learn a Concept (project-anchored micro-teaching doc)

Generates a focused, single-sitting teaching document for **one** concept the user wants to
understand while working in whatever repo they're currently in. Deliberately lightweight: a
~10-minute read, not a course.

## Scope — and when to hand off

This is the **quick** option. If the ask is genuinely big — a whole subsystem, a curriculum,
something the user wants to study over days with checkpoints and spaced review — this is the
**wrong tool**. Say so and point them at the **study-later** plugin instead (`study this later`
to capture with context, `let's study` in the vault repo to get tutored). Use this skill only
for a single concept graspable in one sitting.

## Who this is tuned for

The user is **relearning Node.js/JavaScript**, is a **visual-spatial learner** who learns **by
concrete example**, and prefers to **attempt code hands-on first**. This skill exists because a
doc built to the recipe below landed well and is worth reproducing reliably. Honor that profile
in every doc this skill produces.

The non-negotiable that makes these docs work: **anchor everything to real code in the CURRENT
repo, never teach in the abstract.** A generic tutorial is a failure of this skill.

---

## Step 1 — Identify the concept

The concept comes from the skill argument (e.g. `/quick-learn-concept JavaScript Map` → "JavaScript Map").

If no argument was given, ask: "Which concept should I build a quick doc for? (e.g. JavaScript Map,
async/await, the Fastify preHandler hook)"

Keep the scope to **one** concept. If the user names several, do the first and offer the rest
as follow-ups — a 10-minute doc covers one idea well, not five shallowly. If the request is
genuinely big (a whole subsystem, days of study), hand off to study-later per the Scope note above.

---

## Step 2 — Find where it actually lives in this repo (the anchor)

Before writing a word of explanation, locate the concept's real usage in the current project:

- `Grep` / `Glob` for it across the codebase (e.g. `new Map`, `async`, `addHook`).
- Pick the clearest, most representative real usage — ideally one the user has been working in.
- Record the exact `file:line` for every place you'll cite. These become clickable links.

If the concept is **not** used in this repo yet, say so plainly in the doc and anchor instead to
the nearest analogous real code plus where the concept *will* land (cite the plan/issue if known).
Never fall back to a made-up `foo`/`bar` example when real code exists.

---

## Step 3 — Write the doc to this recipe

Six parts, in this order. Budget the whole thing to a **~10-minute read**. Plain language;
define any unavoidable term in one sentence tied to a concrete line.

1. **One-sentence plain idea.** What the thing *is*, in ordinary words. No jargon.

2. **An analogy that maps 1:1 to a real flow in this project.** Not a generic metaphor — pick
   one whose parts line up with the actual code, and show the mapping as a table:
   `Analogy | This repo | Where in the code (file:line)`. (A `Map` doc, for instance, used a
   coat-check: hand in coat / get ticket # ↔ register client / mint an id, show ticket ↔ look the
   id back up.) This is the highest-value part; spend effort here.

3. **A visual of the real data/structure.** An ASCII table or diagram of what the thing actually
   holds or does in this repo — populated with plausible real values, not placeholders.

4. **A compact API/behavior table.** The handful of methods/keywords/steps that matter, one row
   each: what it does, what you write, what it returns. Then call out **the one gotcha** that
   actually bites in *this* project, and tie it to why it matters here (e.g. `Map.get` returning
   `undefined` on a missing key being the exact spot a security check has to live).

5. **Hands-on practice — the user types it themselves.** 3–4 short exercises that **mirror the
   user's real next task** in the repo, in increasing difficulty. Tell them to attempt each
   before looking. Put the worked answers in a collapsed `<details><summary>` block so they're
   hidden by default. The last exercise should be a miniature of the actual code they're about
   to write.

6. **Pocket summary.** A handful of bullets they can re-skim in 30 seconds.

Style rules:
- Lead with worked, filled-in code and real file:line links — never an abstract "your turn" table.
- Prefer tables and diagrams over prose paragraphs; walls of text fail for this reader.
- If a value looks like it appears from nowhere, say plainly where it comes from.
- Follow the current project's own conventions (naming, spelling of product names, code style).
  Check the repo's `CLAUDE.md` if it has one.

---

## Step 4 — Write output

Write the doc to `docs/learning/<slug>.md` in the current project, where `<slug>` is a kebab-case
name for the concept (e.g. `javascript-map`, `fastify-prehandler-hook`). Create the
`docs/learning/` folder if it doesn't exist. Use relative links from the doc's location so the
file:line references are clickable.

---

## Step 5 — Report to the user

Tell the user:
- The path to the doc that was written (as a clickable link).
- Which real file(s) it's anchored to.
- The estimated read time.
- Which exercise mirrors their actual next task, so they know finishing the doc leaves them
  warmed up for it.
