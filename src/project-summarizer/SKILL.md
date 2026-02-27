---
name: project-summarizer
description: >
  Creates and incrementally updates a PROJECT.md file that gives Claude or any LLM instant
  orientation to a codebase — without needing to reconstruct project understanding from scratch
  each session. Use this skill whenever the user asks to "summarize the project", "update the
  project docs", "document this codebase", "create a PROJECT.md", or says things like "catch
  you up on my project", "help me document where things live", or "I want a map of this repo".
  Also trigger when the user describes a new feature, bug fix, or architectural change and the
  conversation implies the PROJECT.md should be kept current. Primarily designed for
  JavaScript/TypeScript projects but the core structure applies to any code project.
---

# Project Summarizer

Generates and maintains a `PROJECT.md` file in a `/docs` or `/context` folder at the project
root. The file serves two audiences simultaneously: agents (via a dense YAML frontmatter block)
and the human developer (via structured, scannable markdown sections below it).

---

## Workflow

### Step 1 — Determine Mode

Check whether a `PROJECT.md` already exists in `/docs/` or `/context/` at the project root.

- **No file found → Full Generation mode** (see Step 2)
- **File found → Incremental Update mode** (see Step 3)

---

### Step 2 — Full Generation

#### 2a. Gather inputs

Scan the project root. Use bash tools to:

```bash
# Get annotated directory tree (JS/TS aware — excludes noise)
find . -not -path '*/node_modules/*' \
       -not -path '*/.git/*' \
       -not -path '*/dist/*' \
       -not -path '*/.next/*' \
       -not -path '*/build/*' \
       -not -path '*/coverage/*' \
       -not -path '*/.turbo/*' \
       -not -path '*/out/*' \
       -not -name '*.lock' \
       -not -name '*.log' \
  | head -200
```

Also read (if they exist):
- `package.json` — name, scripts, dependencies, devDependencies
- `tsconfig.json` — paths, baseUrl, compiler target
- `README.md` — project description, setup notes
- `.env.example` — environment variables hint at integrations
- Root config files (`next.config.*`, `vite.config.*`, `jest.config.*`, etc.) — reveals framework

**To determine `current_focus`**, always run these git commands (if this is a git repo):

```bash
git log --oneline -10          # recent commit messages reveal active work
git branch --show-current      # branch name often names the feature in progress
```

- If recent commits cluster around a clear theme (e.g., all touching auth, or all mentioning "chat"), use that as `current_focus`.
- If the branch name describes a feature (e.g., `ai-chat`, `fix/payment-flow`), factor that in.
- If git is not available or the repo has no commits, set `current_focus` to `""` (empty string).
- If commits exist but show no clear pattern (maintenance, mixed concerns), set `current_focus` to `"stable"`.

If the user has provided a verbal description in the conversation, incorporate it — it often
captures intent and domain context that code alone doesn't reveal.

#### 2b. Build the file

Write the file using the **Output Format** section below as the exact template.

For the annotated directory tree, walk the structure and add a `# comment` to each meaningful
folder and file. Skip generated files, lock files, and anything in the excluded paths above.
Aim for one tight sentence per entry.

#### 2c. Save

Save to `docs/PROJECT.md` (preferred) or `context/PROJECT.md` if a `/context` folder already
exists. Create the folder if neither exists.

Confirm to the user: tell them where the file was saved and give them a one-sentence summary of
what was captured.

---

### Step 3 — Incremental Update

#### 3a. Identify what changed

Ask the user (or infer from conversation context): what changed since the last update? Examples:
- "I added an auth module"
- "Refactored the API layer"
- "Fixed a bug in the payment flow"
- "Renamed `/lib` to `/utils`"

Also re-scan the directory tree to detect structural changes (new folders, deleted files).

#### 3b. Identify affected sections

Map the changes to specific sections of the existing PROJECT.md:

| Change type | Sections likely affected |
|---|---|
| New file/folder | Directory Tree, possibly Features |
| New dependency added | Tech Stack, possibly Architecture |
| Bug fixed | Known Bugs & Debug Entry Points |
| New feature | Features, possibly Directory Tree |
| Refactor / rename | Directory Tree, Architecture |
| New env var / integration | Tech Stack, Architecture |

#### 3c. Ask before overwriting

For **each section** that needs updating, show the user:
1. The current content of that section
2. The proposed new content
3. Ask: "Should I update this section?" — wait for confirmation before proceeding.

If multiple sections need updates, batch the confirmations sensibly (don't ask one at a time for
trivial changes to the same section).

#### 3d. Update `last_updated` in frontmatter

Always update the `last_updated` field in the YAML block, no confirmation needed for this field.

---

## Output Format

Use this exact structure for the generated `PROJECT.md`:

````markdown
---
# Agent context block — optimized for fast LLM orientation
project: <name>
stack: [<primary language>, <framework>, <key libs>]
entry_points:
  - <path>: <one-line description>
  - <path>: <one-line description>
current_focus: <what is actively being worked on right now, or "stable">
last_updated: <YYYY-MM-DD>
docs_location: docs/PROJECT.md
---

# <Project Name>

> <One paragraph description of what this project is, who it's for, and what problem it solves.>

---

## Architecture & Tech Stack

<Prose description of how the system is structured. Cover: framework, key libraries, how data
flows through the app, any notable patterns (e.g., server components, edge functions, monorepo
structure). 2–4 paragraphs. No bullet lists — write in sentences.>

---

## Directory Map

```
<annotated directory tree here>
```

---

## Known Bugs & Debug Entry Points

<If no known bugs, write: "No known bugs at time of last update.">

<For each known issue, write a short paragraph: what the symptom is, where to start looking
(file path + function name if known), and any relevant context. This section is the most
valuable for debugging — be specific.>

---

## Feature Inventory

### Done
- <feature> — <one line on how/where it's implemented>

### In Progress
- <feature> — <current state, what's left>

### Planned / Not Started
- <feature> — <brief intent>

````

---

## JS/TS-Specific Notes

When analyzing a JS/TS project, pay special attention to:

- **`package.json` scripts** — `dev`, `build`, `test`, `lint` scripts reveal the workflow
- **`tsconfig.json` paths** — path aliases like `@/components` indicate the import convention
- **Framework signals**: presence of `next.config.*` → Next.js; `vite.config.*` → Vite; `remix.config.*` → Remix; `astro.config.*` → Astro
- **`/app` vs `/pages`** — Next.js App Router vs Pages Router; affects how routing and layouts work
- **`/src` vs root-level** — indicates whether the project uses a src layout
- **Barrel files (`index.ts`)** — note which modules expose a public API this way
- **`prisma/` or `drizzle/`** — ORM in use, note the schema file location
- **`/public`** — static assets, usually not worth annotating in detail
- **Test co-location** — are tests next to source files (`.test.ts`) or in a `/tests` or `/__tests__` folder?

Always exclude from the directory tree:
`node_modules`, `.git`, `dist`, `build`, `.next`, `out`, `coverage`, `.turbo`, `*.lock`, `*.log`

---

## Tone & Style Guidelines

- **Directory map annotations**: short, factual, one sentence. Start with a verb. E.g. `# Handles all Stripe webhook processing`
- **Architecture section**: write for a senior developer who is new to this specific codebase. Assume they know the framework — explain *this project's* choices.
- **Known bugs**: be specific enough that someone unfamiliar with the code could find the right file within 60 seconds.
- **Feature inventory**: err on the side of more entries rather than fewer. Small features are still worth listing.
- **Frontmatter `current_focus`**: keep this honest and up to date — it's the most-read field by agents starting a new session.
