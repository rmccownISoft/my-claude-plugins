# Repository guidance

## Authoring `SKILL.md` frontmatter

- The `description` field MUST be a **single-line quoted scalar** — the whole
  value on the same line as `description:`. Never use a YAML block scalar
  (`>`, `>-`, `|`) or wrap the value across multiple lines. Line-oriented skill
  loaders read only the first physical line and silently drop the rest, so a
  multi-line description loses its trigger keywords.

  ```yaml
  description: 'Use for X. Trigger on a, b, c.'   # correct
  ```

  Prefer single quotes (matches Prettier `singleQuote: true`); inner double
  quotes need no escaping, and a literal apostrophe is written `''`.

- Verify before opening a PR: `node scripts/check-skill-descriptions.mjs`
- Rationale: [docs/adr/0002-skill-descriptions-single-line-scalar.md](docs/adr/0002-skill-descriptions-single-line-scalar.md)
