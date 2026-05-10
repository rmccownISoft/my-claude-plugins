---
name: ingest-codex
description: >
  Ingests an iSoftData Svelte component into the Codex knowledge bank. Run this from inside
  a component repo with the component name as the argument (e.g. /ingest-codex DataTable).
  Reads source files directly — no prompt bundling needed — follows TypeScript imports to
  resolve exact prop types, and writes the Codex entry JSON to the sibling isoft-memory-experiment
  repo. Use when the user says "ingest <ComponentName>", "/ingest-codex <ComponentName>",
  or "add <ComponentName> to the codex".
---

# Codex Component Ingestion

Generates a precise Codex entry for an iSoftData Svelte 5 component by navigating the source
repo directly. Writes output to the sibling `isoft-memory-experiment` codex repo.

## Directory assumption

The component repo and the codex repo are siblings under the same parent:

```
~/Documents/GitHub/
  svelte-component-input/   ← you are here (component repo)
  isoft-memory-experiment/  ← codex repo
    review/                 ← output goes here
    ingestion/              ← process-response script lives here
```

Derive the review path at runtime:

```bash
CODEX_ROOT="$(dirname $(pwd))/isoft-memory-experiment"
CODEX_REVIEW="$CODEX_ROOT/review"
CODEX_INGESTION="$CODEX_ROOT/ingestion"
CODEX_PROGRESS="$CODEX_ROOT/PROGRESS.md"
```

---

## Step 1 — Identify the component

The component name comes from the skill argument (e.g. `/ingest-codex DataTable` → `DataTable`).

If no argument was provided, ask: "Which component should I ingest? (e.g. DataTable)"

---

## Step 2 — Discover and read all source files

Run these in parallel:

- `Glob("src/lib/**/*.svelte")` — component source
- `Glob("src/lib/**/*.ts")` — TypeScript source, type exports, re-exports
- `Glob("src/lib/**/*.js")` — any JS utilities
- `Glob("src/routes/**/*.svelte")` — usage examples in routes
- `Read("README.md")` — existing documentation
- `Read("package.json")` — repo name, package name, repository URL

Read every file returned in full. Do not summarize or skim.

---

## Step 3 — Resolve types precisely (the key advantage of this approach)

For every prop whose type is imported rather than defined inline:

1. Find the import statement in the component source (e.g. `import type { InputTypes } from './index.ts'`)
2. Read that file
3. Find and record the exact union, interface, or type alias definition

**Do not infer types from README or usage examples.** Read the definition.

If a type is imported from a third-party package (`node_modules`) that you cannot read, record it as a confidence flag. Note the package name and the type name so the reader knows where to look.

If re-exports chain through multiple files, follow the chain until you find the definition.

---

## Step 4 — Build the Codex entry JSON

Produce a JSON object matching this exact schema — no markdown wrapper, raw JSON only:

```json
{
  "entry": {
    "id": "<kebab-case slug — imperative verb phrase, e.g. use-datatable-not-raw-html>",
    "title": "<Imperative sentence, e.g. Always use <DataTable> for tabular data — never raw HTML tables>",
    "domain": "ui-component",
    "type": "pattern",
    "scope": "global",
    "tags": "<comma-separated string, e.g. svelte,svelte5,data-display,internal-ui,bootstrap>",
    "body": "<full markdown body — see Body Requirements below>",
    "source_repo": "<from package.json repository field, or infer from README link>"
  },
  "confidence_flags": [
    "<one entry per thing that was inferred rather than read directly from source>"
  ]
}
```

### Body Requirements

Include ALL of these sections in this order. Use `##` headings.

#### ## When to use

One sentence naming the condition that tells a developer to reach for this component. If there
are excluded input types or scenarios, name them explicitly.

#### ## Props

A markdown table: `Prop | Type | Required | Description`

Rules:
- List every prop, including those forwarded via `...rest`.
- Use the **exact TypeScript types from Step 3**, not approximations. `string` when the source
  says `InputTypes` is wrong.
- Mark props with types you could not resolve with ⚠️ and add a corresponding confidence flag.
- For `...rest` / spread forwarding, add a single row describing what's forwarded and what's
  explicitly excluded.
- Note deprecated props with ~~strikethrough~~ and a deprecation note in the description.

#### ## Minimal correct usage

One working Svelte 5 `<script lang="ts">` code block showing the simplest correct usage.

If `bind:value` vs controlled (value + onchange) is a meaningful distinction, show both.
If a common variant (e.g. `type="number"`) has meaningfully different behavior, show it too.

#### ## Do not do this

Show the most common mistake — usually a raw HTML element, wrong event syntax, or deprecated
prop usage. Use a `<!-- ❌ ... -->` comment on the bad example and `<!-- ✅ ... -->` on the fix.
Explain specifically what breaks or is missed, not just "don't do this."

If there's a second common mistake (e.g. a deprecated API pattern), show it too.

#### ## Notes

Gotchas, edge cases, and non-obvious behavior. Prioritize:
- Browser-specific workarounds (name the browser and the bug if known)
- Deprecated props or patterns and their replacements
- Type surprises (e.g. number inputs return `null` not `""`)
- Default values that differ from plain HTML defaults
- Anything where the README and the source disagree (document both, add a confidence flag)
- Security or context requirements (e.g. clipboard API requires HTTPS)

---

## Step 5 — Write output and run process-response

**5a.** Write the raw JSON from Step 4 to:
```
$CODEX_REVIEW/<ComponentName>.response.txt
```

**5b.** Run process-response to generate the human-readable `.md` and the insertable `.entry.json`:

```bash
cd $CODEX_INGESTION
# Install deps if needed
[ -d node_modules ] || npm install
npm run process-response -- --name <ComponentName>
```

This produces:
- `review/<ComponentName>.md` — human-readable entry with confidence flags called out
- `review/<ComponentName>.entry.json` — ready for `npm run insert`

---

## Step 6 — Update PROGRESS.md

Read `$CODEX_PROGRESS` and make two edits:

**6a.** Add a row for this component to the `## Components` table (just before the closing `---` after the table). Use the phase `processed` and leave `Model Used` and `Notes` empty:

```
| <ComponentName> | `processed` | | |
```

If a row for `<ComponentName>` already exists, update its phase to `processed` instead of adding a duplicate.

**6b.** Append a Next Steps section for this component at the bottom of the file, matching the format used by recent entries:

```
## <ComponentName> Next Steps
Review: review/<ComponentName>.md
Edit if needed: review/<ComponentName>.entry.json
Insert: cd isoft-memory-experiment/mcp && npm run insert -- ../review/<ComponentName>.entry.json
Activate: npm run activate -- <entry-id>
```

Use the `entry.id` from the JSON produced in Step 4 as `<entry-id>`. If a Next Steps section for this component already exists, replace it rather than duplicating.

Do not touch the Stats block — it is maintained separately.

---

## Step 7 — Report to the user

Tell the user:
- The output files that were written
- Total props documented
- Confidence flags raised — list each one
- Which flags were **resolved** (type read from source) vs **still open** (third-party type, README-only)
- Next steps:
  ```
  1. Review: review/<ComponentName>.md
  2. Edit if needed: review/<ComponentName>.entry.json
  3. Insert: cd isoft-memory-experiment/mcp && npm run insert -- ../review/<ComponentName>.entry.json
  4. Activate: npm run activate -- <entry-id>
  ```
