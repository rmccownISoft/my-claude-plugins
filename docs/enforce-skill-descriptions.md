# Enforcing Single-Line SKILL.md Descriptions

## Background

The `description` field in a `SKILL.md` frontmatter block MUST be a **single-line
quoted scalar** — the whole value on the same physical line as `description:`. Some
skill loaders read only the first physical line of the description, so a multi-line
value (a YAML block scalar `>` / `>-` / `|`, or an inline value that a formatter
wrapped) silently truncates the trigger keywords Claude sees. See
[adr/0002-skill-descriptions-single-line-scalar.md](adr/0002-skill-descriptions-single-line-scalar.md)
for the full rationale.

Prettier (`singleQuote: true`) enforces the quote **style** but does **not** enforce
the single-line rule — a block scalar passes Prettier untouched. So a dedicated check
is needed, wired into gates that run automatically.

## The three pieces

Enforcement is layered so a bad description is caught as early as possible:

| Piece | File | When it runs | Catches |
| --- | --- | --- | --- |
| Checker script | [../scripts/check-skill-descriptions.mjs](../scripts/check-skill-descriptions.mjs) | On demand / from the gates below | Block scalars, empty inline values, wrapped inline values |
| `check` npm script | [../package.json](../package.json) | `pnpm check` (manual) | Same — a memorable entry point |
| Local pre-commit hook | [../.githooks/pre-commit](../.githooks/pre-commit) | Every `git commit` on this machine | Bad descriptions before they're committed |
| CI workflow | [../.github/workflows/checks.yml](../.github/workflows/checks.yml) | Every push to `master` and every PR | Commits made from anywhere (backstop) |

The checker is **dependency-free on purpose** — it uses only Node's stdlib, so it can
be copied into any repo and run with `node` alone.

## How the hook gets activated

Git does not run hooks from a versioned directory by default; it uses `.git/hooks`,
which isn't tracked. To keep the hook in the repo and share it across clones, we point
git at a tracked directory:

```bash
git config core.hooksPath .githooks
```

This is a **per-clone local setting**, so it must run once in each clone. Rather than
rely on remembering, the [package.json](../package.json) `prepare` script runs it
automatically on `pnpm install`:

```json
"prepare": "git config core.hooksPath .githooks"
```

So the full setup in a fresh clone is just `pnpm install`.

### Bypassing the hook

In an emergency: `git commit --no-verify`. CI will still catch it on push.

## Reusing this in another project

1. Copy `scripts/check-skill-descriptions.mjs` into the target repo (it's standalone).
2. Add to `package.json`:
   ```json
   "scripts": {
     "check": "node scripts/check-skill-descriptions.mjs",
     "prepare": "git config core.hooksPath .githooks"
   }
   ```
3. Create `.githooks/pre-commit` (copy [../.githooks/pre-commit](../.githooks/pre-commit)) and make it executable:
   ```bash
   git update-index --chmod=+x .githooks/pre-commit
   ```
4. Activate it in your current clone (or run `pnpm install`):
   ```bash
   git config core.hooksPath .githooks
   ```
5. Copy `.github/workflows/checks.yml` for the CI backstop. On **public** repos GitHub
   Actions is free with unlimited minutes; on private repos a sub-minute lint job stays
   well within the monthly free allowance.

## Verifying it works

```bash
pnpm check                       # run the checker directly
node scripts/check-skill-descriptions.mjs   # same, without pnpm

# Prove the hook fires: temporarily break a description to a block scalar,
# `git add` it, and attempt a commit — it should be rejected.
```
