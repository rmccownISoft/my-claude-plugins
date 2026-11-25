---
name: ts-standard
description: 'Check a Node/TypeScript project against the ISoft standard (pnpm, flat ESLint, Prettier, pre-commit hook, CI, LF line endings, changesets for libraries), list its gaps, and confirm when they are closed. The standard lives in standard.yaml and a tested script runs it. Use when the user asks to check, survey, verify or modernize a TypeScript project in the ISoft style.'
---

# TypeScript standard

**Status: draft.** The checks in `standard.yaml` come from isoft-dev's `typescript-project`
skill and haven't been confirmed against a fresh scaffold yet. This skill finds and verifies
gaps; it doesn't fix them yet.

Do not decide yourself whether a project meets the standard. Run the script and report what it prints.

## Survey: what's missing

```sh
node ${CLAUDE_PLUGIN_ROOT}/skills/ts-standard/scripts/check.mjs check ${CLAUDE_PLUGIN_ROOT}/skills/ts-standard/standard.yaml <project-dir>
```

The output is JSON. `facts` is what the script read from the project. Each `fail` result is a
gap, with its reasons in `failures`. Show the developer the gaps as a table, with one row per
failing check and its failures. Then ask which checks to close in this pass. Record the agreed
check ids; verification uses them.

## Verify: are the agreed gaps closed

Run the same command with the agreed ids:

```sh
node …/check.mjs check …/standard.yaml <project-dir> --only pnpm,prettier
```

- Exit 0: every agreed check passes. Say so, and list the ids checked.
- Exit 1: report each remaining failure exactly as printed. The work isn't done.
- Exit 2: a usage error, such as an unknown id. Fix the command; never guess the result.

## Change the standard

Edit `standard.yaml`, then run `node …/check.mjs validate …/standard.yaml`. It must print `valid`.
