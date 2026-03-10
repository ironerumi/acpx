# Changelog

Repo: https://github.com/openclaw/acpx

## Unreleased

### Changes

### Breaking

### Fixes

- ACP/prompt blocks: preserve structured ACP prompt blocks instead of flattening them during prompt handling. (#103) Thanks @vincentkoc.

## 2026.3.10 (v0.1.16)

### Changes

- Tooling: align `acpx` tooling with the wider OpenClaw stack. (#43) Thanks @dutifulbob.
- Docs/contributors: sync contributor guidance with OpenClaw, add the vision doc, and refocus the agent contributor guide. (#68, #97) Thanks @onutc.
- ACP/set-mode: clarify that `set-mode` mode IDs are adapter-defined. (#27) Thanks @z-x-yang.
- Tests/coverage: expand CLI, adapter, and session-runtime coverage and keep the coverage lane on Node 22. (#69, #89) Thanks @vincentkoc and @frankekn.
- Agents/built-ins: add built-in agent support for Copilot, Cursor, Kimi CLI, Kiro CLI, kilocode, and qwen. (#72, #98, #56, #40, #62, #53) Thanks @vincentkoc, @osolmaz, @gandli, @vokako, and @kimptoc.
- Sessions/read: add a `sessions read` command. (#88) Thanks @frankekn.
- Config/exec: add a `disableExec` config option. (#91) Thanks @gandli.
- Claude/session options: add CLI passthrough flags for Claude session options. (#94) Thanks @frankekn.
- Sessions/resume: add `--resume-session` to attach to an existing agent session. (#95) Thanks @frankekn.
- ACP/config: pass `mcpServers` through ACP session setup. (#96) Thanks @frankekn.
- Docs/registry: sync the agent registry documentation with the live built-in registry. (#55) Thanks @gandli.
- Runtime/perf: improve runtime performance and queue coordination, tighten perf capture, reuse warm queue-owner ACP clients, and lazy-load CLI startup modules. (#73, #84, #87, #86) Thanks @vincentkoc.
- Repo/maintenance: add Dependabot configuration and pin ACP adapter package ranges. (#74, #99) Thanks @vincentkoc and @osolmaz.
- Docs/alpha: refresh code and adapter alpha docs. (#75) Thanks @vincentkoc.

### Breaking

### Fixes

- Queue/runtime: stabilize queue sockets and related runtime coordination paths. (#73) Thanks @vincentkoc.
- Gemini/ACP startup: harden Gemini ACP startup and reconnect handling, then fix follow-on session reconnect regressions. (#70, #93) Thanks @vincentkoc and @Takhoffman.
- Claude/ACP startup: harden Claude ACP session creation stalls. (#71) Thanks @vincentkoc.
- Windows/process spawning: use `cross-spawn` for Windows compatibility. (#57) Thanks @sawyer0x110.
- Release/CI: restore the CI release bump flow and keep release jobs on GitHub-hosted runners. (#100, #101) Thanks @osolmaz.

## 2026.3.1 (v0.1.15)

### Changes

### Breaking

### Fixes

- CLI/version: restore `--version` behavior and staged adapter shutdown fallback. (#41) Thanks @dutifulbob.

## 2026.3.1 (v0.1.14)

### Changes

- ACP/session model: land the ACP session model work and define the ACP-only JSON stream contract. (#28, #34) Thanks @osolmaz and @dutifulbob.
- Queue/owner: make the queue owner self-spawn through the `acpx` CLI entrypoint. (#36) Thanks @dutifulbob.
- Metadata/release: restore OpenClaw package metadata for trusted publishing. (#39) Thanks @dutifulbob.
- Tests/queue owner: stabilize queue-owner integration teardown with additional tests. (#37) Thanks @dutifulbob.

### Breaking

### Fixes

- Gemini/session restore: recognize Gemini CLI `Invalid session identifier` failures as session-not-found reconnect cases. (#35) Thanks @louria.
- Sessions/output: suppress replayed `loadSession` updates from user-facing output. (#38) Thanks @dutifulbob.

## 2026.2.26 (v0.1.13)

### Changes

### Breaking

### Fixes

- CLI/version env: ignore foreign `npm_package_version` values in `npx` contexts when resolving the CLI version. (#25) Thanks @dutifulbob.

## 2026.2.26 (v0.1.12)

### Changes

- CLI/version: add dynamic `--version` resolution at runtime. (#24) Thanks @dutifulbob.

### Breaking

### Fixes

## 2026.2.25 (v0.1.11)

### Changes

- Runtime/owners: detach warm session owners from prompt callers and run the `opencode` adapter in ACP mode. (#23) Thanks @dutifulbob.

### Breaking

### Fixes

## 2026.2.25 (v0.1.10)

### Changes

### Breaking

### Fixes

- ACP/reconnect: fall back cleanly when a persisted ACP session is no longer found. (#22) Thanks @dutifulbob.

## 2026.2.25 (v0.1.9)

### Changes

- Docs/session identity: clarify the ACP session identity model and coverage status. (#21) Thanks @dutifulbob.

### Breaking

### Fixes

## 2026.2.24 (v0.1.8)

### Changes

- ACP/session identity: document runtime session ID passthrough from ACP metadata. (#18) Thanks @dutifulbob.
- Repo/metadata: align repository metadata with `openclaw/acpx`. (#19) Thanks @osolmaz.

### Breaking

### Fixes

## 2026.2.23 (v0.1.7)

### Changes

- Runtime/CLI: add the initial OpenClaw ACP integration runtime and CLI primitives. (#17) Thanks @dutifulbob.
- Docs/install: restore global install docs, badges, and `skillflag` setup guidance. (#14) Thanks @dutifulbob.

### Breaking

### Fixes

## 2026.2.20 (v0.1.6)

### Changes

- Docs/README: add the README banner, badges, and simplified setup guidance. (#12, #13) Thanks @dutifulbob.

### Breaking

### Fixes

## 2026.2.20 (v0.1.5)

### Changes

- Runtime/session UX: implement high-priority runtime, config, and session UX features. (#7) Thanks @dutifulbob.
- Tests/integration: add a mock ACP agent and integration tests. (#9) Thanks @dutifulbob.
- Docs/install: clarify `npx` usage and use `@latest` in install commands. (#5, #6) Thanks @dutifulbob.

### Breaking

### Fixes

- Prompt/cancel: cancel prompts cleanly during startup. (#10) Thanks @dutifulbob.

## 2026.2.18 (v0.1.4)

### Changes

- Sessions/routing: require explicit sessions and route prompts by directory walk. (#4) Thanks @dutifulbob.
- Docs/skills: add a quick-setup blurb for agent skill install. (#3) Thanks @dutifulbob.

### Breaking

### Fixes

## 2026.2.18 (v0.1.3)

### Changes

- CI/tests: align CI and test setup and expand coverage for the initial release line. (#1) Thanks @dutifulbob.

### Breaking

### Fixes

- Release/versioning: align release version bumping with the `skillflag` in-memory bump pattern. (#2) Thanks @dutifulbob.
