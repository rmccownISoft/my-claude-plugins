---
name: vault
description: 'The user''s one task system for everything (ISoft work, Makeshift, Tool Library, personal, AI, learning): add tasks, ideas, learning notes, summaries, and handoffs to their Obsidian vault and board from any project, or show what''s on the board. Trigger on "Vault: <topic> — <context>", /vault, "vault this", "add to my vault", "add to my inbox", "put this on my board", "summarize this into my vault", "write a handoff to my vault", "what''s on my board", "what''s in Now", or a close variant. Not for a generic "remember this" with no mention of the vault.'
---

# Vault

The user tracks everything in one Obsidian vault: ISoft work, Makeshift (the makerspace), Tool Library (the nonprofit web app), personal, and AI tasks on one kanban board, plus an inbox, learning notes, and handoffs. This skill works from any project; the current working directory is irrelevant.

## 1. Find the vault

Use the `VAULT_PATH` environment variable if it is set. Otherwise use `G:\My Drive\Vault` (the Google Drive path on both of the user's machines).

Check that `Board.md` exists there. If it doesn't, stop and tell the user the path you tried. Do not create the vault or write anywhere else.

## 2. Read the vault's rules

Read `<vault>/README.md` before every write. It owns the file layout, card format, bucket tags, inbox rules, Jira rules, and the learning-doc style. If it disagrees with this skill, the README wins.

## 3. Decide what the request is

| The user says… | Kind | What you do |
| --- | --- | --- |
| A task, todo, "I should learn X", "investigate X", or anything vague | Inbox | Append one plain line `- <text>` to `Inbox.md`. No tag. |
| "…put it on the board", or names a column/bucket ("add to Now as ISoft") | Card | Add a card to `Board.md` per the README conventions, in the column they named (default: top of `## Later`) |
| "Vault: <topic> — <context>", "vault this", "remember this for my vault" | Learning doc | Write `learning/<kebab-case-topic>.md` from `learning/Template.md`; add a row at the top of the table in `learning/Index.md` |
| "Summarize this article/video <link> into my vault" | Learning doc | Same as above. Put the source link in the header block; "Context" = why it was worth saving |
| "Write a handoff to my vault" | Handoff | See section 4 |
| "What's on my board?", "what's in Now?" | Read only | Read `Board.md`; show Now and Next as a short table (card, bucket). Don't edit anything. |

When unsure between Inbox and Card, use Inbox: triage sorts it later.

## 4. Handoffs

Every handoff gets a board card that links to it.

- **ISoft work** (the current repo belongs to ISoft, or the work is `#ISoft`): write the handoff in the current repo, `docs/handoff-<kebab-topic>.md`. Do not commit it; tell the user it needs committing and pushing so the other machine can see it. Add a card `- [ ] Resume: <topic> → [handoff](<GitHub URL on the current branch>) #ISoft` (plus `#ai` if it is AI work).
- **Everything else**: write `handoffs/<YYYY-MM-DD> <Title>.md` in the vault and add a card linking it with `[[<YYYY-MM-DD> <Title>]]`.
- If a card for that work already exists, append the link to it instead of adding a new card.

A handoff separates: decided, built, proposed but declined, not verified, left to do, and what Claude did on its own initiative. Lead with a status table.

## 5. Resolving vague learning topics

For a learning doc you need a **topic** (short noun phrase) and a **context** (one sentence: what the user was building when this came up).

- From `Vault: <topic> — <context>`: use both as given.
- From `/vault <arg>` or "vault this": derive what's missing from the recent conversation (file names, what was being debugged, the question that started the thread).
- If either is unclear, ask, offering 2–3 concrete candidates. The user would rather be asked than have you guess.

## Rules

- **The trigger is the confirmation.** Don't ask before writing when the request is clear.
- **Never edit the `%% kanban:settings %%` block** at the bottom of `Board.md`, and keep every card to one line.
- **Never create a Jira ticket** without the user's explicit OK.
- **Don't commit** anything in the vault. It syncs through Google Drive, not git.
- If a file you'd create already exists, add `-2` to the name instead of overwriting, and say so.
- **Reply in one line**: what you added and where, e.g. "Added to Inbox.md." or "Saved learning/grep.md and added it to the index." Don't read the content back.
