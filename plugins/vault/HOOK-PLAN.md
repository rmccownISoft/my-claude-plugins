# Vault plugin — adding a `UserPromptSubmit` hook

Notes from a session on 2026-05-06 where the vault skill *did not* get triggered when the user said "save that to my vault" — Claude routed it to the auto-memory system instead. Two contributing factors:

1. The skill wasn't advertised in the session-start available-skills list (it loaded fine when called by namespaced name `vault:vault`, but Claude had no signal it existed). Discovery bug, separate from this plan.
2. Even if advertised, the auto-memory system in the default Claude Code system prompt is aggressive about treating "save this" / "save that" as a memory trigger. Skills lose that fight unless something actively reasserts them at prompt-submit time.

This doc covers the fix for **#2** — a hook that nudges Claude toward the vault skill whenever the user mentions "vault" in a prompt.

---

## Goal

Ship a `UserPromptSubmit` hook *as part of the vault plugin itself*, so any user who enables the plugin gets the nudge automatically — no manual `settings.json` editing on their end.

When the user's prompt contains the word "vault" (case-insensitive, word-boundary), inject a system reminder that says something like:

> User mentioned 'vault'. If this is a save/recall request, invoke the `vault:vault` skill — do not write to memory.

## File layout to add to the plugin

```
my-claude-skills/plugins/vault/
├── .claude-plugin/
│   └── plugin.json          # may need to add a "hooks" field
├── hooks/
│   └── hooks.json           # NEW — declares the UserPromptSubmit hook
├── scripts/
│   ├── vault-nudge.ps1      # NEW — Windows/PowerShell version
│   └── vault-nudge.sh       # NEW — macOS/Linux version (or pick a cross-platform Node script instead)
└── skills/
    └── vault/
        └── SKILL.md         # already exists
```

## `plugin.json` field

Add (or confirm present):

```json
{
  "name": "vault",
  "version": "0.2.0",
  "hooks": "./hooks/hooks.json"
}
```

Hooks can be declared inline as an object on `plugin.json` instead, but a separate `hooks.json` is cleaner once there's more than one entry.

## `hooks/hooks.json`

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "type": "command",
        "command": "pwsh -File ${CLAUDE_PLUGIN_ROOT}/scripts/vault-nudge.ps1"
      }
    ]
  }
}
```

Use `${CLAUDE_PLUGIN_ROOT}` — never hardcode paths. This variable resolves to the plugin's install directory at hook-fire time.

## `scripts/vault-nudge.ps1` (Windows)

```powershell
$payload = [Console]::In.ReadToEnd() | ConvertFrom-Json

if ($payload.userMessage -match '(?i)\bvault\b') {
    @{
        systemMessage = "User mentioned 'vault'. If this is a save/recall request, invoke the vault:vault skill — do not route to memory."
    } | ConvertTo-Json
}

exit 0
```

## Cross-platform consideration

The `pwsh` invocation works on macOS/Linux too **if** the user has PowerShell 7+ installed — but that's not a safe assumption. Cleanest options:

- **Option A:** Ship a Node script and use `node ${CLAUDE_PLUGIN_ROOT}/scripts/vault-nudge.js`. Node is generally present where Claude Code is.
- **Option B:** Detect OS in the hook command (e.g. two entries in the `UserPromptSubmit` array, each with its own platform check) — clunky.
- **Option C:** Ship both `.ps1` and `.sh` and pick based on something — but `hooks.json` doesn't have native OS-conditional logic, so this still needs a wrapper.

Recommendation: **Node script.** Single file, runs everywhere Claude Code runs.

### Node version (preferred)

`scripts/vault-nudge.mjs`:

```js
import { stdin } from 'node:process'

let raw = ''
for await (const chunk of stdin) raw += chunk

let payload
try { payload = JSON.parse(raw) } catch { process.exit(0) }

const msg = payload?.userMessage ?? ''
if (/\bvault\b/i.test(msg)) {
  process.stdout.write(JSON.stringify({
    systemMessage: "User mentioned 'vault'. If this is a save/recall request, invoke the vault:vault skill — do not route to memory."
  }))
}

process.exit(0)
```

`hooks.json` then becomes:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "type": "command",
        "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/vault-nudge.mjs"
      }
    ]
  }
}
```

## Hook contract reminders (from Anthropic docs)

- Input is JSON on stdin. The shape includes `userMessage` (the prompt text) and other context metadata.
- Stdout: emit JSON with a `systemMessage` field to inject a reminder, or stay silent.
- Exit codes:
  - `0` — success, stdout is processed.
  - `2` — blocking error, stderr is shown to Claude, prompt is cancelled. **Do not use this for the vault nudge** — a regex miss is not a failure.
  - Other non-zero — non-blocking warning, first stderr line is shown.
- Reference: https://code.claude.com/docs/en/hooks.md
- Plugin hook reference: https://code.claude.com/docs/en/plugins-reference.md

## Testing plan

When you come back to this:

1. **Implement the Node version** of the hook in `my-claude-skills/plugins/vault/`.
2. **Bump plugin version** in `plugin.json` (e.g. 0.1.0 → 0.2.0).
3. **Test locally without going through the marketplace** — point Claude Code at the local plugin path so iteration is fast. Should be doable via `/plugin install <local-path>` or by symlinking the cache. Verify the exact mechanism in the plugin docs first.
4. **Smoke test cases** to run in a fresh Claude Code session after install:
   - Prompt: "save that to my vault" → expect Claude to invoke `vault:vault`, not write to memory.
   - Prompt: "vault this" → same expectation.
   - Prompt: "Vault: try/finally — context here" → same.
   - Prompt: "remember that I prefer X" → expect normal memory behavior, no vault nudge (since "vault" isn't in the prompt).
   - Prompt: "the vault repo at github.com/..." → the nudge will fire (regex matches), but Claude should still recognize the user is *talking about* the vault, not asking to save to it. Confirm this doesn't cause weird behavior. If it does, tighten the regex (e.g. require "save" or "to" near "vault").
5. **Verify hook output with a manual stdin test:**
   ```powershell
   '{"userMessage":"save that to my vault"}' | node ./scripts/vault-nudge.mjs
   # expect: {"systemMessage":"User mentioned 'vault'..."}
   ```
   ```powershell
   '{"userMessage":"hello world"}' | node ./scripts/vault-nudge.mjs
   # expect: empty stdout, exit 0
   ```
6. **Check session-start advertisement** — once the hook is shipping, also investigate why `vault:vault` isn't appearing in the available-skills list at session start. If the hook fires reliably, that's a separable issue but still worth fixing (other LLMs / sessions where the hook hasn't fired yet still need the skill to be discoverable).
7. **Publish** to the `rmccown-claude-plugins` marketplace. Users get the hook on next plugin update.

## Open questions for later

- Does the hook fire before or after the auto-memory system prompt is composed? If after, the `systemMessage` injection may not actually beat memory's pull. May need to test empirically and, if memory still wins, escalate the language in the `systemMessage` (e.g. "**Do not** save this to memory — use vault:vault").
- Should the nudge also fire on phrases like "save this" or "remember that" *without* the word "vault"? Probably not — that would steal genuine memory writes. Stick to explicit "vault" mentions.
- Should there be a corresponding `SessionStart` hook that injects a reminder once per session listing the vault skill, in case it's still missing from the advertised skills list? Belt-and-suspenders, but cheap.
