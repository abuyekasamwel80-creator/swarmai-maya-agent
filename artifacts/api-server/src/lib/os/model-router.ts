import { ALL_MODELS, type UnifiedModel } from "../models/registry.js";
import { isModelAvailable, getModelStats } from "./rate-limiter.js";

const DOMAIN_SCORES: Record<string, Record<string, number>> = {
  code: { "qwen/qwen3-coder:free": 10, "ibm/granite-34b-code-instruct": 10, "ibm/granite-8b-code-instruct": 9, "meta/codellama-70b": 9, "bigcode/starcoder2-15b": 9, "google/codegemma-1.1-7b": 9, "deepseek-ai/deepseek-coder-6.7b-instruct": 9, "mistralai/codestral-22b-instruct-v0.1": 9, "cohere/north-mini-code:free": 9, "poolside/laguna-m.1:free": 9, "poolside/laguna-xs-2.1:free": 8, "deepseek-ai/deepseek-v4-pro": 9, "deepseek-ai/deepseek-v4-flash": 8, "nvidia/nemotron-4-340b-instruct": 8, "openai/gpt-oss-120b": 8, "qwen/qwen3.5-397b-a17b": 9, "mistralai/mistral-large-3-675b-instruct-2512": 8 },
  research: { "nousresearch/hermes-3-llama-3.1-405b:free": 10, "nvidia/nemotron-3-ultra-550b-a55b": 10, "nvidia/llama-3.1-nemotron-ultra-253b-v1": 10, "nvidia/nemotron-4-340b-instruct": 9, "deepseek-ai/deepseek-v4-pro": 9, "moonshotai/kimi-k2.6": 9, "minimaxai/minimax-m3": 9, "mistralai/mistral-large-3-675b-instruct-2512": 9, "qwen/qwen3.5-397b-a17b": 9, "ai21labs/jamba-1.5-large-instruct": 8, "meta/llama-3.3-70b-instruct": 8, "nvidia/llama-3.1-nemotron-70b-instruct": 8, "writer/palmyra-fin-70b-32k": 8, "writer/palmyra-med-70b-32k": 8 },
  writing: { "cognitivecomputations/dolphin-mistral-24b-venice-edition:free": 9, "writer/palmyra-creative-122b": 10, "meta/llama-3.3-70b-instruct:free": 9, "meta/llama-3.3-70b-instruct": 9, "google/gemma-4-31b-it:free": 8, "google/gemma-4-31b-it": 8, "mistralai/mistral-large-3-675b-instruct-2512": 9, "deepseek-ai/deepseek-v4-flash": 8, "qwen/qwen3-next-80b-a3b-instruct:free": 8, "moonshotai/kimi-k2.6": 8, "z-ai/glm-5.2": 7, "bytedance/seed-oss-36b-instruct": 7 },
  data: { "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free": 9, "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning": 9, "nousresearch/hermes-3-llama-3.1-405b:free": 9, "deepseek-ai/deepseek-v4-pro": 9, "qwen/qwen3.5-397b-a17b": 9, "microsoft/phi-3.5-moe-instruct": 8, "mistralai/mixtral-8x22b-v0.1": 8, "databricks/dbrx-instruct": 8, "nvidia/llama-3.3-nemotron-super-49b-v1": 8, "nvidia/ising-calibration-1-35b-a3b": 7 },
  security: { "nousresearch/hermes-3-llama-3.1-405b:free": 10, "nvidia/llama-3.1-nemoguard-8b-content-safety": 10, "nvidia/llama-3.1-nemotron-safety-guard-8b-v3": 10, "nvidia/nemotron-3.5-content-safety:free": 9, "nvidia/nemotron-3.5-content-safety": 9, "meta/llama-guard-4-12b": 9, "nvidia/llama-3.1-nemoguard-8b-topic-control": 8, "deepseek-ai/deepseek-v4-pro": 8, "mistralai/mistral-large-3-675b-instruct-2512": 8, "nvidia/nemotron-4-340b-instruct": 8 },
  devops: { "ibm/granite-34b-code-instruct": 10, "ibm/granite-3.0-8b-instruct": 9, "qwen/qwen3-coder:free": 9, "mistralai/codestral-22b-instruct-v0.1": 9, "poolside/laguna-m.1:free": 9, "nvidia/llama-3.1-nemotron-70b-instruct": 8, "deepseek-ai/deepseek-v4-pro": 8, "meta/codellama-70b": 8 },
  aiml: { "nvidia/nemotron-3-ultra-550b-a55b": 10, "nvidia/llama-3.1-nemotron-ultra-253b-v1": 10, "nvidia/nemotron-4-340b-instruct": 9, "deepseek-ai/deepseek-v4-pro": 9, "nousresearch/hermes-3-llama-3.1-405b:free": 9, "qwen/qwen3.5-397b-a17b": 9, "mistralai/mistral-large-3-675b-instruct-2512": 8, "moonshotai/kimi-k2.6": 8, "nvidia/llama-3.3-nemotron-super-49b-v1": 8, "microsoft/phi-3.5-moe-instruct": 8 },
  design: { "google/gemma-4-31b-it:free": 9, "google/gemma-4-31b-it": 9, "google/gemma-4-26b-a4b-it:free": 8, "google/gemma-4-26b-a4b-it": 8, "cognitivecomputations/dolphin-mistral-24b-venice-edition:free": 8, "writer/palmyra-creative-122b": 8, "nvidia/nemotron-nano-12b-v2-vl:free": 7, "nvidia/nemotron-nano-12b-v2-vl": 7, "meta/llama-3.2-11b-vision-instruct": 7, "meta/llama-3.2-90b-vision-instruct": 8, "nvidia/llama-3.1-nemotron-nano-vl-8b-v1": 7 },
  planning: { "nvidia/nemotron-3-ultra-550b-a55b": 10, "nvidia/llama-3.1-nemotron-ultra-253b-v1": 10, "nvidia/nemotron-3-super-120b-a12b:free": 9, "nvidia/nemotron-3-super-120b-a12b": 9, "deepseek-ai/deepseek-v4-pro": 9, "qwen/qwen3.5-397b-a17b": 9, "moonshotai/kimi-k2.6": 9, "minimaxai/minimax-m3": 9, "nvidia/nemotron-4-340b-instruct": 9, "mistralai/mistral-large-3-675b-instruct-2512": 8 },
  testing: { "ibm/granite-34b-code-instruct": 9, "qwen/qwen3-coder:free": 9, "meta/codellama-70b": 8, "cohere/north-mini-code:free": 8, "deepseek-ai/deepseek-v4-pro": 8, "mistralai/codestral-22b-instruct-v0.1": 8, "nvidia/llama-3.1-nemotron-70b-instruct": 7, "poolside/laguna-m.1:free": 8, "bigcode/starcoder2-15b": 8 },
  business: { "writer/palmyra-fin-70b-32k": 10, "nvidia/llama-3.1-nemotron-ultra-253b-v1": 9, "nvidia/nemotron-3-ultra-550b-a55b": 9, "qwen/qwen3.5-397b-a17b": 8, "mistralai/mistral-large-3-675b-instruct-2512": 8, "deepseek-ai/deepseek-v4-pro": 8, "moonshotai/kimi-k2.6": 8, "meta/llama-3.3-70b-instruct": 7, "01-ai/yi-large": 7, "upstage/solar-10.7b-instruct": 7 },
  voice: { "writer/palmyra-creative-122b": 9, "cognitivecomputations/dolphin-mistral-24b-venice-edition:free": 8, "meta/llama-3.3-70b-instruct": 8, "mistralai/mistral-large-3-675b-instruct-2512": 8, "z-ai/glm-5.2": 7, "sarvamai/sarvam-m": 9, "google/gemma-4-31b-it": 7 },
  video: { "writer/palmyra-creative-122b": 9, "cognitivecomputations/dolphin-mistral-24b-venice-edition:free": 8, "meta/llama-4-maverick-17b-128e-instruct": 8, "nvidia/llama-3.2-nv-embedqa-1b-v1": 4, "moonshotai/kimi-k2.6": 8, "mistralai/mistral-large-3-675b-instruct-2512": 7, "deepseek-ai/deepseek-v4-flash": 7 },
};

export function getModelsForDomain(domain: string): string[] {
  const scores = DOMAIN_SCORES[domain] ?? {};
  const ranked: Array<{ id: string; score: number }> = [];
  for (const model of ALL_MODELS) {
    const domainScore = scores[model.id] ?? 0;
    if (domainScore === 0) continue;
    ranked.push({ id: model.id, score: domainScore });
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked.map((r) => r.id);
}

export function pickBestModel(domain: string): string | null {
  const candidates = getModelsForDomain(domain);
  for (const id of candidates) { if (isModelAvailable(id)) return id; }
  return candidates[0] ?? null;
}

export function getLeastLoadedModel(candidates: string[]): string {
  let best = candidates[0];
  let bestUtil = Infinity;
  for (const id of candidates) {
    const stats = getModelStats(id);
    if (!stats) continue;
    const util = stats.inflight + stats.queued;
    if (util < bestUtil) { bestUtil = util; best = id; }
  }
  return best ?? candidates[0];
}

export function getAvailableModelsForDomain(domain: string): UnifiedModel[] {
  const scores = DOMAIN_SCORES[domain] ?? {};
  const result: Array<UnifiedModel & { score: number }> = [];
  for (const model of ALL_MODELS) {
    const score = scores[model.id] ?? (model.domain === domain ? 5 : 0);
    if (score > 0) result.push({ ...model, score });
  }
  result.sort((a, b) => {
    const aAvail = isModelAvailable(a.id) ? 1 : 0;
    const bAvail = isModelAvailable(b.id) ? 1 : 0;
    if (aAvail !== bAvail) return bAvail - aAvail;
    return (b as any).score - (a as any).score;
  });
  return result;
}
