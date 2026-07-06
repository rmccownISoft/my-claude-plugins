# Pre-PR Review — logging-update
_10 commits, 19 files changed vs origin/main_   ·   Ticket: none

## Strengths
- Dockerfile now uses BuildKit secret mounts (`--mount=type=secret,id=npmrc` / `id=logger_token`) instead of a committed `docker.npmrc`, keeping the npm auth token and logger secret out of image layers/history.
- `src/env.ts` consolidates env reading into small, single-purpose resolvers (`resolveBaseClientUrl` / `resolveOauthIssuer` / `resolveMcpServerUrl`) with explicit warnings when production-relevant vars are unset.
- `stdio-mcp.ts` logging the resolved `API_HOST` instead of the raw `process.env.HOST_ADDR` is a small accuracy improvement.

## Security Issues        *1 finding*

## Security Issues

*1 finding*

### 1. Remote-logging shared secret (`LOGGER_SECRET_TOKEN`) is baked into the DXT artifact distributed to end users
**Severity:** Should-fix
**Location:** `scripts/prepare-build-config.ts:11-14` (writes the token as a source literal) → `dist/build-config.generated.js` (packed by DXT); `.dxtignore` (does not exclude it); manifest path `dist/stdio-mcp.js` → `src/server-options.ts:12` / `src/env.ts:1`
**Source → Sink:** CI build secret `LOGGER_SECRET_TOKEN` (GitHub Actions secret, used by `build-dxt.yml`) → cleartext string embedded in `dist/build-config.generated.js`, which is packed into the publicly-distributed `.dxt` extension.

**Exploit (concrete):**
1. The new build flow injects the org's `LOGGER_SECRET_TOKEN` at build time. `scripts/prepare-build-config.ts` writes it verbatim into `src/build-config.generated.ts`:
   `export const LOGGER_SECRET_TOKEN = ${JSON.stringify(token ?? '')};`
2. `tsc` compiles that to `dist/build-config.generated.js`. The runtime now reads the token from this baked constant (`src/env.ts:1`, re-exported and consumed in `src/server-options.ts:14` via `new McpLogger(COMPANY_CODE, LOGGER_SECRET_TOKEN)`), not from `process.env`.
3. `build-dxt.yml` runs `npm run build` with the secret set, then `npx @anthropic-ai/dxt pack`. A `.dxt` is a zip archive. `.dxtignore` excludes only specific files (`./dist/entryPoint.js`, `*.d.ts`, `*.js.map`, etc.) but **not** `dist/build-config.generated.js`, and that file is required at runtime by the `dist/stdio-mcp.js` import chain — so it ships inside the DXT.
4. Any recipient of the extension unzips the `.dxt` and reads the token in cleartext from `dist/build-config.generated.js`.
5. The token is a live credential: `@isoftdata/logging`'s `RemoteLoggingTransport` sends it as `Authorization: Basic base64(<username>:<secretToken>)` and a `logger-secret-token` header. With the extracted token an attacker can forge authenticated requests to the remote logging server — injecting/spoofing log entries for any company, and potentially poisoning monitoring/alerting.

**Why this matters / trust boundary:** Before this change the manifest supplied the token at runtime per-user via `user_config.logger_secret_token`, so no shared secret left the build environment. After this change the runtime ignores that user_config value and instead a single org-wide secret crosses the trust boundary into every distributed DXT. Rated Should-fix rather than Blocker because exploitation requires obtaining a built `.dxt`, and impact is scoped to the logging server rather than the Enterprise API/customer data — but the secret is real, shared, and live.

**Fix direction:** Don't embed the token in the client artifact — read `LOGGER_SECRET_TOKEN` from `process.env` at runtime (as the manifest's `user_config` already provides), or at minimum add `./dist/build-config.generated.js` to `.dxtignore` and confirm the DXT runtime injects the token via env so remote logging still works.

## Potential Bugs         *2 findings*

## Potential Bugs

*2 findings*

### 1. `build-dxt.yml` runs `npm run build` on Node 20, but the new `prepare-build` step requires Node ≥22.6
**Severity:** Blocker
**Location:** `.github/workflows/build-dxt.yml:17-20` (Node setup) combined with `package.json` `build` script and `scripts/prepare-build-config.ts`
**What breaks:** This diff changes `package.json`'s `build` script to `"npm run prepare-build && tsc --version && tsc"`, where `prepare-build` is `"node --experimental-strip-types scripts/prepare-build-config.ts"`. The `--experimental-strip-types` flag does not exist before Node 22.6 (and TypeScript type-stripping is entirely unavailable in Node 20). The DXT workflow pins `node-version: 20` via `actions/setup-node@v3`. So `npm run build` in that job will fail immediately with an unknown-flag / cannot-run-`.ts` error before `tsc` ever runs. The DXT release artifact will never be produced.
**Repro:** Trigger the "Build Claude DXT" workflow (release `released` event or manual dispatch). The "Build Project" step runs `node --experimental-strip-types scripts/prepare-build-config.ts` under Node 20 and exits non-zero. (Confirmable locally: `package.json` declares `engines.node: ">=22.*"`, and the Docker path correctly uses `node:22-slim`; only this workflow was left on 20.)
**Fix direction:** Bump `build-dxt.yml` to `node-version: 22` (and ideally `setup-node@v4+`) to match `engines` and the Dockerfile.

### 2. Derived `MCP_SERVER_URL` can contain a double slash when `BASE_CLIENT_URL` ends in `/`
**Severity:** Minor
**Location:** `src/env.ts:81` (`const derived = \`${OAUTH_ISSUER}/mcp\``)
**What breaks:** When `MCP_SERVER_URL` is unset and `BASE_CLIENT_URL` (or the `OAUTH_ISSUER` override) is supplied with a trailing slash, e.g. `https://client.example.com/`, the derived value becomes `https://client.example.com//mcp`. The old code stripped trailing slashes from `MCP_SERVER_URL`; this normalization was dropped. The interior `//` is not cleaned by the consumer (`@isoftdata/mcp-server` only strips a *trailing* slash), so the `resource` field and `WWW-Authenticate` `resource_metadata` URL in the OAuth protected-resource metadata will carry the doubled slash, which can break exact-match resource validation per RFC 9728.
**Repro:** Set `BASE_CLIENT_URL=https://client.example.com/`, leave `MCP_SERVER_URL` and `OAUTH_ISSUER` unset; `MCP_SERVER_URL` resolves to `https://client.example.com//mcp`.
**Fix direction:** Strip a trailing slash from `OAUTH_ISSUER`/`BASE_CLIENT_URL` before interpolating `/mcp` (e.g. normalize the base once).

## Tests                  *0 findings*

**Ran:** no test command found (no `test` script in package.json; no Vitest/Jest/Playwright/Mocha config or dependency; no `*.test.ts`/`*.spec.ts` files in the repo). The only "Testing" sections in `README.md:236-254` describe manual interactive testing via MCP Inspector (`npm run mcp-inspector` / `mcp-inspector-stdio`) and a Python `elicitation_client`, both of which require a live MCP server, network, and OAuth credentials and are not automated PR-gating tests.

**Result:** no tests run

*No automated test convention exists in this repo, so there are no in-scope tests to run and no coverage gaps to report under the repo's conventions.*

Context (not findings): `src/env.ts` introduces pure, branchy string logic (`normalizeBaseClientUrl`, `resolveBaseClientUrl`, `resolveOauthIssuer`, `resolveMcpServerUrl`) that would be straightforward unit-test targets — but since the repo has zero testing infrastructure, this is not a coverage finding per the review rules.

*No test issues identified.*

## Documentation          *3 findings*

## Documentation

*3 findings*

### 1. README Docker build command no longer works after Dockerfile switched to BuildKit secrets
**Severity:** Should-fix
**Location:** `README.md:167` (and `README.md:181`)
**Type:** Stale
**What's wrong:** The README's Docker section instructs users to build the image with a plain build:
```
docker build -t mcp_api .
```
(line 167, and `sudo docker build -t mcp_api .` at line 181). This documented command will fail or silently misbuild after this diff.
**Evidence:** The diff rewrote `Dockerfile` to require two BuildKit secrets that the documented command does not pass:
- `Dockerfile:13` — `RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci ...` (npm auth now comes from secret `npmrc`, and `docker.npmrc` was deleted).
- `Dockerfile:17-18` — `RUN --mount=type=secret,id=logger_token export LOGGER_SECRET_TOKEN=$(cat /run/secrets/logger_token) && npm run build ...`.
A bare `docker build .` provides neither secret (and with the classic, non-BuildKit builder the `--mount=type=secret` syntax is rejected outright). The README's build instructions are now incorrect.
**Fix direction:** Update the README Docker build commands to show the required `docker build --secret id=npmrc,... --secret id=logger_token,... .` invocation (or note these builds run via CI).

### 2. README lists LOGGER_SECRET_TOKEN as a runtime env var, but it is now build-time only
**Severity:** Should-fix
**Location:** `README.md:53`
**Type:** Stale
**What's wrong:** Under "### Environment Variables" the README says to "Create a `.env` file ... or set the following environment variables" and lists:
```
LOGGER_SECRET_TOKEN="..."      # Authentication for logging
```
This implies `LOGGER_SECRET_TOKEN` is read at runtime. After this diff it is consumed only at build time and baked into the bundle; setting it at runtime has no effect.
**Evidence:** The diff makes the token build-time-only:
- `scripts/prepare-build-config.ts` reads `process.env.LOGGER_SECRET_TOKEN` at build and writes it into `src/build-config.generated.ts`.
- `src/env.ts:1-2` now imports `LOGGER_SECRET_TOKEN` from `./build-config.generated.js` and re-exports it (no `process.env.LOGGER_SECRET_TOKEN` read at runtime).
- The diff's own `.env.example:19` documents it as "Logger Configuration (build-time only — used by `npm run build`, not read at runtime)", directly contradicting the README's runtime listing.
**Fix direction:** Move `LOGGER_SECRET_TOKEN` out of the runtime env-var list and note it must be set when running `npm run build` (matching `.env.example`).

### 3. README omits the new OAuth/MCP base-URL configuration that replaced the old derivation behavior
**Severity:** Minor
**Location:** `README.md:49-54` (the "# Optional" env-var block)
**Type:** Stale
**What's wrong:** The README's configuration block documents only `PORT`, `UPLOAD_LIMIT`, `LOGGING_SERVER_URL`, and `LOGGER_SECRET_TOKEN` as optional configuration. This diff introduces `BASE_CLIENT_URL` as the primary OAuth-issuer / MCP-base-URL knob (with `OAUTH_ISSUER` and `MCP_SERVER_URL` as overrides), and changes how an unset value behaves — but the README's configuration section still reflects the pre-change world where none of these existed.
**Evidence:** `src/env.ts:57-85` adds `resolveBaseClientUrl()` / `resolveOauthIssuer()` / `resolveMcpServerUrl()`; `BASE_CLIENT_URL` unset now falls back to `https://localhost`, and `MCP_SERVER_URL` unset now derives `${OAUTH_ISSUER}/mcp`. The diff also adds `.env.example:7-14` documenting `BASE_CLIENT_URL` / `OAUTH_ISSUER` / `MCP_SERVER_URL`, so the project clearly intends these to be user-facing config — yet the README's env-var section never mentions them.
**Fix direction:** Add `BASE_CLIENT_URL` (and the `OAUTH_ISSUER` / `MCP_SERVER_URL` overrides) to the README env-var section, mirroring `.env.example`.

Note: No `.svelte` components, no added test files, and no new GraphQL endpoints/resolvers appear in this diff, so concerns 1, 2, and 5 are not applicable. The `.env.example` and Dockerfile comments the diff *adds* were checked for factual correctness against the code and are accurate.

## Lint & Format          *1 finding*

## Lint & Format

**ESLint:** clean
**Prettier:** 5 files unformatted

*1 finding*

### 1. Prettier formatting issues in changed files
**Severity:** Should-fix
**Tool:** Prettier
**What's wrong:** Prettier reported code style issues in 5 of the 5 eligible changed files (scripts/prepare-build-config.ts, src/env.ts, src/mcp-logger.ts, src/server-options.ts, src/stdio-mcp.ts).
**Fix direction:** Run `npx prettier --write` on the changed files to auto-format.

---
## Handoff Summary

| Reviewer        | Blockers | Should-fix | Minor |
|-----------------|:--------:|:----------:|:-----:|
| Security        |    0     |     1      |   0   |
| Potential Bugs  |    1     |     0      |   1   |
| Tests           |    0     |     0      |   0   |
| Documentation   |   n/a    |     2      |   1   |
| Lint & Format   |   n/a    |     1      |   0   |
| **Total**       |  **1**   |   **4**    | **2** |

Tests: none  ·  ESLint: clean  ·  Prettier: 5 files

### Must resolve before handoff (every Blocker — do not omit)
1. **[Potential Bugs]** `build-dxt.yml` runs `npm run build` on Node 20 but `prepare-build` requires Node ≥22.6 — DXT build will fail — `.github/workflows/build-dxt.yml:17-20`

### Should fix
1. **[Security]** `LOGGER_SECRET_TOKEN` is baked into the DXT artifact distributed to end users — `scripts/prepare-build-config.ts:11-14`
2. **[Documentation]** README Docker build command no longer works after Dockerfile switched to BuildKit secrets — `README.md:167`
3. **[Documentation]** README lists `LOGGER_SECRET_TOKEN` as a runtime env var, but it is now build-time only — `README.md:53`
4. **[Lint & Format]** Prettier: 5 changed files unformatted — `npx prettier --write`

**Ready to hand off? — No.**
