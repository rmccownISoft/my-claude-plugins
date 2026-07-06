# Normalizing Line Endings to LF

## Background

This repo relies on each developer's per-machine `core.autocrlf=true` setting to
manage line endings across our mixed Mac/Windows environment. That works for keeping
LF in the repo, but it has two problems:

1. **It's per-machine, not per-repo.** Nothing in the repo enforces consistency, so
   different clones can behave differently depending on each dev's git config.
2. **`autocrlf=true` forces CRLF in the Windows working tree.** Our tooling (Prettier,
   ESLint) emits and expects LF, so Windows checkouts get CRLF on disk → Prettier
   rewrites to LF → every line shows as "changed," and `git status` shows phantom
   modified files even when the content is byte-for-byte identical to `HEAD`.

The fix is to move the decision into the repo with a committed `.gitattributes` file.
It overrides whatever `core.autocrlf` each developer has set and guarantees LF in both
the repo **and** everyone's working tree (including Windows).

## Steps

```bash
# 1. Start from an up-to-date main and create a branch
git checkout main
git pull
git checkout -b normalize-line-endings

# 2. Create .gitattributes at the repo root (see contents below)

# 3. Stage it
git add .gitattributes

# 4. Re-apply the LF filter to all tracked files
git add --renormalize .

# 5. Review what actually changed before committing
git status
git diff --cached --stat

# 6. Commit
git commit -m "Normalize line endings to LF via .gitattributes"

# 7. (Optional) Make it explicit that .gitattributes is now the source of truth
git config --local core.autocrlf false

# 8. Push and open a PR
git push -u origin normalize-line-endings
```

## `.gitattributes` contents

Create a file named `.gitattributes` at the repo root with:

```gitattributes
* text=auto eol=lf
```

- `text=auto` lets git auto-detect text vs. binary files.
- `eol=lf` forces LF in the working tree for text files on every platform.

## What to expect

- **The commit will likely be small.** The repo already stores LF, so `--renormalize`
  only rewrites files that aren't already LF. Often this is just `.gitattributes` plus
  a few stragglers. A small diff is expected, not a sign it didn't work.
- **The phantom modified files clear up.** Files that previously showed as `M` in
  `git status` with an empty `git diff` should stop doing so once this lands and the
  working tree is re-checked-out.
- **Heads-up for the team:** after this merges, other developers (especially on
  Windows) may see their working tree update line endings on their next pull. If anyone
  has uncommitted CRLF changes, it's cleanest for them to stash or commit first, but the
  update is usually seamless.

## How to verify line endings (reference)

```bash
git ls-files --eol <file>        # shows index (i/) and working-tree (w/) eol
git diff <file>                  # authoritative content diff (empty = no real change)
cmp <file> <(git show :<file>)   # byte-compare working file vs committed blob
```
