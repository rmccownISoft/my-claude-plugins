---
name: pr-review-tracker
description: Use when the user wants to turn a GitHub Pull Request's review comments into an actionable checklist or response tracker — e.g. "make a checklist from PR #231's comments", "help me respond to my PR reviews", "summarize the requested changes on this PR", or when they're overwhelmed mapping reviewer feedback back to individual comment threads. Produces a complete, thread-by-thread document with direct links to each comment and a paste-ready reply for each.
---

# PR Review Response Tracker

## Overview

Turn every review comment on a GitHub PR into one shareable document where each review
thread is anchored to a direct link, has a clear status, and a **reply the user can paste
straight into that thread** — no hunting for which comment a note refers to, no translating
feedback into a reply by hand.

This skill exists because of two recurring failure modes when summarizing PR reviews:
1. **Incompleteness** — missing some threads (e.g. "only covered 13 of 16").
2. **Lost traceability** — feedback that isn't anchored to its specific comment thread, so the
   user has to manually map each note back to GitHub and rewrite it as a reply.

**Cover 100% of threads. Anchor every one with a deep link. Give a paste-ready reply for each.**

## When to Use

- User asks for a checklist / summary / tracker of a PR's review comments.
- User is responding to a PR review and wants help organizing or replying.
- User says reviews are "a mess" to map back to comments.

## Step 0 — Get a GitHub token (no `gh` CLI required)

Reading PRs needs a token that identifies the user to GitHub's API. **PRs are a GitHub feature,
not a `git` feature** — `git` only manages local commits/branches. Try these in order; any one works:

1. **`gh` CLI, if installed** — `gh api repos/<owner>/<repo>/pulls/<n>/comments` is simplest.
   Check with `gh --version` first.
2. **`GITHUB_TOKEN` / `GH_TOKEN` env var** — if set, use it directly.
3. **Git credential helper** — works on any machine that has pushed over HTTPS or uses GitHub
   Desktop (token saved in the OS credential store). `git` is used here only as a keychain:

   ```powershell
   $cred  = "protocol=https`nhost=github.com`n" | git credential fill 2>$null
   $token = ($cred | Select-String '^password=').ToString().Substring(9)
   ```

   ⚠️ **SSH-only clones** (`git@github.com:...`) have no stored token — fall back to `gh` or a PAT.

Derive the repo slug from the remote:
```powershell
$repo = (git remote get-url origin) -replace '^https://github.com/','' -replace '\.git$',''
```

**Never print the token.** Keep it in a variable; only echo derived data.

## Step 1 — Fetch everything

Build headers and fetch metadata, reviews, and inline (line-level) comments. The inline
`comments` endpoint is where the actionable detail lives.

```powershell
$headers = @{ Authorization = "token $token"; "User-Agent" = "claude-code"; Accept = "application/vnd.github+json" }
$n = 231  # PR number — ask the user if not given
$pr      = Invoke-RestMethod -Headers $headers -Uri "https://api.github.com/repos/$repo/pulls/$n"
$reviews = Invoke-RestMethod -Headers $headers -Uri "https://api.github.com/repos/$repo/pulls/$n/reviews"
$comments= Invoke-RestMethod -Headers $headers -Uri "https://api.github.com/repos/$repo/pulls/$n/comments?per_page=100"
```

If the user didn't give a PR number, ask (or list open PRs via `.../pulls?state=open`).
For each inline comment capture: `id`, `user.login`, `path`, `line` (fall back to
`original_line`), `start_line`, `in_reply_to_id`, and `body`. If output is large, write it to a
file and Read it back rather than truncating — **do not lose comments**. If there are >100
comments, paginate (follow the `Link` header / `&page=`).

## Step 2 — Reconstruct threads

- A **thread** = a top-level comment (`in_reply_to_id` is null) plus all comments whose
  `in_reply_to_id` chains back to it.
- The **latest review round** (newest `reviews` entry plus newest comments) is **authoritative**.
  When an old thread and a newer comment conflict, the newer one wins.
- Watch for a single decision that **moots** many older threads (e.g. "remove the permission
  checks" makes every "how should the permission check work" thread obsolete). Detecting this is
  the highest-value thing this skill does — it collapses an intimidating list into a few real items.

## Step 3 — Check current code state

For each file referenced by a comment, Read it and decide the real status:
- ✅ **Done** — already addressed in the working tree.
- 🔧 **To do** — a required change not yet made.
- 🟡 **Decision** — needs a human choice before coding (present the options, don't invent the answer).
- 💤 **Moot** — superseded by a later decision; no code change, but still reply so the thread closes.

Don't assume the PR description reflects the code — verify against the files.

## Step 4 — Write the tracker

Save to `docs/reviews/pr-<n>-responses.md` (create `docs/reviews/` if missing). Structure:

```markdown
# PR #<n> — Review Response Tracker

**PR:** [<title>](<pr html_url>)
**Branch:** `<head.ref>` → `<base.ref>`

Covers **all <N> review threads**. Each entry links directly to the comment, states what's
asked, the status, and a reply you can paste straight into that thread.

### Status legend
- ✅ Done · 🔧 To do · 🟡 Decision · 💤 Moot (reply to close)

### Summary
| Status | Count |
| ✅ Done | n |  | 🔧 To do | n |  | 🟡 Decision | n |  | 💤 Moot | n |

> ⭐ Call out the single decision (if any) that unlocks/moots the most threads.

## 🟡 DECISION NEEDED FIRST
<thread(s) with options A/B and a paste-ready reply containing a [pick one] placeholder>

## 🔧 TO DO
## ✅ DONE (reply to confirm and close)
## 💤 MOOT (reply to close each)
```

For **every** thread include:
- A heading with `file:line` and a **direct deep link**:
  `https://github.com/<repo>/pull/<n>#discussion_r<comment_id>`
- **Asked:** one-line summary of the reviewer's point.
- **Status:** one of the four.
- **Paste-ready reply:** written in the PR author's first-person voice — acknowledge + state the
  concrete action. For 🟡 decisions, leave a `[Option A … / Option B …]` placeholder for the user to pick.

Moot threads can be collapsed into a table (Thread link | Was about | Paste-ready reply) to keep
the doc tight, but never silently drop one.

## Step 5 — Report

In chat: give the summary counts, name the unlocking decision, and offer to implement the
clear-cut 🔧 items. Do not post replies to GitHub unless the user explicitly asks.

## Guardrails

- **Completeness is the contract.** Count the threads, state the count, cover every one.
- Never expose the token.
- Never invent a decision that's the user's to make — present options.
- Verify status against the actual code, not the PR description.
