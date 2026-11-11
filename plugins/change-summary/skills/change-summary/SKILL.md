---
name: change-summary
description: 'Summarize code changes file by file in plain English, comparing them against a related plan doc if one exists. Use when the user asks what changed, wants a review summary of changes Claude made, or types /change-summary.'
---

# Change summary

The user didn't write these changes and needs to understand them quickly.

## 1. Find the changes

- If the user gave a target (a commit, branch, or PR number), use that.
- Otherwise: uncommitted changes first (`git status`, `git diff`). If there are none,
  use the current branch compared to master (`git diff master...HEAD`).
- Read new (untracked) files in full. Diffs don't show them.

## 2. Find the plan

- Look in `docs/` for a plan whose name matches the branch or ticket number (e.g. DOPS-323).
- If there's none, skip the plan comparison and say so in one line.

## 3. Write the summary

For each file, a heading with the file path (mark new files "(new)"),
then 2-4 sentences:

- What changed, in plain concrete words.
- Why. Tie it to the plan step or ticket where you can.
- Note anything that differs from the plan: extra changes, skipped steps,
  or optional steps that were done.

Then:

- **Not part of this work:** list changed files that don't belong to the
  ticket or plan, so they can be committed separately or left out.
- **Not checked:** say plainly what wasn't verified (tests, lint, build).

## Style

- Plain English. No jargon-heavy or abstract phrasing.
- Short. Don't repeat the diff. Explain it.
- Don't make any changes to files. This is read-only.
