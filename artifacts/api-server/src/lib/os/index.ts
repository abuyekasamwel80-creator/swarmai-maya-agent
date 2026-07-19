import { ALL_MODELS } from "../models/registry.js";
import { registerModel } from "./rate-limiter.js";

export { acquireModel, releaseModel, getAllStats, getModelStats, isModelAvailable } from "./rate-limiter.js";
export { pickBestModel, getLeastLoadedModel, getModelsForDomain, getAvailableModelsForDomain } from "./model-router.js";
export { getFleetHealth } from "./capacity-monitor.js";

let booted = false;

export function bootAgentOS() {
  if (booted) return;
  booted = true;
  let registered = 0;
  for (const model of ALL_MODELS) {
    registerModel(model.id, { rpm: model.rateLimitRpm, concurrency: Math.max(1, Math.floor(model.rateLimitRpm / 10)), provider: model.provider });
    registered++;
  }
  console.log(`[AgentOS] Booted — ${registered} models registered across ${ALL_MODELS.filter((m) => m.provider === "nvidia").length} NVIDIA + ${ALL_MODELS.filter((m) => m.provider === "openrouter").length} OpenRouter models`);
}
