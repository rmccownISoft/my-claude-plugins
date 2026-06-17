# iTrack Skills Plugin — Implementation Plan

## Background and Goals

This document guides the implementation of a Claude Code plugin system for distributing
ITrack MCP server skills to users via the Claude Code plugin marketplace. Use it as a
starting point in a fresh Claude session in the private skills repo.

**Key constraints driving the design:**
- Skills for two products (ITrack Enterprise and Presage Analytics) install independently
- Skills live in the private org repo; a public marketplace repo holds the catalog
- No shared skills between products — clean separation
- Auto-updates without reinstall: users get latest on Claude Code startup
- Customer-specific skills must remain isolated from general skills
- No explicit version pinning — use git SHA auto-versioning

---

## Architecture: One Plugin Per Product (Option A)

```
isoft-claude-plugins/          (PUBLIC GitHub repo — marketplace catalog)
└── .claude-plugin/
    └── marketplace.json       ← references the private skills repo via git-subdir

<private-skills-repo>/         (PRIVATE org repo — skill content lives here)
├── enterprise/                ← git-subdir source for itrack-enterprise plugin
│   ├── .claude-plugin/
│   │   └── plugin.json
│   ├── skills/
│   │   ├── <skill-name>/
│   │   │   └── SKILL.md
│   │   └── <skill-name>/
│   │       └── SKILL.md
│   └── .mcp.json              ← optional: auto-configure MCP server on plugin install
└── presage/                   ← git-subdir source for itrack-presage plugin
    ├── .claude-plugin/
    │   └── plugin.json
    ├── skills/
    │   ├── <skill-name>/
    │   │   └── SKILL.md
    │   └── <skill-name>/
    │       └── SKILL.md
    └── .mcp.json              ← optional: auto-configure MCP server on plugin install
```

**Versioning behavior:** Neither `plugin.json` nor the marketplace entry declares a
`version` field. Claude Code uses the git commit SHA as the version. Every commit to
the private skills repo is treated as a new version. Users receive updates automatically
at Claude Code startup — no reinstall needed.

---

## Files to Create in the Private Skills Repo

### `enterprise/.claude-plugin/plugin.json`

```json
{
  "name": "itrack-enterprise",
  "displayName": "ITrack Enterprise",
  "description": "Skills for the ITrack Enterprise MCP server",
  "author": {
    "name": "ISoft Data Systems",
    "email": "support@isoftdata.com"
  },
  "keywords": ["itrack", "enterprise", "mcp"]
}
```

### `presage/.claude-plugin/plugin.json`

```json
{
  "name": "itrack-presage",
  "displayName": "ITrack Presage",
  "description": "Skills for the ITrack Presage Analytics MCP server",
  "author": {
    "name": "ISoft Data Systems",
    "email": "support@isoftdata.com"
  },
  "keywords": ["itrack", "presage", "analytics", "mcp"]
}
```

### Skill file pattern: `enterprise/skills/<skill-name>/SKILL.md`

Each skill is a directory under `skills/` containing a single `SKILL.md`. The directory
name becomes the skill's invocation name. Example for a skill called `get-work-order`:

```markdown
---
description: Retrieve a work order from ITrack Enterprise by ID or search criteria
---

Use the ITrack Enterprise MCP server to retrieve work order details.

[Skill instructions here — describe what the skill does and how Claude should use
the MCP tools to accomplish it. Claude will invoke this automatically when context
suggests it is relevant, or users can call it manually as /itrack-enterprise:get-work-order.]
```

> **Note on SKILL.md frontmatter:** The `description` field is what Claude sees when
> deciding whether to auto-invoke the skill. Write it to match the scenarios where you
> want automatic invocation. Add `disable-model-invocation: true` if you only want
> manual invocation.

### Optional: `enterprise/.mcp.json` (bundle MCP server config with the plugin)

If you want installing the plugin to also configure the MCP server connection for users,
add a `.mcp.json`. This is recommended — it means one install sets up both the skills
and the server connection.

```json
{
  "mcpServers": {
    "itrack-enterprise": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/mcp-server/dist/index.js"],
      "env": {
        "ITRACK_API_URL": "${user_config.api_url}",
        "ITRACK_API_KEY": "${user_config.api_key}"
      }
    }
  }
}
```

If the MCP server is already distributed separately and users configure it themselves,
omit `.mcp.json` from the plugin entirely.

If the MCP server requires user-specific credentials and you want to prompt for them
at install time, add a `userConfig` block to `plugin.json`:

```json
{
  "name": "itrack-enterprise",
  "userConfig": {
    "api_url": {
      "type": "string",
      "title": "ITrack Enterprise API URL",
      "description": "The URL of your ITrack Enterprise instance",
      "required": true
    },
    "api_key": {
      "type": "string",
      "title": "API Key",
      "description": "Your ITrack Enterprise API key",
      "sensitive": true,
      "required": true
    }
  }
}
```

---

## Changes to the Marketplace Repo (isoft-claude-plugins)

In the `isoft-claude-plugins` repo, update `.claude-plugin/marketplace.json` to add
the two new plugin entries. The `source` field uses `git-subdir` to point at the
relevant subdirectory in the private skills repo.

```json
{
  "name": "isoft-plugins",
  "owner": {
    "name": "ISoft Data Systems",
    "email": "support@isoftdata.com"
  },
  "plugins": [
    {
      "name": "itrack-enterprise",
      "displayName": "ITrack Enterprise",
      "description": "Skills for the ITrack Enterprise MCP server",
      "source": {
        "source": "git-subdir",
        "url": "https://github.com/ISoft-Data-Systems/<private-skills-repo>.git",
        "path": "enterprise"
      }
    },
    {
      "name": "itrack-presage",
      "displayName": "ITrack Presage",
      "description": "Skills for the ITrack Presage Analytics MCP server",
      "source": {
        "source": "git-subdir",
        "url": "https://github.com/ISoft-Data-Systems/<private-skills-repo>.git",
        "path": "presage"
      }
    }
  ]
}
```

> Replace `<private-skills-repo>` with the actual repo name. No `version` field
> anywhere — omitting it activates git SHA auto-versioning.

---

## Private Repo Auth Requirement

Because the plugin source is a private GitHub repo, users need credentials to install
and receive auto-updates.

**Interactive install/update:** Uses the user's existing git credentials automatically
(gh auth login, macOS Keychain, Windows Credential Manager, etc.). No extra setup.

**Background auto-update at startup:** Requires `GITHUB_TOKEN` set in the environment.
Users should add this to their shell profile:

```bash
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
```

The token needs `repo` scope (read access to the private skills repo). Document this
as a setup prerequisite for users.

---

## Customer-Specific Skills

Customer-specific skills stay in a separate private repo and are wired up via
project-scoped plugin configuration — not through the main marketplace. This keeps
them isolated per customer with no cross-contamination.

In the customer's project repo, add `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "customer-acme": {
      "source": {
        "source": "github",
        "repo": "ISoft-Data-Systems/acme-skills"
      }
    }
  },
  "enabledPlugins": {
    "acme-skill-name@customer-acme": true
  }
}
```

Each customer gets their own private skills repo following the same plugin structure
as the main products. Commit this settings file to the customer's project repo so it
applies automatically when any team member opens that project.

---

## Implementation Steps

Work through these in order. The marketplace repo changes can be done last — validate
the plugin structure locally first.

1. **Audit existing skills** — list all current skills in both enterprise and presage
   categories. This determines the directory names under `skills/`.

2. **Create the enterprise plugin structure:**
   - `enterprise/.claude-plugin/plugin.json`
   - `enterprise/skills/<name>/SKILL.md` for each existing enterprise skill

3. **Create the presage plugin structure:**
   - `presage/.claude-plugin/plugin.json`
   - `presage/skills/<name>/SKILL.md` for each existing presage skill

4. **Decide on MCP server config bundling** — if the MCP server should be
   auto-configured on plugin install, add `.mcp.json` to each product directory.
   If users manage the MCP server connection separately, skip this.

5. **Validate locally** — from the `isoft-claude-plugins` repo, test with a local
   plugin-dir reference before wiring up the marketplace entry:
   ```
   /plugin install --plugin-dir /path/to/skills-repo/enterprise
   ```

6. **Update marketplace.json** in `isoft-claude-plugins` with the two new entries
   pointing at the private skills repo via `git-subdir`.

7. **Test the full install flow** — add the marketplace locally and install:
   ```
   /plugin marketplace add ./
   /plugin install itrack-enterprise@isoft-plugins
   ```

8. **Verify auto-update** — commit a change to a skill, then run
   `claude plugin update itrack-enterprise` to confirm the new SHA is picked up.

9. **Document GITHUB_TOKEN setup** for end users.

---

## Skill Naming Conventions

- Directory names become invocation names: `skills/get-work-order/` → `/itrack-enterprise:get-work-order`
- Use kebab-case
- Name for the action, not the object: `get-work-order` not `work-order`
- Keep names short — users type them and Claude matches on them

---

## Open Questions to Resolve Before Starting

- [ ] What is the actual name of the private skills repo?
- [ ] Are existing skills already in a structured directory layout, or do they need reorganization?
- [ ] Should the MCP server connection be configured by the plugin, or do users handle that separately?
- [ ] What credentials/config does each MCP server require at runtime?
- [ ] Which customers currently have customer-specific skills that need the isolated setup?
