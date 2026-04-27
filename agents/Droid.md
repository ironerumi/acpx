# Droid

- Built-in name: `droid`
- Aliases: `factory-droid`, `factorydroid`
- Default command: `droid exec --output-format acp`
- Upstream: https://www.factory.ai

## Authentication

Droid is a cloud gateway and requires a Factory API key for every session.
Provide the credential in any one of these forms before running `acpx droid ...`:

- `export FACTORY_API_KEY=<credential>` — the agent-native variable; works
  because `acpx` propagates the parent environment to the child agent.
- `export ACPX_AUTH_FACTORY_API_KEY=<credential>` — triggers ACP `authenticate`
  via acpx and is also forwarded to the child as `FACTORY_API_KEY`.
- Add an entry under `auth.factory-api-key` in `~/.acpx/config.json`.

Obtain a key from the Factory dashboard at https://www.factory.ai.

### Why device-pairing is not used

Droid advertises a `device-pairing` ACP auth method that opens a browser and
waits for completion. acpx runs droid in headless ACP mode where there is no
TTY to display the pairing code, and the call blocks indefinitely. Use a
`FACTORY_API_KEY` instead.

### Interactive `droid` cached credentials do not carry over

Running `droid` interactively caches credentials locally, but
`droid exec --output-format acp` (the command acpx invokes) does not currently
reuse them. Always set `FACTORY_API_KEY` for acpx-driven sessions, even if you
have already logged in via the Droid TUI.
