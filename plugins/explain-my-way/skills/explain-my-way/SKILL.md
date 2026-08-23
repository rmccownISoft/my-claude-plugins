---
name: explain-my-way
description: 'Primes Claude to explain concepts the way this user actually learns — trace execution over time (the "movie", not a static "photo" of the code), one concrete example anchored to their own code, and predict-the-output exercises delivered one at a time — instead of static prose or "read the docs". Also holds ready-to-use scripts for explaining the user''s learning style (visual-spatial, ADHD) to coworkers. Trigger when the user says "explain that better", "that didn''t land", "I don''t get it", "trace it for me", "give me a predict-output exercise", "explain it the way I learn", "help me explain how I learn to a coworker", or "/explain-my-way".'
---

# Explain My Way

Two audiences, one file.

- **Part A** is for **Claude**: how to explain something to this user so it actually lands. Read it and switch into this mode.
- **Part B** is for **the user**: ready-made language for explaining their learning style to coworkers (and for describing why "read the docs" doesn't work for them).

---

## Who this is for (the learner profile)

- **Visual-spatial thinker.** Understands by building a picture of how the pieces connect, then seeing how the picture behaves. Layout and structure carry meaning; a wall of linear prose is the format they have to work hardest to convert.
- **Has ADHD.** Dense, layered output causes glazing. One idea at a time. Small steps beat a complete answer.
- **Relearning JS / TS / SvelteKit.** Knew this once; rebuilding. Gaps mean "needs a refresher," not "novice."
- **The core distinction this plugin exists to honor — "photo vs movie":**

  | | Photo | Movie (what actually helps) |
  |---|---|---|
  | Captures | how the code *looks* — a frozen shape | how the code *behaves* — what happens when it runs |
  | Time | frozen | plays forward, step by step |
  | Answers | "what does it look like again?" | "what happens when I call this?" |

  Anything with a **time dimension** (a factory running once vs its returned function running per-call, an async flow, an event loop) stays fuzzy as a photo. It only clicks as a movie. When something feels fuzzy, the fix is almost never a prettier picture of the code — it's **make it run**: trace it step by step, or drop in a `console.log` and watch.

---

## Part A — For Claude: how to explain to this user

Follow these in order of importance.

1. **Trace, don't describe.** Play the code forward — what runs first, then what, what value flows where. Do not hand over a static description of the code's shape. "Trace it" is the whole job.

2. **One concrete example FIRST, anchored to their OWN code.** Lead with a real `file:line` from the repo they're in, not an abstract rule and not a disconnected toy (`makeGreeter`, `foo`/`bar`). Disconnected examples are the #1 reason things don't map for them. State the general principle only *after* the concrete case, never before.

3. **Prefer predict-the-output exercises, one at a time.** The strongest mode: a tiny snippet → "what does this log, and in what order?" → they answer → confirm → next. They learn by running the movie themselves, not watching yours. Give ONE, wait for their answer, then build up. Never dump five at once.

4. **Tiny steps. Let them answer before continuing.** Match length to one idea. If a sentence introduces two new concepts, split it. When you notice density creeping in, stop and slow down rather than pushing through.

5. **Tables and diagrams over prose.** Boxes-and-arrows and rows-of-attributes are how you freeze the movie onto the page for a visual-spatial reader. Reach for one whenever it would replace a paragraph. Keep annotations — they want to know what each piece *does*.

6. **Define every term inline, the first time, tied to a concrete line.** Never send them to docs to look something up mid-explanation.

7. **Signal words → mode.** Map what they say to what they want:

   | They say | They want |
   |---|---|
   | "trace it" / "walk me through what happens when this runs" | the movie — step-by-step execution |
   | "give me a predict-output exercise" / "let's do a few so I can try" | hands-on: they run it, you confirm |
   | "give me a console.log version" | watch it run live |
   | "why does this work?" / "build my mental map" | the runtime movie + causal chain — NOT a static description |
   | "my eyes glazed" / "that didn't land" | you went too dense — restart smaller, one idea, one example |

**Anti-patterns that fail this reader:** walls of prose; abstract-first explanations; stacking three technical modifiers in one sentence; naming a cause and jumping to the conclusion (walk every step from cause to effect); toy examples when real code exists; five things at once.

---

## Part B — For the user: explaining your learning style to coworkers

Frame it as **"here's how I ramp fastest,"** not **"I can't learn the way you explained."** Same facts; one sounds like a workflow, the other like a deficit.

**Lead with this one-liner:**

> "I learn by building a picture of how the pieces connect and how things flow when they run. Text gives me the facts, but not the picture — so I need one concrete example or a walkthrough first, and *then* everything else clicks into place."

**Why "read the docs" specifically fails (a line that lands with engineers):**

> "Docs are a great *reference* once I have the map. But they're not the map — they assume you already know how the pieces fit. I need to build that first, then the docs actually make sense."

**Turn "that didn't help" into a concrete ask** — swap the complaint for a request:

| Instead of hearing | Ask for |
|---|---|
| "just read the docs" | "point me at the *one* example that does this — I'll work backward from it." |
| an abstract explanation | "walk me through what happens when it runs, step by step." |
| "it works like X, obviously" | "can you sketch it? even rough boxes and arrows." |
| a wall of text | "give me a small concrete case first, then the general rule." |

**On the labels:** with coworkers, *describe the behavior, don't diagnose yourself.* "I think in pictures and connections" travels better than a cognitive-style term, which can invite debate. Save the precise vocabulary ("I'm a visual-spatial learner, so linear text is the format I have to work hardest to convert") for people who ask *why*.

**Slack-ready / standup version, if you only get one line:**

> "I have to see how it connects before I can hold it. Give me one real example and let me trace how it works, and I'll get there fast. Hand me a page of prose and I'm spending my energy translating instead of understanding."

---

## Pocket summary

- **Photo = how code looks. Movie = what it does when it runs.** You need the movie.
- To me (Claude): **trace it, one example from my own code, predict-output one at a time, tiny steps.**
- To coworkers: **"one concrete example first, then the map — docs are a reference, not the map."**
- Fuzzy? **Make it run** — trace it or `console.log` it.
