---
title: "feat: Generic model selection via ACP session/set_model"
type: feat
status: completed
date: 2026-03-12
origin: docs/brainstorms/2026-03-12-model-and-reasoning-effort-brainstorm.md
linear_issues: [NAI-187, NAI-188]
---

# feat: Generic model selection via ACP `session/set_model`

## Overview

Make `--model` work generically across ACP agents, enable mid-session model switching via the existing `set` command, cache model/mode state locally, and surface it in `status` output. Also document `--model` in CLI.md and track reasoning effort as an external dependency.

## Problem Statement / Motivation

**Model selection is silently Claude-only.** `buildClaudeCodeOptionsMeta()` packs `--model` into `_meta.claudeCode.options.model` — only Claude ACP reads this. Droid, Codex, and all future agents ignore it without warning. The ACP SDK already provides `unstable_setSessionModel()` (verified working with droid), but acpx never calls it.

**No way to switch model mid-session.** Once a session starts, the model is locked. The `set <key> <value>` command sends `session/set_config_option`, but droid returns "Method not found" for this. However, `session/set_model` (dedicated method) works — acpx just doesn't route `set model <id>` through it.

**No introspection.** `status` shows nothing about current model, mode, or available models. Users can't verify their model selection took effect.

**Reasoning effort has no generic ACP path.** `session/set_config_option` with `thought_level` is the intended protocol path, but no agent implements the handler. Droid's `-r` spawn flag works but is process-level only (doesn't persist on resume, can't change mid-session).

(see brainstorm: docs/brainstorms/2026-03-12-model-and-reasoning-effort-brainstorm.md)

## Proposed Solution

Six work items in priority order:

### 1. Implement `session/set_model` on new/resume (HIGH) — DONE

After `session/new` or `session/load`, if `--model` is specified AND the response includes a `models` field, call `connection.unstable_setSessionModel()`. Keep existing `_meta.claudeCode.options.model` for backward compat with Claude ACP.

### 2. Document `--model` in CLI.md (MEDIUM) — DONE

Add `--model`, `--allowed-tools`, `--max-turns` to `docs/CLI.md` global options table.

### 3. Switch model mid-session via `set model <id>` (HIGH) — DONE

Intercept `configId === "model"` in `AcpClient.setSessionConfigOption()` to call `unstable_setSessionModel()` instead of `session/set_config_option`. This reuses the full existing `set <key> <value>` machinery (CLI command, queue IPC, direct path) with zero new IPC messages.

**Why intercept instead of a dedicated `set-model` command?**

1. `session/set_model` is still `@experimental` / `unstable` in the ACP SDK (prefixed `unstable_setSessionModel`). Adding a dedicated command promotes an unstable API to first-class user-facing surface — premature per VISION P4 ("conventions are API surface, scrutinize before adding").
2. `set-mode` exists as a dedicated command because `session/set_mode` is **stable** (no prefix). The precedent supports waiting for stability before adding command surface.
3. Droid supports `session/set_model` but returns "Method not found" for `session/set_config_option`. Intercepting at the client level routes `set model X` through the working path transparently.
4. Single interception point — when the API stabilizes or changes, only one place to update.
5. When `session/set_model` stabilizes, promote `set-model` to a dedicated command (like `set-mode`).

Cross-referenced against `VISION.md`:

- **P1 (Interoperability)**: Normalizes an incompatibility (agents support `set_model` but not `set_config_option(model)`) — VISION explicitly supports this.
- **P2 (Small core)**: Reuses existing `set` machinery. Zero new IPC messages, zero new commands.
- **P4 (Conventions are API surface)**: Avoids premature command surface for an unstable API. The `model` key in `set` is documented as special-cased but not a permanent convention — it's a bridge until the API stabilizes.

### 4. Cache model state in `SessionAcpxState` (HIGH) — DONE

Persist `current_model_id` and `available_models` locally following the existing `current_mode_id` / `desired_mode_id` pattern. Needed for `status` output and for queue-owner reconnection replay (future).

### 5. Enrich `status` with model and mode (MEDIUM) — DONE

Show `model`, `mode`, and `availableModels` in `handleStatus()` text/JSON output.

### 6. Reasoning effort documentation (LOW / external dependency) — DONE

Document the current state: `set thought_level <value>` is the generic ACP path but no agent implements the handler. Document the `-r` spawn flag workaround.

## Technical Considerations

### Design Decisions (from SpecFlow analysis)

**D1: Where to call `set_model` — inside `AcpClient` or in callers?**

Inside `AcpClient.createSession()` and `AcpClient.loadSessionWithOptions()`. Rationale: centralizes the logic, both methods already have access to `this.options.sessionOptions`, and it mirrors how `_meta` is already packed inside `createSession()`. The precedent of `setSessionMode` being in callers is different — mode is replayed on reconnection from persisted state, while model can be handled at the client level.

**D2: Call `set_model` on `loadSession` too?**

Yes, if `--model` is specified AND response has `models`. Model persists server-side (verified for droid), but the user may want to override on resume. Consistent behavior across create and load.

**D3: Failure mode for `set_model`?**

Warn and continue. Print `[acpx] warning: failed to set model <id>: <error>` to stderr. A wrong model is better than no session. Do NOT treat as fatal. This matches the philosophy of `_meta` being silently ignored today.

Agent-side behavior on invalid model IDs is harness-dependent:

- **Rejection** = JSON-RPC error → SDK throws → caught by `trySetModel`, logged as warning
- **Silent acceptance** = empty `{ _meta?: ... }` response (indistinguishable from success)
- Both cases handled correctly by warn-and-continue.

**D4: Client-side validation against `availableModels`?**

No. Let the agent reject unknown models. Log `availableModels` in `--verbose` mode for debugging. `SetSessionModelResponse` is just `{ _meta?: ... }` — no model info echoed back, so acpx cannot confirm the switch succeeded regardless. Agent-side validation is the only reliable path.

**D5: How to route `set model <id>` — new `set-model` command or intercept in `set`?**

Intercept `configId === "model"` in `AcpClient.setSessionConfigOption()` to call `unstable_setSessionModel()`. This reuses the full existing queue IPC and direct-connection machinery for `set_config_option` with zero new IPC message types. The response types are structurally identical (`{ _meta?: { [key: string]: unknown } | null }`).

Rejected: Adding a dedicated `set-model` command with its own `QueueSetModelRequest`, `submitSetModelToQueueOwner`, `runSessionSetModelDirect`, etc. — 7+ files for the same result. More importantly, `session/set_model` is still `@experimental`/`unstable` in the ACP SDK (`unstable_setSessionModel`). Adding a dedicated user-facing command for an unstable API violates VISION P4. The `set-mode` precedent only applies to **stable** ACP methods (`setSessionMode` has no `unstable_` prefix). When `session/set_model` stabilizes, promote to a dedicated `set-model` command.

**D6: Mid-session model switch and reasoning effort interaction?**

Verified in brainstorm session: `-r` (reasoning effort) is orthogonal to `session/set_model` (model switch). Droid applies `-r` as a session-wide default that persists through model switches.

| Spawn flag | Model (via `set_model`) | Thought chars      |
| ---------- | ----------------------- | ------------------ |
| `-r low`   | gpt-5.4                 | **0** (suppressed) |
| `-r high`  | gpt-5.4                 | **467**            |
| no `-r`    | gpt-5.4                 | **425** (default)  |

Reasoning effort only resets when the droid process dies and restarts (session resume), because `-r` is process-level.

### Architecture — 6 Session Paths

All paths where `session/new` or `session/load` is called:

| Path                               | Entry point                 | `set_model` needed?                           |
| ---------------------------------- | --------------------------- | --------------------------------------------- |
| `exec` (runOnce)                   | `session-runtime.ts:653`    | YES, inside `client.createSession()`          |
| `sessions new` (fresh)             | `session-runtime.ts:727`    | YES, inside `client.createSession()`          |
| `sessions new` (resume)            | `session-runtime.ts:711`    | YES, inside `client.loadSessionWithOptions()` |
| `sessions ensure` (new)            | Delegates to `sessions new` | Covered                                       |
| `connectAndLoadSession` (load)     | `connect-load.ts:110`       | YES, inside `client.loadSessionWithOptions()` |
| `connectAndLoadSession` (fallback) | `connect-load.ts:122,128`   | YES, inside `client.createSession()`          |

### Key Concern: Model Persistence on Reconnection

The queue-owner path (`runSessionQueueOwner` at `session-runtime.ts:836`) constructs `AcpClient` without `sessionOptions`. On reconnection, model preference is NOT available.

**Mitigation (WI4):** Cache model in `SessionAcpxState.current_model_id`. Model persists server-side for agents that support `session/set_model`. For the reconnection-fallback-to-fresh-session edge case, model IS lost — but the cached value in `acpx` state makes it reportable via `status`.

### Dual-Write for Claude ACP

Both `_meta.claudeCode.options.model` (on `session/new`) and `set_model` (after response) could theoretically fire for the same agent. **Claude ACP does NOT return `models` in `NewSessionResponse`** (confirmed: it uses the proprietary `_meta.claudeCode.options` path exclusively). So `set_model` is always skipped for Claude — no dual-write occurs today. If Claude ACP adds `models` support in the future, the dual-write would be benign (second call overrides first with same value).

### Race Condition: None

`set_model` is called synchronously between `session/new` response and first `prompt`. Sequential in all paths.

### Reasoning Effort — Current Capability Matrix

| Capability                | acpx                                                          | droid (native)                    | droid (via ACP)               | Claude (via ACP)              |
| ------------------------- | ------------------------------------------------------------- | --------------------------------- | ----------------------------- | ----------------------------- |
| Set on new session        | No flag                                                       | `-r` at spawn                     | `-r` at spawn (process-level) | Not exposed                   |
| Change mid-session        | `set thought_level <value>` sends `session/set_config_option` | N/A                               | **"Method not found"**        | Untested (likely unsupported) |
| Persists on resume        | N/A                                                           | **NO** (process-level)            | **NO** (process-level)        | N/A                           |
| Works alongside `--model` | Yes (orthogonal)                                              | Yes (`-r` + `set_model` verified) | Yes                           | N/A                           |

**Workaround today:** `--agent "droid exec -r high --output-format acp"` injects `-r` at spawn. Works for new sessions. Lost on resume. Orthogonal to `--model`.

**Generic path (future):** When agents implement `session/set_config_option` for `thought_level`, acpx's existing `set thought_level <value>` command will just work — no acpx changes needed.

## System-Wide Impact

- **Interaction graph**: `createSession()` → `session/new` JSON-RPC → parse response → conditional `unstable_setSessionModel()` → return. No callbacks or observers affected.
- **Error propagation**: `set_model` failure caught and logged as warning. Does not propagate to callers.
- **State lifecycle**: WI4 adds `current_model_id` and `available_models` to `SessionAcpxState`. Persisted in session record JSON. Read-only for `status`; written on session creation and `set model` commands.
- **API surface parity**: `loadSessionWithOptions()` gets the same treatment as `createSession()`. `set model` reuses the existing `set` command machinery.
- **`set` command interception**: `AcpClient.setSessionConfigOption()` intercepts `configId === "model"` to call `unstable_setSessionModel()`. All other config IDs pass through unchanged. The queue-owner turn controller and IPC machinery are unaffected — they call `client.setSessionConfigOption()` which handles the routing internally.

## Acceptance Criteria

### Work Item 1: `session/set_model` — DONE

- [x] `AcpClient.createSession()` calls `unstable_setSessionModel()` after `session/new` when `--model` specified AND response has `models` field
- [x] `AcpClient.loadSessionWithOptions()` calls `unstable_setSessionModel()` after `session/load` under same conditions
- [x] Existing `_meta.claudeCode.options.model` path preserved (no regression for Claude ACP)
- [x] `SessionCreateResult` extended to include `models?: SessionModelState` for caller visibility
- [x] Failure in `set_model` logs warning to stderr and does NOT abort session
- [x] `--verbose` mode logs `availableModels` from response
- [x] Integration test: `set_model` called when response has `models` field
- [x] Integration test: `set_model` NOT called when response lacks `models` field
- [x] Integration test: `set_model` failure produces warning, session continues

### Work Item 2: Document `--model` — DONE

- [x] Add `--model`, `--allowed-tools`, `--max-turns` to `docs/CLI.md` global options table (L66-83)
- [x] Note that `--model` requires agent-side support (not all agents may honor it)

### Work Item 3: Switch model mid-session via `set model <id>`

Intercept `configId === "model"` in `AcpClient.setSessionConfigOption()` to call `unstable_setSessionModel()` instead — because droid supports `session/set_model` but NOT `session/set_config_option`.

- [x] `AcpClient.setSessionConfigOption()` intercepts `configId === "model"` → calls `unstable_setSessionModel()` instead
- [x] After successful model set, update `record.acpx.current_model_id` in both queue-IPC path (`setSessionConfigOption` in session-runtime.ts) and direct path (`runSessionSetConfigOptionDirect` in prompt-runner.ts)
- [x] Integration test: `set model <id>` on mock agent calls `session/set_model` (not `session/set_config_option`)

### Work Item 4: Cache model state in `SessionAcpxState`

Persist model info locally so `status` and resume flows can report it. Follow the `current_mode_id` / `desired_mode_id` pattern.

- [x] Add `current_model_id?: string` and `available_models?: string[]` to `SessionAcpxState` (types.ts)
- [x] Parse new fields in `parseAcpxState()` (session-persistence/parse.ts)
- [x] Clone new fields in `cloneSessionAcpxState()` (session-conversation-model.ts)
- [x] On `session/new`, cache `models.currentModelId` and `availableModels` in `record.acpx` (session-runtime.ts:createSession, ~L724-755)
- [x] On `--model` override via `trySetModel()`, update cached `current_model_id` to the requested model
- [x] On `set model <id>` success, update `current_model_id` in record (both queue-IPC and direct paths)

### Work Item 5: Enrich `status` with model and mode

- [x] Add `model`, `mode`, `availableModels` to `handleStatus()` output payload (cli-core.ts, ~L967-977)
- [x] Text output: `model: <id>` and `mode: <id>` lines
- [x] JSON output: include same fields in `status_snapshot`
- [x] Quiet output: no change (keep minimal)
- [x] No-session case: show `model: -` and `mode: -`

### Work Item 6: Reasoning effort documentation (LOW)

- [x] Add note to CLI.md about reasoning effort: `set thought_level <value>` is the generic ACP path, blocked by agent-side support
- [x] Document `-r` spawn flag workaround via `--agent` override (agent-agnostic framing)
- [x] Note that reasoning effort does not persist on session resume (process-level)
- [x] Note that `-r` and `--model` are orthogonal (both work, don't interfere)

### Non-goals (v1)

- [ ] Queue-owner reconnection model replay — acknowledged gap, deferred. Model persists server-side for supported agents, so impact is limited to reconnection-fallback-to-fresh-session edge case
- [ ] `--reasoning-effort` convenience flag — acpx's `set thought_level <value>` already sends the right ACP call; blocked by agent-side: droid returns "Method not found", Claude ACP doesn't expose it
- [ ] Claude ACP reasoning effort support — requires Anthropic internal changes to the Claude ACP agent wrapper
- [ ] Droid `session/set_config_option` for `thought_level` — requires Factory team to wire the handler (same effect as `-r` but mid-session)

## Acceptance Tests

After implementation, run these to verify expected behavior end-to-end. Each test uses the mock agent from `test/mock-agent.ts`.

### AT-1: `set model` routes through `session/set_model`

```bash
# 1. Create session with mock agent that advertises models
acpx --agent "node test/mock-agent.ts --advertise-models" sessions new --name test-set-model

# 2. Switch model mid-session
acpx --agent "node test/mock-agent.ts --advertise-models" set model gpt-5.4 -s test-set-model

# Expected:
# - session/set_model JSON-RPC sent (not session/set_config_option)
# - No error, exit code 0
```

### AT-2: `set model` failure on non-supporting agent

```bash
# 1. Create session with mock agent that does NOT advertise models
acpx --agent "node test/mock-agent.ts" sessions new --name test-no-models

# 2. Try to switch model
acpx --agent "node test/mock-agent.ts" set model gpt-5.4 -s test-no-models

# Expected:
# - session/set_model sent (interception happens regardless — agent rejects if unsupported)
# - Error propagated to user (not warn-and-continue; this is explicit user command)
```

### AT-3: `status` shows model after session creation

```bash
# 1. Create session with --model on agent that advertises models
acpx --model gpt-5.4 --agent "node test/mock-agent.ts --advertise-models" sessions new --name test-status

# 2. Check status
acpx --agent "node test/mock-agent.ts --advertise-models" status -s test-status

# Expected text output includes:
#   model: gpt-5.4
#   mode: <mode-id or ->
```

### AT-4: `status` shows updated model after mid-session switch

```bash
# 1. Create session (default model)
acpx --agent "node test/mock-agent.ts --advertise-models" sessions new --name test-switch-status

# 2. Switch model
acpx --agent "node test/mock-agent.ts --advertise-models" set model gpt-5.4 -s test-switch-status

# 3. Check status
acpx --agent "node test/mock-agent.ts --advertise-models" status -s test-switch-status

# Expected:
#   model: gpt-5.4  (updated after switch)
```

### AT-5: `status` shows model after session resume

```bash
# 1. Create session with --model
acpx --model gpt-5.4 --agent "node test/mock-agent.ts --advertise-models" sessions new --name test-resume-status

# 2. Close and check status (cached value survives)
acpx --agent "node test/mock-agent.ts --advertise-models" sessions close test-resume-status
acpx --agent "node test/mock-agent.ts --advertise-models" status -s test-resume-status

# Expected:
#   model: gpt-5.4  (from cached SessionAcpxState, even though session is dead)
```

### AT-6: Model and reasoning effort are orthogonal (droid, manual)

```bash
# Spawn droid with -r high AND --model
acpx --model gpt-5.4 --agent "droid exec -r high --output-format acp" --verbose exec 'respond with one word' 2>&1

# Expected:
# - set_model called (model switch works)
# - Response includes thinking output (reasoning effort high applied)
# - Both are independent — model switch doesn't reset reasoning effort
```

### AT-7: Reasoning effort via `set thought_level` (expected failure today)

```bash
# Create droid session and try to set thought_level
acpx droid sessions new --name test-thought
acpx droid set thought_level high -s test-thought

# Expected:
# - Error: "Method not found" from droid (agent-side gap)
# - Documents that this path doesn't work yet
```

### AT-8: `status` JSON output includes model fields

```bash
acpx --model gpt-5.4 --format json --agent "node test/mock-agent.ts --advertise-models" sessions new --name test-json-status
acpx --format json --agent "node test/mock-agent.ts --advertise-models" status -s test-json-status

# Expected JSON includes:
#   "model": "gpt-5.4"
#   "mode": ...
#   "availableModels": [...]
```

### AT-9: `set model` updates cached state through queue-owner IPC

```bash
# 1. Create session and send a prompt (starts queue owner)
acpx --agent "node test/mock-agent.ts --advertise-models" sessions new --name test-ipc
acpx --agent "node test/mock-agent.ts --advertise-models" -s test-ipc prompt 'hello'

# 2. While queue owner is running, switch model
acpx --agent "node test/mock-agent.ts --advertise-models" set model gpt-5.4 -s test-ipc

# 3. Check status
acpx --agent "node test/mock-agent.ts --advertise-models" status -s test-ipc

# Expected:
#   model: gpt-5.4  (updated via queue IPC path)
```

## Implementation Guide

### WI3: `set model` interception — `src/client.ts`

In `AcpClient.setSessionConfigOption()`, add interception before the existing call:

```typescript
async setSessionConfigOption(
  sessionId: string,
  configId: string,
  value: string,
): Promise<SetSessionConfigOptionResponse> {
  const connection = this.getConnection();

  // Route "model" through the dedicated session/set_model method.
  // Droid supports session/set_model but NOT session/set_config_option.
  if (configId === "model") {
    await connection.unstable_setSessionModel({ sessionId, modelId: value });
    return {};
  }

  return await connection.setSessionConfigOption({
    sessionId,
    configId,
    value,
  });
}
```

### WI4: Cache model — `src/types.ts`

```typescript
export type SessionAcpxState = {
  current_mode_id?: string;
  desired_mode_id?: string;
  current_model_id?: string;
  available_models?: string[];
  available_commands?: string[];
  config_options?: SessionConfigOption[];
};
```

### WI4: Cache model on create — `src/session-runtime.ts:createSession`

In the `else` branch (~L724) where `createdSession` is obtained:

```typescript
const createdSession = await measurePerf(...);
sessionId = createdSession.sessionId;
agentSessionId = normalizeRuntimeSessionId(createdSession.agentSessionId);
```

Build `acpx` state from session response:

```typescript
const acpx: SessionAcpxState = {};
if (createdSession.models) {
  acpx.current_model_id = createdSession.models.currentModelId;
  acpx.available_models = createdSession.models.availableModels.map((m) => m.modelId);
}
// Override with requested model if --model was specified and set_model was called
if (options.sessionOptions?.model && createdSession.models) {
  acpx.current_model_id = options.sessionOptions.model;
}
```

Use `acpx` in the record at ~L755 instead of `acpx: {}`.

### WI4: Cache model on `set model` — `src/session-runtime.ts:setSessionConfigOption`

After `trySetConfigOptionOnRunningOwner` succeeds (~L1087):

```typescript
if (ownerResponse) {
  const record = await resolveSessionRecord(options.sessionId);
  if (options.configId === "mode") {
    setDesiredModeId(record, options.value);
  }
  if (options.configId === "model") {
    const acpx = record.acpx ?? {};
    acpx.current_model_id = options.value;
    record.acpx = acpx;
  }
  await writeSessionRecord(record);
  ...
}
```

Same pattern in `runSessionSetConfigOptionDirect` (prompt-runner.ts).

### WI5: Enrich status — `src/cli-core.ts:handleStatus`

Add to the payload (~L967):

```typescript
const payload = {
  ...existing,
  model: record.acpx?.current_model_id ?? null,
  mode: record.acpx?.current_mode_id ?? null,
  availableModels: record.acpx?.available_models ?? null,
};
```

Add text output lines (~L956-961):

```typescript
process.stdout.write(`model: ${record.acpx?.current_model_id ?? "-"}\n`);
process.stdout.write(`mode: ${record.acpx?.current_mode_id ?? "-"}\n`);
```

## MVP (WI1+WI2) — DONE

### `src/client.ts` — `createSession()` (~L1047-1077)

```typescript
// After session/new response, attempt set_model via ACP
async createSession(
  cwd: string,
  mcpServers: McpServerConfig[],
): Promise<SessionCreateResult> {
  const connection = this.connection;
  const response = await connection.newSession({
    cwd,
    mcpServers,
    _meta: buildClaudeCodeOptionsMeta(this.options.sessionOptions),
  });

  const sessionId = response.sessionId;
  const agentSessionId = response._meta?.agentSessionId ?? undefined;

  // NEW: call set_model if agent supports it
  const modelId = this.options.sessionOptions?.model;
  if (modelId && response.models) {
    await this.trySetModel(sessionId, modelId, response.models);
  }

  return { sessionId, agentSessionId, models: response.models ?? undefined };
}
```

### `src/client.ts` — `trySetModel()` (new method)

```typescript
private async trySetModel(
  sessionId: string,
  modelId: string,
  models: SessionModelState,
): Promise<void> {
  try {
    if (this.options.verbose) {
      log(`Available models: ${models.availableModels.map(m => m.modelId).join(", ")}`);
    }
    await this.connection.unstable_setSessionModel({ sessionId, modelId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logWarning(`failed to set model ${modelId}: ${msg}`);
  }
}
```

### `src/client.ts` — `loadSessionWithOptions()` (~L1079-1118)

```typescript
// Same pattern after session/load response
const modelId = this.options.sessionOptions?.model;
if (modelId && response.models) {
  await this.trySetModel(response.sessionId, modelId, response.models);
}
```

### `src/client.ts` — extend `SessionCreateResult` (~L79-82)

```typescript
export type SessionCreateResult = {
  sessionId: string;
  agentSessionId?: string;
  models?: SessionModelState;
};
```

### `docs/CLI.md` — global options table addition

```markdown
| `--model <id>` | Set the model for the agent session (requires agent support) |
| `--allowed-tools <tools>` | Comma-separated list of allowed tools |
| `--max-turns <n>` | Maximum number of agent turns |
```

### `test/integration.test.ts` — new test cases (WI1)

```typescript
test("exec --model calls set_model when agent returns models", async () => {
  // Mock agent returns models in session/new response
  // Verify unstable_setSessionModel called with correct modelId
});

test("exec --model skips set_model when agent lacks models support", async () => {
  // Mock agent returns no models in session/new response
  // Verify unstable_setSessionModel NOT called
  // Verify _meta.claudeCode.options.model still sent
});

test("exec --model warns on set_model failure", async () => {
  // Mock agent returns models but set_model throws
  // Verify warning logged, session proceeds normally
});
```

## Smoke Testing (via sonnet subagents)

Dispatch three parallel sonnet subagents during `/workflows:work`. Verification is **deterministic** — based on acpx `--verbose` stderr output, not LLM self-report.

**Verification signals (all from `--verbose` stderr):**

- `models.currentModelId` in `NewSessionResponse` — what model the agent reports using (pre-switch)
- `Available models: ...` log line — confirms agent advertises model switching
- `set_model` JSON-RPC call logged — confirms acpx attempted the switch
- `warning: failed to set model` — confirms error path
- Exit code 0 — session completed successfully

### Claude — no regression

Claude does NOT return `models` in session response, so `set_model` must never fire.

**Nesting workaround:** Claude-via-acpx from inside a Claude session requires stripping nesting-detection env vars (ref: `/Users/gu_yifu/Repos/skills-sprint/plugins/ce-slim/hooks/acpx-claude.sh`):

```bash
env -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_MCP_TOOL_CALL_ID \
    -u CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR \
    -u CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS -u CLAUDECODE \
    acpx --model sonnet --verbose --format quiet claude exec 'say ok' 2>&1
```

- [ ] Exit code 0 (session succeeds)
- [ ] stderr contains NO `Available models:` line (Claude doesn't return `models`)
- [ ] stderr contains NO `set_model` JSON-RPC call
- [ ] `_meta.claudeCode.options.model` present in `session/new` request (visible in verbose)

### Droid — model switching works

Droid returns `models` in session response and supports `session/set_model` (verified in brainstorm).

```bash
acpx --model <target-model-id> --verbose --format quiet droid exec 'say ok' 2>&1
```

- [ ] Exit code 0
- [ ] stderr contains `Available models: ...` with list of model IDs
- [ ] stderr contains `set_model` JSON-RPC call with target model ID
- [ ] `models.currentModelId` in response changes to target (or matches if already default)

### Gemini — determine ACP support

Gemini CLI supports `-m` for model selection at spawn, but ACP `session/set_model` support is unverified.

```bash
acpx --model <target-model-id> --verbose --format quiet gemini exec 'say ok' 2>&1
```

- [ ] Exit code 0
- [ ] Check stderr for `Available models:` → if present, `session/set_model` is supported
- [ ] If supported: `set_model` call logged, `currentModelId` reflects target
- [ ] If not supported: no `set_model` call, `--model` silently ignored (document this finding)

### Dispatch pattern

Each subagent:

1. Runs acpx with `--verbose --format quiet`, captures combined stdout+stderr
2. Greps stderr for deterministic signals listed above
3. Reports structured result: exit code, `models` field present (y/n), `set_model` called (y/n), any warnings/errors

## Dependencies & Risks

| Risk                                                                                | Likelihood | Impact | Mitigation                                                                                                                     |
| ----------------------------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `unstable_setSessionModel()` API changes (marked `@experimental`)                   | Medium     | Medium | Pin SDK version, wrap call, easy to update                                                                                     |
| Claude ACP starts returning `models` → dual-write                                   | Low        | Low    | Benign (same value), can remove `_meta` path later                                                                             |
| Model ID format mismatch across agents                                              | Medium     | Low    | Agent rejects, we warn — user adjusts                                                                                          |
| Queue-owner reconnection loses model                                                | Known      | Low    | WI4 caches in `SessionAcpxState`; future work replays on reconnect                                                             |
| `set model` interception breaks agent that only supports `set_config_option(model)` | Very Low   | Low    | No known agent implements `set_config_option` at all. If one appears, add fallback.                                            |
| `unstable_setSessionModel` API removed or renamed                                   | Medium     | Medium | Single interception point in `AcpClient.setSessionConfigOption()` — easy to update. No dedicated command surface to deprecate. |

## Future Work (out of scope)

- **Promote `set-model` to dedicated command** — when `session/set_model` drops `unstable_` prefix in ACP SDK, add `set-model` command (like `set-mode`) and update `docs/2026-02-19-acp-coverage-roadmap.md` to move it from "Not Yet Supported" to "Supported"
- Replay `current_model_id` from `SessionAcpxState` on queue-owner reconnection (fixes reconnect gap fully)
- Remove `_meta.claudeCode.options.model` once Claude ACP supports `session/set_model`
- `--reasoning-effort` convenience flag when agents implement `session/set_config_option` with `thought_level`
- Client-side model ID fuzzy matching / suggestions
- Droid: implement `session/set_config_option` handler for `thought_level` (Factory team)
- Claude ACP: expose reasoning effort via `session/set_config_option` (Anthropic internal)

## Sources

- **Origin brainstorm:** [docs/brainstorms/2026-03-12-model-and-reasoning-effort-brainstorm.md](docs/brainstorms/2026-03-12-model-and-reasoning-effort-brainstorm.md) — key decisions: use `session/set_model` generically, keep `_meta` backward compat, defer reasoning effort
- **Feasibility session:** `.sessions/260311-1204_930bcf30/main.md` — tested 3 dimensions (acpx, droid exec, droid exec acp) x capabilities (model, reasoning, resume)
- **Implementation session:** `.sessions/260312-1419_e2cc5c01/main.md` — WI1+WI2 implemented
- `src/client.ts:625-650` — `buildClaudeCodeOptionsMeta()`
- `src/client.ts:1047-1077` — `createSession()`
- `src/client.ts:1079-1133` — `loadSessionWithOptions()`
- `src/client.ts:1188-1199` — `setSessionConfigOption()` (interception target for WI3)
- `src/types.ts:279-284` — `SessionAcpxState` (extend for WI4)
- `src/session-runtime.ts:679-768` — `createSession()` (cache model for WI4)
- `src/session-runtime.ts:1077-1111` — `setSessionConfigOption()` (update cache for WI4)
- `src/session-runtime/prompt-runner.ts:188-219` — `runSessionSetConfigOptionDirect()` (update cache for WI4)
- `src/cli-core.ts:922-1000` — `handleStatus()` (enrich for WI5)
- `src/session-persistence/parse.ts:270-295` — `parseAcpxState()` (parse new fields for WI4)
- `src/session-conversation-model.ts:447-460` — `cloneSessionAcpxState()` (clone new fields for WI4)
- `node_modules/@agentclientprotocol/sdk/dist/acp.d.ts:339` — `unstable_setSessionModel()`
- `node_modules/@agentclientprotocol/sdk/dist/acp.d.ts:346` — `setSessionConfigOption()`
- `node_modules/@agentclientprotocol/sdk/dist/schema/types.gen.d.ts:2166` — `SessionConfigOptionCategory: "mode" | "model" | "thought_level" | string`

## Session Log — 2026-03-13

### Decisions

| Decision                    | Chosen                                                             | Rejected                                                | Why                                                                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Where to call set_model     | Inside `AcpClient.createSession()` and `loadSessionWithOptions()`  | Caller-level (like setSessionMode)                      | Centralizes logic; both methods already have `this.options.sessionOptions`                                                                                                                       |
| Failure mode                | Warn and continue                                                  | Fatal / retryable error                                 | Wrong model > no session; matches existing \_meta silent-ignore philosophy                                                                                                                       |
| Client-side validation      | No — let agent reject                                              | Validate against availableModels                        | `SetSessionModelResponse` is opaque; agent-side validation is the only reliable path                                                                                                             |
| Mid-session model switch UX | Intercept `set model <id>` in `AcpClient.setSessionConfigOption()` | Dedicated `set-model` command with full queue IPC stack | `session/set_model` is `@experimental`/`unstable` — premature to add dedicated command surface (VISION P4). Reuses existing machinery; 1 file vs 7+. Promote to `set-model` when API stabilizes. |
| Reasoning effort            | Generic only (`set thought_level`); no agent-specific hacks        | Inject `-r` into droid spawn command                    | Keeps acpx agent-agnostic; `-r` workaround documented via `--agent` override                                                                                                                     |
| Droid auth in SKILL.md      | `FACTORY_API_KEY`                                                  | "native ACP; uses droid's own auth"                     | Previous description was inaccurate                                                                                                                                                              |

### Files Modified (WI1+WI2, commit e008b4b)

- `src/client.ts` — Import `SessionModelState`, extend `SessionCreateResult`, add `trySetModel()`, wire into `createSession()` and `loadSessionWithOptions()`
- `test/mock-agent.ts` — Add `--advertise-models` / `--set-session-model-fails` flags, `models` in responses, `unstable_setSessionModel` handler
- `test/integration.test.ts` — 3 new tests: set_model success, skip, and failure paths
- `docs/CLI.md` — Document `--model`, `--allowed-tools`, `--max-turns` in global options table
- `docs/plans/2026-03-12-feat-generic-model-selection-via-acp-plan.md` — WI1+WI2 acceptance criteria checked off
- `/Users/gu_yifu/Repos/skills-sprint/plugins/ce-slim/skills/acpx/SKILL.md` — Fixed droid auth, added droid reasoning effort + model override example

### Session Export

- Full history: .sessions/260312-1419_e2cc5c01/main.md

### Linear Status

- NAI-187: started — WI1 (session/set_model) and WI2 (CLI docs) implemented, tested, committed, pushed to fork
- NAI-188: backlog — reasoning effort is external dependency (agent-side), no code changes planned

### Caveats

- `--model` on `prompt` (session resume) does NOT work when queue owner is warm — `sessionOptions` not forwarded to queue-owner `AcpClient`. Only `exec` and `sessions new` paths fire `set_model`.
- Model persists server-side (verified droid), so subsequent prompts after `sessions new --model X` use X even though queue owner doesn't replay.

### Open / Next

- None (all WI1-6 complete; see session 2 log below)

## Session Log — 2026-03-13 (session 2)

### Decisions

| Decision                                               | Chosen                                            | Rejected                                               | Why                                                                               |
| ------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `setSessionConfigOption` return for model interception | `{ configOptions: [] }`                           | `{}`                                                   | `SetSessionConfigOptionResponse` requires `configOptions` field per ACP SDK types |
| Extend `SessionLoadResult` with `models`               | Yes — return models from `loadSessionWithOptions` | Only cache on create                                   | Needed for resume path to populate `acpx.current_model_id` on session load        |
| Queue-IPC `writeSessionRecord` for model               | Unified write guard `if (mode \|\| model)`        | Separate `if` blocks each calling `writeSessionRecord` | Avoids double-write when both mode and model change in same call                  |

### Files Modified (WI3-6, commit 30f714b)

- `src/client.ts` — WI3: intercept `configId === "model"` in `setSessionConfigOption()` → `unstable_setSessionModel()`; extend `SessionLoadResult` with `models`
- `src/types.ts` — WI4: add `current_model_id`, `available_models` to `SessionAcpxState`
- `src/session-persistence/parse.ts` — WI4: parse new fields in `parseAcpxState()`
- `src/session-conversation-model.ts` — WI4: clone new fields in `cloneSessionAcpxState()`
- `src/session-runtime.ts` — WI4: cache model on create/resume; update on `set model` (queue-IPC path)
- `src/session-runtime/prompt-runner.ts` — WI4: update `current_model_id` on `set model` (direct path)
- `src/cli-core.ts` — WI5: add model/mode/availableModels to `handleStatus()` text + JSON output
- `docs/CLI.md` — WI6: document `set model` interception, reasoning effort state, `-r` workaround
- `test/integration.test.ts` — 3 new tests: set model success, status after create, status after switch

### Smoke Test Results

| Agent  | Exit | `set_model`                            | Models advertised        | Notes                                                                 |
| ------ | ---- | -------------------------------------- | ------------------------ | --------------------------------------------------------------------- |
| Claude | 0    | Called, succeeded                      | `default, sonnet, haiku` | Claude ACP now returns `models` (new since WI1); dual-write is benign |
| Droid  | 0    | Called, succeeded (`gpt-5.4`)          | 17 models                | Invalid model (`gpt-4.1`) correctly warns and continues               |
| Gemini | 0    | Called, succeeded (`gemini-2.5-flash`) | 7 models                 | **New finding:** Gemini supports `session/set_model`                  |

Mid-session switch verified on droid: `gpt-5.4` → `gemini-3-flash-preview`, `status` reflected update.

### Session Export

- Full history: .sessions/260313-0544_ddac98d3/main.md

### Linear Status

- NAI-187: completed — all WI1-6 implemented, tested, smoke-tested across claude/droid/gemini
- NAI-188: backlog — reasoning effort is external dependency (agent-side), documented in CLI.md

### Open / Next

- Merge to main and push to fork
- Install build locally (`pnpm link --global` or similar)
- Create PR to origin when ready
- Formal AT-1 through AT-9 acceptance tests (optional — smoke tests covered the same ground live)
