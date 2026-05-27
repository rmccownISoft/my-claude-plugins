# Claude Plugins

My personal collection of Claude Code plugins.

## Using this marketplace

Add this marketplace to Claude Code VSCode Extension:

```bash
/plugins marketplace https://github.com/rmccownISoft/my-claude-plugins
```

Then install plugins:

```bash
/plugins install 
```

## Plugins


## Development

This is a pnpm workspace with TypeScript project references.

```bash
# Install dependencies
pnpm install

# Type check everything
pnpm run typecheck

# Sync marketplace metadata
pnpm run sync

```

### Adding a new plugin

1. Create `plugins/your-plugin/.claude-plugin/plugin.json` with metadata
2. Add components: agents, commands, skills, or MCP servers
3. If adding an MCP server, update `pnpm-workspace.yaml` and root `tsconfig.json`
4. Run `pnpm run sync` to auto-discover and add to marketplace

The sync script scans `plugins/` and automatically discovers all plugins with valid `plugin.json` files. Add a plugin directory and it shows up. Remove one and it disappears.
5. Versioning: see below.

### Versioning

Version is resolved in this order:

1. `version` in `plugin.json`
2. `version` in the marketplace entry
3. Git commit SHA (if both are omitted)

Setting `version` pins the plugin. If `plugin.json` declares `"version": "1.0.0"`, pushing new commits without changing that string does nothing for existing users — Claude Code sees the same version and keeps the cached copy. Bump the field on every release, or omit it entirely to use the git commit SHA (every commit becomes a new version automatically).

Avoid setting `version` in both `plugin.json` and the marketplace entry. The `plugin.json` value always wins silently, so a stale manifest version can mask a version you set in `marketplace.json`.

## License

MIT
