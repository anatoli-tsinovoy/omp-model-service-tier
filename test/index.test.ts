import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "bun:test";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import {
	getModelServiceTierConfigPath,
	injectModelServiceTier,
	loadModelServiceTiers,
	registerModelServiceTierExtension,
	resolveModelServiceTier,
	type ModelServiceTierMap,
} from "../src";

describe("model service-tier extension", () => {
	it("addresses config through OMP's active agent directory", () => {
		expect(getModelServiceTierConfigPath()).toEndWith(path.join("extensions", "omp-model-service-tier.yml"));
	});

	it("loads YAML selectors and ignores a missing config", async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "omp-model-service-tier-"));
		try {
			const configPath = path.join(tempDir, "tiers.yml");
			await Bun.write(configPath, "gpt-5.6-luna: priority\ngpt-5.6-sol: none\n");
			const tiers = await loadModelServiceTiers(configPath);

			expect(resolveModelServiceTier(tiers, { provider: "openai", id: "gpt-5.6-luna" })).toBe("priority");
			expect(resolveModelServiceTier(tiers, { provider: "openai-codex", id: "gpt-5.6-sol" })).toBe("none");
			expect(await loadModelServiceTiers(path.join(tempDir, "missing.yml"))).toEqual({});
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	it("prefers a provider-qualified selector over a bare model ID", () => {
		const tiers: ModelServiceTierMap = {
			"gpt-5.6-luna": "default",
			"openai/gpt-5.6-luna": "priority",
		};

		expect(resolveModelServiceTier(tiers, { provider: "openai", id: "gpt-5.6-luna" })).toBe("priority");
		expect(resolveModelServiceTier(tiers, { provider: "openai-codex", id: "gpt-5.6-luna" })).toBe("default");
	});

	it("registers an on-by-default hook that can be disabled and re-enabled", async () => {
		type ProviderRequestHandler = (
			event: { type: "before_provider_request"; payload: unknown },
			ctx: { model?: { provider: string; id: string } },
		) => unknown;
		type CommandHandler = (
			args: string,
			ctx: { ui: { notify(message: string, level: "info" | "warning"): void } },
		) => Promise<void> | void;

		let providerHandler: ProviderRequestHandler | undefined;
		let commandHandler: CommandHandler | undefined;
		const notifications: string[] = [];
		const extensionApi = {
			on(event: string, registered: ProviderRequestHandler) {
				if (event === "before_provider_request") providerHandler = registered;
			},
			registerCommand(name: string, options: { handler: CommandHandler }) {
				if (name === "model-service-tier") commandHandler = options.handler;
			},
		} as unknown as ExtensionAPI;
		registerModelServiceTierExtension(extensionApi, {
			"gpt-5.6-luna": "priority",
			"gpt-5.6-sol": "none",
		});
		if (!providerHandler) throw new Error("before_provider_request handler was not registered");
		if (!commandHandler) throw new Error("model-service-tier command was not registered");

		const lunaEvent = { type: "before_provider_request" as const, payload: { service_tier: "default" } };
		const lunaContext = { model: { provider: "openai", id: "gpt-5.6-luna" } };
		const commandContext = {
			ui: {
				notify(message: string) {
					notifications.push(message);
				},
			},
		};

		expect(providerHandler(lunaEvent, lunaContext)).toEqual({ service_tier: "priority" });
		await commandHandler("off", commandContext);
		expect(providerHandler(lunaEvent, lunaContext)).toBeUndefined();
		await commandHandler("on", commandContext);
		expect(providerHandler(lunaEvent, lunaContext)).toEqual({ service_tier: "priority" });
		expect(notifications).toEqual([
			"Model service-tier injection disabled",
			"Model service-tier injection enabled",
		]);
	});

	it("does not mutate the provider payload", () => {
		const payload = { model: "gpt-5.6-luna", service_tier: "default", stream: true };
		expect(injectModelServiceTier(payload, "priority")).toEqual({
			model: "gpt-5.6-luna",
			service_tier: "priority",
			stream: true,
		});
		expect(payload.service_tier).toBe("default");
	});
});
