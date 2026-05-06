---
name: vault
description: Save a learning note to the personal-learning-vault repo. Trigger when the user says "Vault: <topic> — <context>", invokes /vault, says "vault this", or a close variant — from any project. Writes a new doc and updates the index without asking for confirmation when the topic and context are clear.
---

# Vault

## Overview

The user maintains a personal knowledge base at `~/Documents/GitHub/personal-learning-vault`. When they flag a topic mid-conversation, capture it as a doc in that repo. This works from any project; the current working directory is irrelevant.

## When to use

Trigger on any of:

- A message starting with `Vault:` followed by a topic and context (**explicit mode**)
- The `/vault` slash command, with or without an argument (**inferred mode**)
- The user says "vault this", "save this to my vault", or a close paraphrase (**inferred mode**)

Do **not** trigger on generic "remember this" or "save this" — those go to memory, not the vault.

## Resolving topic and context

You always need two things before writing: a **topic** (short noun phrase — the thing being learned) and a **context** (one sentence: what the user was building or trying to do when this came up). How you get them depends on how the skill was invoked.

**From an explicit `Vault:` message** — both are in the message. Use them directly.

**From `/vault <argument>`** — the argument is the topic (or a strong hint toward it). Derive context from the recent conversation.

**From `/vault` with no argument, or "vault this" / "save this to my vault"** — derive both from the recent conversation. Pull context from concrete details (file names, what was being debugged, the question that started the thread). The user has said they often can't articulate context themselves, so do that work for them when the conversation supports it.

**When inferring, ask the user if either topic or context is unclear** — ambiguous topic, vague topic with no obvious noun phrase, sparse conversation, no concrete context to pull from. Prefer offering 2–3 concrete candidates over open-ended questions. The user has explicitly said they'd rather be asked than have you guess. Only write without asking when both topic and context are obvious from what just happened.

## Process

1. **Verify the vault repo exists.** Check that `~/Documents/GitHub/personal-learning-vault` is a directory. If it isn't (e.g. fresh machine, repo not yet cloned, user keeps it elsewhere), stop immediately and tell the user the expected path is missing. Do not attempt to create the directory, clone the repo, or write to a fallback path — ask them how to proceed.

2. **Read the vault's own conventions first.** Open `~/Documents/GitHub/personal-learning-vault/CLAUDE.md`. It owns the doc template, the README index format, and the user's learning-style preferences. Follow whatever it says — if it has changed since this skill was written, the vault's CLAUDE.md wins.

3. **Write the doc** to `~/Documents/GitHub/personal-learning-vault/docs/<kebab-case-topic>.md` using the template defined in the vault's CLAUDE.md. Pull the **Context** field from what the user said when flagging the topic, plus anything relevant from the current conversation (the code they were working on, the problem they hit). Examples should connect to that real context — that's the user's stated learning style.

4. **Update the index** in `~/Documents/GitHub/personal-learning-vault/README.md` — add a row to the topic table per the format in the vault's CLAUDE.md. Sorted newest first.

5. **Tell the user the filename** when done. No long summary, no preview of the doc body.

## Rules

- **Do not ask for confirmation** before writing. The trigger is the confirmation.
- **Do not commit.** Just write the files; the user handles git.
- **Do not narrate** the doc contents back to the user — they'll read the file. A one-line "Saved to `docs/<filename>.md`" is enough.
- If the topic file already exists, append a disambiguator (e.g. `-2`) rather than overwriting, and mention it in the reply.
