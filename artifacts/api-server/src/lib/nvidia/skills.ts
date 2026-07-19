import nvidia from "./client.js";
import { acquireModel, releaseModel } from "../os/index.js";

export const SKILL = {
  ULTRA_REASON: "nvidia/nemotron-3-ultra-550b-a55b",
  DEEP_REASON: "nvidia/llama-3.1-nemotron-ultra-253b-v1",
  FLAGSHIP: "nvidia/nemotron-4-340b-instruct",
  LONG_CONTEXT: "minimaxai/minimax-m3",
  LONG_CONTEXT_FAST: "minimaxai/minimax-m2.7",
  PRECISION_CODE: "ibm/granite-34b-code-instruct",
  FAST_CODE: "ibm/granite-8b-code-instruct",
  POLY_CODE: "bigcode/starcoder2-15b",
  MISTRAL_CODE: "mistralai/codestral-22b-instruct-v0.1",
  VISION_LARGE: "meta/llama-3.2-90b-vision-instruct",
  VISION_FAST: "meta/llama-3.2-11b-vision-instruct",
  VISION_NVIDIA: "nvidia/nemotron-nano-12b-v2-vl",
  SAFETY_CONTENT: "nvidia/llama-3.1-nemoguard-8b-content-safety",
  SAFETY_GUARD: "nvidia/llama-3.1-nemotron-safety-guard-8b-v3",
  TOPIC_GUARD: "nvidia/llama-3.1-nemoguard-8b-topic-control",
  LLAMA_GUARD: "meta/llama-guard-4-12b",
  FINANCIAL: "writer/palmyra-fin-70b-32k",
  MEDICAL: "writer/palmyra-med-70b-32k",
  CREATIVE: "writer/palmyra-creative-122b",
  QA_RAG: "nvidia/llama3-chatqa-1.5-70b",
  MATH: "nvidia/cosmos-reason2-8b",
  FAST_REASON: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
  DATA_CALIBRATE: "nvidia/ising-calibration-1-35b-a3b",
  MULTILINGUAL_ZH: "z-ai/glm-5.2",
  MULTILINGUAL_IN: "sarvamai/sarvam-m",
  MULTILINGUAL_SEA: "aisingapore/sea-lion-7b-instruct",
  FAST_NANO: "nvidia/llama-3.1-nemotron-nano-8b-v1",
  CLASSIFIER: "nvidia/nemotron-mini-4b-instruct",
  DEEP_RESEARCH: "abacusai/dracarys-llama-3.1-70b-instruct",
  HYBRID_LONG: "ai21labs/jamba-1.5-large-instruct",
  DEEPSEEK_PRO: "deepseek-ai/deepseek-v4-pro",
} as const;

export type SkillId = (typeof SKILL)[keyof typeof SKILL];

export interface SkillCallOptions { systemPrompt?: string; maxTokens?: number; temperature?: number; }

export async function callSkill(skillId: SkillId, userPrompt: string, options: SkillCallOptions = {}): Promise<string> {
  const { systemPrompt = "You are a specialized AI assistant. Respond precisely and helpfully.", maxTokens = 4096, temperature = 0.7 } = options;
  await acquireModel(skillId);
  try {
    const response = await nvidia!.chat.completions.create({ model: skillId, max_tokens: maxTokens, temperature, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }] });
    return response.choices[0]?.message?.content ?? "(no output)";
  } finally { releaseModel(skillId); }
}

export async function safetyCheck(content: string): Promise<{ safe: boolean; reason?: string }> {
  try {
    const result = await callSkill(SKILL.SAFETY_CONTENT, content, { systemPrompt: "You are a content safety classifier. Respond with SAFE or UNSAFE followed by a brief reason.", maxTokens: 128, temperature: 0 });
    const safe = result.toUpperCase().startsWith("SAFE");
    return { safe, reason: result };
  } catch { return { safe: true }; }
}

export async function decomposeTask(agentName: string, agentDomain: string, taskTitle: string, taskDescription: string): Promise<string> {
  return callSkill(SKILL.ULTRA_REASON, `Agent: ${agentName} (domain: ${agentDomain})\nTask: ${taskTitle}\nDescription: ${taskDescription}\n\nIn 2-3 concise sentences, what specific angle and approach should this agent take? Focus only on what this agent's expertise uniquely contributes.`, { systemPrompt: "You are a task decomposition engine. Output only the focused approach for this agent — no preamble, no headers.", maxTokens: 256, temperature: 0.3 });
}
