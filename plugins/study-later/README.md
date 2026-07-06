# study-later plugin

Two skills sharing one vault repo:

- **study-capture** — in any project, say `study this later` to bank the current concept with a full context snapshot. One exchange, then back to work.
- **study-tutor** — in the study-later vault repo, say `let's study` to build/resume checkpoint-based, hands-on lessons grounded in your real code.

## Setup

1. **Create the vault repo.** Make a GitHub repo named `study-later`, clone it to `~/github/study-later/` on every machine, and copy in the starter `README.md`, `CLAUDE.md`, and `topics/` folder (provided alongside this plugin). Edit the "My projects" and "Technology ground rules" sections of its CLAUDE.md.
2. **Install the plugin** — either:
   - **Marketplace route:** add this `study-later-plugin/` folder to your plugin marketplace repo and install with `/plugin install study-later@<your-marketplace>`.
   - **Plain skills route (no plugin system needed):** copy `skills/study-capture/` and `skills/study-tutor/` into `~/.claude/skills/`.
3. **Optional path override:** if the vault lives somewhere other than `~/github/study-later/`, add one line to your global `~/.claude/CLAUDE.md`: `My study-later vault is cloned at <path>.`

## Daily use

- Mid-work, stuck or curious: **`study this later`** (optionally: `study this later — <what confused you>`)
- In the vault repo: **`let's study`**, and **`done for now`** to stop after any checkpoint.

The vault repo's own README re-explains all of this — future-you never needs this file again after setup.
