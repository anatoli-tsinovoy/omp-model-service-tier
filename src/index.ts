import * as path from "node:path";
import { YAML } from "bun";
import { getAgentDir, type ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { isEnoent } from "@oh-my-pi/pi-utils";

const MODEL_SERVICE_TIER_VALUES = ["none", "auto", "default", "flex", "scale", "priority"] as const;
const CONFIG_FILENAME = "omp-model-service-tier.yml";
let injectionEnabled = true;

export type ModelServiceTier = (typeof MODEL_SERVICE_TIER_VALUES)[number];
export type ModelServiceTierMap = Readonly<Record<string, ModelServiceTier>>;

const MODEL_SERVICE_TIERS: Readonly<Record<ModelServiceTier, true>> = {
	none: true,
	auto: true,
	default: true,
	flex: true,
	scale: true,
	priority: true,
};

export interface ModelIdentity {
	provider: string;
	id: string;
}

function normalizeSelector(selector: string): string {
	return selector.trim().toLowerCase();
}

export function getModelServiceTierConfigPath(): string {
	return path.join(getAgentDir(), "extensions", CONFIG_FILENAME);
}

export async function loadModelServiceTiers(configPath: string = getModelServiceTierConfigPath()): Promise<ModelServiceTierMap> {
	let parsed: unknown;
	try {
		parsed = YAML.parse(await Bun.file(configPath).text());
	} catch (error) {
		if (isEnoent(error)) return {};
		throw error;
	}

	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new TypeError(`Model service-tier config must be a YAML mapping: ${configPath}`);
	}

	const tiers: Record<string, ModelServiceTier> = {};
	for (const [rawSelector, rawTier] of Object.entries(parsed)) {
		const selector = normalizeSelector(rawSelector);
		if (!selector) {
			throw new TypeError(`Model service-tier config contains an empty selector: ${configPath}`);
		}
		if (typeof rawTier !== "string" || !Object.hasOwn(MODEL_SERVICE_TIERS, rawTier)) {
			throw new TypeError(
				`Invalid service tier for ${JSON.stringify(rawSelector)} in ${configPath}: ${JSON.stringify(rawTier)}. Expected one of: ${MODEL_SERVICE_TIER_VALUES.join(", ")}`,
			);
		}
		tiers[selector] = rawTier as ModelServiceTier;
	}
	return tiers;
}

export function resolveModelServiceTier(tiers: ModelServiceTierMap, model: ModelIdentity): ModelServiceTier | undefined {
	return tiers[normalizeSelector(`${model.provider}/${model.id}`)] ?? tiers[normalizeSelector(model.id)];
}

export function injectModelServiceTier(payload: unknown, tier: ModelServiceTier): unknown {
	if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return payload;

	if (tier === "none" || tier === "auto") {
		if (!Object.hasOwn(payload, "service_tier")) return payload;
		const next: Record<string, unknown> = { ...payload };
		delete next.service_tier;
		return next;
	}

	if (Reflect.get(payload, "service_tier") === tier) return payload;
	return { ...payload, service_tier: tier };
}

export function registerModelServiceTierExtension(pi: ExtensionAPI, tiers: ModelServiceTierMap): void {

	pi.registerCommand("model-service-tier", {
		description: "Set service-tier injection on or off: /model-service-tier on|off",
		getArgumentCompletions(argumentPrefix) {
			if (argumentPrefix.includes(" ")) return null;
			const normalized = argumentPrefix.trim().toLowerCase();
			return [
				{ label: "on", value: "on", description: "Enable service-tier injection" },
				{ label: "off", value: "off", description: "Disable service-tier injection" },
			].filter(item => item.value.startsWith(normalized));
		},
		async handler(args, ctx) {
			let value = args.trim().toLowerCase();
			if (value === "") {
				const selected = await ctx.ui.select(`Model service-tier injection (currently ${injectionEnabled ? "on" : "off"})`, [
					"on",
					"off",
				]);
				if (!selected) return;
				value = selected;
			}
			if (value !== "on" && value !== "off") {
				ctx.ui.notify("Usage: /model-service-tier <on|off>", "warning");
				return;
			}

			injectionEnabled = value === "on";
			ctx.ui.notify(`Model service-tier injection ${injectionEnabled ? "enabled" : "disabled"}`, "info");
		},
	});

	pi.on("before_provider_request", (event, ctx) => {
		if (!injectionEnabled) return;
		const model = ctx.model;
		if (!model) return;
		const tier = resolveModelServiceTier(tiers, model);
		if (!tier) return;

		const payload = injectModelServiceTier(event.payload, tier);
		return payload === event.payload ? undefined : payload;
	});
}

export default async function modelServiceTierExtension(pi: ExtensionAPI): Promise<void> {
	const configPath = getModelServiceTierConfigPath();
	const tiers = await loadModelServiceTiers(configPath);
	registerModelServiceTierExtension(pi, tiers);
	pi.setLabel("Model Service Tier");
	pi.logger.debug("Model service-tier injection loaded", { configPath, models: Object.keys(tiers).length });
}
