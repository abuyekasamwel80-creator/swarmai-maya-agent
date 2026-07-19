/**
 * NVIDIA Skills — Capability-to-Model Mapping
 *
 * Maps specific AI capabilities to the best NVIDIA NIM model for that job.
 * These are NVIDIA-exclusive models that don't exist on OpenRouter's free tier:
 * vision, safety guards, financial/medical domain models, 1M-context, etc.
 *
 * Usage:
 *   import { callSkill, SKILL } from "../nvidia/skills.js";
 *   const plan = await callSkill(SKILL.ULTRA_REASON, "Decompose this architecture...");
 *   const safe = await callSkill(SKILL.SAFETY_CHECK, userInput);
 */

import nvidia from "./client.js";
import { acquireModel, releaseModel } from "../os/index.js";

// ── Skill IDs ─────────────────────────────────────────────────────────────────
export const SKILL = {
  /** Nemotron Ultra 550B — deepest planning, architecture, complex multi-step reasoning */
  ULTRA_REASON: "nvidia/nemotron-3-ultra-550b-a55b",

  /** Nemotron Ultra 253B — strong reasoning, fast than 550B */
  DEEP_REASON: "nvidia/llama-3.1-nemotron-ultra-253b-v1",

  /** Nemotron 4 340B — flagship code + reasoning */
  FLAGSHIP: "nvidia/nemotron-4-340b-instruct",

  /** MiniMax M3 — 1,000,000 token context window. Use for massive documents */
  LONG_CONTEXT: "minimaxai/minimax-m3",

  /** MiniMax M2.7 — 1M context, lighter than M3 */
  LONG_CONTEXT_FAST: "minimaxai/minimax-m2.7",

  /** Granite 34B Code — enterprise code generation, review, IaC */
  PRECISION_CODE: "ibm/granite-34b-code-instruct",

  /** Granite 8B Code — fast code completion and snippets */
  FAST_CODE: "ibm/granite-8b-code-instruct",

  /** StarCoder2 15B — 600+ programming languages */
  POLY_CODE: "bigcode/starcoder2-15b",

  /** Codestral 22B — Mistral's dedicated code model */
  MISTRAL_CODE: "mistralai/codestral-22b-instruct-v0.1",

  /** Llama 3.2 90B Vision — best multimodal. Use for image analysis, UI screenshots */
  VISION_LARGE: "meta/llama-3.2-90b-vision-instruct",

  /** Llama 3.2 11B Vision — fast vision tasks */
  VISION_FAST: "meta/llama-3.2-11b-vision-instruct",

  /** Nemotron Nano 12B VL — NVIDIA vision-language, fast */
  VISION_NVIDIA: "nvidia/nemotron-nano-12b-v2-vl",

  /** NeMoGuard Content Safety — filters harmful content, NSFW, violence */
  SAFETY_CONTENT: "nvidia/llama-3.1-nemoguard-8b-content-safety",

  /** NeMoGuard Safety v3 — NVIDIA's latest safety classifier */
  SAFETY_GUARD: "nvidia/llama-3.1-nemotron-safety-guard-8b-v3",

  /** NeMoGuard Topic Control — restricts off-topic / out-of-scope responses */
  TOPIC_GUARD: "nvidia/llama-3.1-nemoguard-8b-topic-control",

  /** Llama Guard 4 12B — Meta's production safety model */
  LLAMA_GUARD: "meta/llama-guard-4-12b",

  /** Palmyra Finance 70B — financial analysis, earnings reports, market research */
  FINANCIAL: "writer/palmyra-fin-70b-32k",

  /** Palmyra Medical 70B — clinical notes, medical research, drug analysis */
  MEDICAL: "writer/palmyra-med-70b-32k",

  /** Palmyra Creative 122B — long-form writing, storytelling, scripts, voice */
  CREATIVE: "writer/palmyra-creative-122b",

  /** ChatQA 70B — optimized for Q&A and RAG retrieval tasks */
  QA_RAG: "nvidia/llama3-chatqa-1.5-70b",

  /** Cosmos Reason2 8B — structured mathematical / scientific reasoning */
  MATH: "nvidia/cosmos-reason2-8b",

  /** Nemotron Nano 30B Omni Reasoning — fast reasoning with 256K context */
  FAST_REASON: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",

  /** Ising Calibration 35B — NVIDIA data analysis and calibration */
  DATA_CALIBRATE: "nvidia/ising-calibration-1-35b-a3b",

  /** GLM 5.2 — multilingual (Chinese, English, and more) */
  MULTILINGUAL_ZH: "z-ai/glm-5.2",

  /** Sarvam M — Indian languages (Hindi, Tamil, Telugu, etc.) */
  MULTILINGUAL_IN: "sarvamai/sarvam-m",

  /** SEA-LION 7B — Southeast Asian languages */
  MULTILINGUAL_SEA: "aisingapore/sea-lion-7b-instruct",

  /** Nemotron Nano 8B — fastest NVIDIA model, 60 RPM, simple tasks */
  FAST_NANO: "nvidia/llama-3.1-nemotron-nano-8b-v1",

  /** Nemotron Mini 4B — lightest model for classification, routing */
  CLASSIFIER: "nvidia/nemotron-mini-4b-instruct",

  /** Dracarys 70B — deep research synthesis */
  DEEP_RESEARCH: "abacusai/dracarys-llama-3.1-70b-instruct",

  /** Jamba 1.5 Large — SSM+Transformer hybrid, 256K context, fast */
  HYBRID_LONG: "ai21labs/jamba-1.5-large-instruct",

  /** DeepSeek V4 Pro — world-class code + reasoning, 685B */
  DEEPSEEK_PRO: "deepseek-ai/deepseek-v4-pro",
} as const;

export type SkillId = (typeof SKILL)[keyof typeof SKILL];

export interface SkillCallOptions {
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Call a specific NVIDIA skill (model) with a prompt.
 * Handles rate-limiting via the Agent OS token bucket.
 */
export async function callSkill(
  skillId: SkillId,
  userPrompt: string,
  options: SkillCallOptions = {},
): Promise<string> {
  const {
    systemPrompt = "You are a specialized AI assistant. Respond precisely and helpfully.",
    maxTokens = 4096,
    temperature = 0.7,
  } = options;

  await acquireModel(skillId);
  try {
    const response = await nvidia.chat.completions.create({
      model: skillId,
      max_tokens: maxTokens,
      temperature,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    return response.choices[0]?.message?.content ?? "(no output)";
  } finally {
    releaseModel(skillId);
  }
}

/**
 * Safety check — returns true if content is safe, false if flagged.
 * Uses NeMoGuard Content Safety (purpose-built classifier).
 */
export async function safetyCheck(content: string): Promise<{
  safe: boolean;
  reason?: string;
}> {
  try {
    const result = await callSkill(
      SKILL.SAFETY_CONTENT,
      content,
      {
        systemPrompt:
          "You are a content safety classifier. Respond with SAFE or UNSAFE followed by a brief reason.",
        maxTokens: 128,
        temperature: 0,
      },
    );
    const safe = result.toUpperCase().startsWith("SAFE");
    return { safe, reason: result };
  } catch {
    return { safe: true }; // fail open — don't block on classifier error
  }
}

/**
 * Quick task decomposition using Nemotron Ultra 550B.
 * Returns 2-4 bullet points on how to approach the task.
 */
export async function decomposeTask(
  agentName: string,
  agentDomain: string,
  taskTitle: string,
  taskDescription: string,
): Promise<string> {
  return callSkill(
    SKILL.ULTRA_REASON,
    `Agent: ${agentName} (domain: ${agentDomain})
Task: ${taskTitle}
Description: ${taskDescription}

In 2-3 concise sentences, what specific angle and approach should this agent take? Focus only on what this agent's expertise uniquely contributes.`,
    {
      systemPrompt:
        "You are a task decomposition engine. Output only the focused approach for this agent — no preamble, no headers.",
      maxTokens: 256,
      temperature: 0.3,
    },
  );
}

/**
 * Skill capability metadata — used by UI and routing to explain what each skill does.
 */
export const SKILL_METADATA: Record<SkillId, { name: string; category: string; description: string; contextK: number }> = {
  [SKILL.ULTRA_REASON]:     { name: "Nemotron Ultra 550B",       category: "Reasoning",   description: "Deepest planning & multi-step reasoning",        contextK: 1000 },
  [SKILL.DEEP_REASON]:      { name: "Nemotron Ultra 253B",       category: "Reasoning",   description: "Strong reasoning, faster than 550B",             contextK: 128  },
  [SKILL.FLAGSHIP]:         { name: "Nemotron 4 340B",           category: "General",     description: "Flagship code + reasoning",                      contextK: 4    },
  [SKILL.LONG_CONTEXT]:     { name: "MiniMax M3",                category: "Long Context","description": "1M token context for massive documents",       contextK: 1000 },
  [SKILL.LONG_CONTEXT_FAST]:{ name: "MiniMax M2.7",             category: "Long Context","description": "1M context, lighter than M3",                  contextK: 1000 },
  [SKILL.PRECISION_CODE]:   { name: "Granite 34B Code",          category: "Code",        description: "Enterprise code generation & review",            contextK: 8    },
  [SKILL.FAST_CODE]:        { name: "Granite 8B Code",           category: "Code",        description: "Fast code completion and snippets",              contextK: 4    },
  [SKILL.POLY_CODE]:        { name: "StarCoder2 15B",            category: "Code",        description: "600+ programming languages",                     contextK: 16   },
  [SKILL.MISTRAL_CODE]:     { name: "Codestral 22B",             category: "Code",        description: "Mistral's dedicated code model",                 contextK: 32   },
  [SKILL.VISION_LARGE]:     { name: "Llama 3.2 90B Vision",      category: "Vision",      description: "Best multimodal — UI screenshots, diagrams",     contextK: 128  },
  [SKILL.VISION_FAST]:      { name: "Llama 3.2 11B Vision",      category: "Vision",      description: "Fast vision tasks",                              contextK: 128  },
  [SKILL.VISION_NVIDIA]:    { name: "Nemotron 12B VL",           category: "Vision",      description: "NVIDIA vision-language model",                   contextK: 128  },
  [SKILL.SAFETY_CONTENT]:   { name: "NeMoGuard Content Safety",  category: "Safety",      description: "Filters harmful content & NSFW",                 contextK: 32   },
  [SKILL.SAFETY_GUARD]:     { name: "Nemotron Safety v3",        category: "Safety",      description: "NVIDIA's latest safety classifier",              contextK: 32   },
  [SKILL.TOPIC_GUARD]:      { name: "NeMoGuard Topic Control",   category: "Safety",      description: "Restricts off-topic responses",                  contextK: 32   },
  [SKILL.LLAMA_GUARD]:      { name: "Llama Guard 4 12B",         category: "Safety",      description: "Meta's production safety model",                 contextK: 128  },
  [SKILL.FINANCIAL]:        { name: "Palmyra Finance 70B",       category: "Domain",      description: "Financial analysis, earnings, markets",          contextK: 32   },
  [SKILL.MEDICAL]:          { name: "Palmyra Medical 70B",       category: "Domain",      description: "Clinical notes, drug analysis, medical research", contextK: 32  },
  [SKILL.CREATIVE]:         { name: "Palmyra Creative 122B",     category: "Domain",      description: "Long-form writing, storytelling, voice",         contextK: 32   },
  [SKILL.QA_RAG]:           { name: "ChatQA 70B",               category: "Retrieval",   description: "Optimized for Q&A and RAG",                      contextK: 32   },
  [SKILL.MATH]:             { name: "Cosmos Reason2 8B",         category: "Reasoning",   description: "Mathematical & scientific structured reasoning",  contextK: 32   },
  [SKILL.FAST_REASON]:      { name: "Nemotron Nano Omni 30B",    category: "Reasoning",   description: "Fast reasoning with 256K context",               contextK: 256  },
  [SKILL.DATA_CALIBRATE]:   { name: "Ising Calibration 35B",     category: "Data",        description: "NVIDIA data analysis and calibration",           contextK: 128  },
  [SKILL.MULTILINGUAL_ZH]:  { name: "GLM 5.2",                   category: "Multilingual","description": "Chinese/English multilingual",                 contextK: 128  },
  [SKILL.MULTILINGUAL_IN]:  { name: "Sarvam M",                  category: "Multilingual","description": "Indian languages (Hindi, Tamil, Telugu)",      contextK: 32   },
  [SKILL.MULTILINGUAL_SEA]: { name: "SEA-LION 7B",               category: "Multilingual","description": "Southeast Asian languages",                    contextK: 4    },
  [SKILL.FAST_NANO]:        { name: "Nemotron Nano 8B",          category: "Fast",        description: "Fastest NVIDIA model, 60 RPM",                   contextK: 128  },
  [SKILL.CLASSIFIER]:       { name: "Nemotron Mini 4B",          category: "Fast",        description: "Classification and routing tasks",               contextK: 4    },
  [SKILL.DEEP_RESEARCH]:    { name: "Dracarys 70B",              category: "Research",    description: "Deep research synthesis",                        contextK: 128  },
  [SKILL.HYBRID_LONG]:      { name: "Jamba 1.5 Large",          category: "Long Context","description": "SSM+Transformer hybrid, 256K context",         contextK: 256  },
  [SKILL.DEEPSEEK_PRO]:     { name: "DeepSeek V4 Pro",           category: "Code",        description: "World-class code + reasoning, 685B",             contextK: 128  },
};
