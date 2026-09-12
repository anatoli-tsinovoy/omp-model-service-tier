# omp-model-service-tier

OMP extension that injects `service_tier` per model immediately before supported provider requests are sent.

## Migration: native agent service tiers supersede this extension

[Oh My Pi PR #9668](https://github.com/can1357/oh-my-pi/pull/9668) adds native per-agent service-tier overrides. For task/eval agent policy, migrate to that native setting instead of extending this plugin. Keep the legacy documentation below only while completing the migration.

**Upgrade OMP to a release containing PR #9668 before uninstalling this extension.** Do not rely on a particular release number here; the release that contains the merged change has not been identified. An `omp/18.1.18` installation does not support the new key. After upgrading, verify that the key is known:

```bash
omp config get task.agentServiceTierOverrides --json
```

If that command reports an unknown setting, keep the plugin installed and upgrade again before removing it.

Native agent tiers are **not a drop-in replacement for model/provider selectors**. The native setting is keyed by exact, case-sensitive agent names; tiers do not automatically change when the model changes. It does not choose a model or provider. Native overrides apply to task/eval dispatch, not Vibe workers.

### Translate the old policy by agent role

The plugin's YAML keys are model IDs or provider-qualified selectors. Translate each policy to the task/eval agent roles that use that model; do not assume that a model selector can be copied into `task.agentServiceTierOverrides`. The native resolver applies a concrete value only to the provider family of the agent's final resolved model, after auth fallback and deferred model resolution. An exact override replaces `tier.subagent`; an omitted entry keeps `tier.subagent`. `inherit` follows the parent's live per-family tiers at spawn time, including `/fast` changes.

For example, a native configuration can give the named worker roles priority processing while leaving reviewer roles on the parent policy:

```yaml
# Native OMP config.yml (global, project, or another loaded config layer)
tier:
  openai: flex       # applies to OpenAI and Codex requests
  subagent: inherit
  advisor: inherit

task:
  agentServiceTierOverrides:
    scout: priority
    task: priority
    sonic: priority
    reviewer: inherit          # or omit: fall back to tier.subagent
    security-reviewer: inherit # or omit: fall back to tier.subagent
```

The names above are exact and case-sensitive. `tier.openai` covers both the `openai` and `openai-codex` providers in the OpenAI family. A concrete native value is scoped to the final resolved provider family and is ignored when that family cannot support it; it is not broadcast to unrelated families. The native implementation persists the resolved map with the child session, including an empty map, so a parked child can retain its resolved policy after a restart. Vibe workers continue to use `tier.subagent`.

### Personal Codex overlay

If a personal Codex configuration must disable all service tiers, override every inherited value explicitly in a higher-precedence overlay:

```yaml
# ~/.omp/agent/codex-overlay.yml, loaded after the shared config
tier:
  openai: none
  subagent: none
  advisor: none

task:
  agentServiceTierOverrides:
    scout: none
    task: none
    sonic: none
    reviewer: none
    security-reviewer: none
```

Settings mappings are deep-merged. Therefore, `task.agentServiceTierOverrides: {}` in the personal overlay does **not** clear entries from a lower layer; explicitly set each inherited exact entry to `none`, including entries that were `inherit` in the shared sample. Load the overlay after the shared configuration (for example, with `omp --config ~/.omp/agent/codex-overlay.yml`).

Native `auto` is also different from the plugin's legacy `auto`: where the native provider family supports it, native `auto` sends `service_tier: auto`; native `none` omits the field. In this plugin, `auto` and `none` both remove an existing `service_tier`, while the other values replace or add it. Do not treat the two `auto` policies as equivalent.

### Remove the extension after migration

Once the upgraded native configuration is verified, uninstall the plugin and remove its old per-model configuration from the active OMP agent directory:

```bash
omp plugin uninstall omp-model-service-tier
rm -f ~/.omp/agent/extensions/omp-model-service-tier.yml
rm -f ~/.omp/agent/extensions/omp-model-service-tier.json # if this legacy file exists
```

If `PI_CODING_AGENT_DIR` relocates the active agent directory, remove the corresponding files under that directory instead. Restart existing OMP sessions/processes after uninstalling. Persisted session tiers can outlive a config edit: start a fresh session to use the new configuration and check `/fast status` before sending a request. Do not use `/fast on` to reset tiers: it enables Priority.

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
