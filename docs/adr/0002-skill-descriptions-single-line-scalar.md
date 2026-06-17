# ADR-0002 — SKILL.md `description` must be a single-line scalar

- **Status:** Accepted
- **Date:** 2026-06-17
- **Component:** all `plugins/*/skills/**/SKILL.md`
- **Related:** [scripts/check-skill-descriptions.mjs](../../scripts/check-skill-descriptions.mjs)

## Context

A skill's `description` frontmatter field is the text the model matches against
when deciding whether to invoke a skill. Several of our `SKILL.md` files had the
description authored as a YAML **block scalar** (`description: >` or `>-`), which
spreads the value across multiple indented physical lines:

```yaml
description: >-
  First line of the description.
  Second line that some loaders never read.
```

A spec-compliant YAML parser folds that into a single string, so block scalars
are *logically* valid. The problem is that not every consumer parses YAML — a
loader that reads frontmatter line-by-line takes only the `description:` line (or
just its first indented continuation) and **silently drops every line after the
first**. The trigger keywords on lines 2+ then never reach the model, so the
skill fails to activate for the cases those lines were meant to cover.

This was initially blamed on Prettier "reformatting" descriptions. That is not
the cause: Prettier's default `proseWrap: preserve` keeps whatever form the
author wrote — it neither creates nor collapses block scalars. The block scalars
were authored that way (the model generated them in this form), so the fix
belongs at authoring time, not in the formatter config.

## Decision

Every `SKILL.md` `description` MUST be a **single-line flow scalar** — the entire
value on the same physical line as the `description:` key, quoted:

```yaml
description: 'Use for X. Trigger on a, b, c. Also handles d and e.'
```

- Prefer **single quotes** (matches the repo Prettier `singleQuote: true`); inner
  double quotes need no escaping. Escape a literal apostrophe as `''`.
- Do **not** use `>`, `>-`, `|`, or any block scalar for `description`.
- No hard line wrapping of the value, regardless of length.

This is enforced by [scripts/check-skill-descriptions.mjs](../../scripts/check-skill-descriptions.mjs),
which fails if any `description` spans more than one physical line. Run it before
opening a PR (and it can be wired into CI):

```bash
node scripts/check-skill-descriptions.mjs
```

## Consequences

- **Positive:** descriptions survive any consumer, YAML-parsing or line-oriented;
  the activation text the model sees always matches what the author wrote.
- **Negative:** long descriptions become long physical lines, which read awkwardly
  in an editor without soft-wrap. We accept this — correctness of skill activation
  outweighs source-line aesthetics.
- **Reversible:** if every consumer is confirmed to use a real YAML parser, block
  scalars could be re-allowed. Not worth the risk now.
