# omp-model-service-tier

OMP extension that injects `service_tier` per model immediately before supported provider requests are sent.

## Install

```bash
omp plugin install github:anatoli-tsinovoy/omp-model-service-tier
```

## Configure

Create `omp-model-service-tier.yml` inside the active OMP agent directory's `extensions` directory. The extension resolves the agent directory through OMP's `getAgentDir()` API, so profiles, XDG paths, and `PI_CODING_AGENT_DIR` are supported.

Default-profile example path:

```text
~/.omp/agent/extensions/omp-model-service-tier.yml
```

Example:

```yaml
gpt-5.6-luna: priority
gpt-5.6-sol: none
```

Keys may be bare model IDs or provider-qualified selectors. Provider-qualified selectors take precedence:

```yaml
gpt-5.6-luna: default
openai/gpt-5.6-luna: priority
```

Supported values:

```text
none, auto, default, flex, scale, priority
```

`none` and `auto` remove an existing `service_tier`; the other values replace or add it. Missing configuration is valid and produces no overrides.

## Toggle

Injection is on by default. Use the slash command to change it for the running OMP process:

```text
/model-service-tier off
/model-service-tier on
```

Typing `/model-service-tier` shows the `on|off` usage in command completion. Submitting it without an argument opens an `on`/`off` selector. Typing a trailing space enables argument completion directly.

The state is shared by main and subagent sessions in the same OMP process. Restarting OMP resets it to on. Toggling does not modify the YAML configuration.

## Scope

The extension operates through OMP's `before_provider_request` hook. Calls that do not pass through that extension hook, including some internal one-shot helpers, cannot be modified.

## Migrating from the generic Git form

OMP/Bun can currently report a `DependencyLoop` when an existing installation recorded as `https://github.com/...` is updated through the `github:owner/repo` shorthand. This is a one-time source migration issue; remove the old registry entry before reinstalling:

```bash
omp plugin uninstall omp-model-service-tier
omp plugin install github:anatoli-tsinovoy/omp-model-service-tier
```

## Development

```bash
bun install
bun run check
```
