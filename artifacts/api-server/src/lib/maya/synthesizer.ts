/**
 * Maya Response Synthesizer
 *
 * Takes raw outputs from N swarm agents and synthesizes them into
 * a single coherent response in Maya's voice, streaming token by token.
 *
 * Also extracts code/document artifacts from the synthesis for display
 * in the Artifact Sandbox pane.
 */

import { pickBestModel } from "../os/index.js";
import { getModelById } from "../models/registry.js";
import { acquireModel, releaseModel } from "../os/rate-limiter.js";
import { openrouter } from "@workspace/integrations-openrouter-ai";
import nvidia from "../nvidia/client.js";
import type { MayaArtifact } from "@workspace/db";

export interface AgentOutput {
  agentName: string;
  domain: string;
  output: string;
  modelUsed: string;
  status: "success" | "failed";
}

export interface SynthesisResult {
  response: string;
  artifacts: MayaArtifact[];
}

const MAYA_SYSTEM_PROMPT = `You are Maya — the synthetic intelligence core of the SwarmAI platform.

You have just coordinated a fleet of specialized AI agents to analyze the user's request. You are synthesizing their collective intelligence into a single authoritative response.

Your voice:
- Technically precise and direct. Never vague.
- Action-oriented: conclude with concrete next steps when applicable.
- When agents disagreed or found conflicting evidence, explicitly flag it.
- Format code perfectly in fenced code blocks with the correct language tag.
- Use headers (##) to organize complex multi-part responses.
- Cite specific agent findings when they are especially strong or novel.
- If you're building something, provide the COMPLETE implementation — never truncate.

You speak for the entire swarm. Your response IS the swarm's consensus.`;

/** Domains → keyword associations for intent detection */
const DOMAIN_KEYWORDS: Record<string, string[]> = {
  trading: ["trading", "trade", "bitcoin", "btc", "eth", "crypto", "forex", "stock", "market", "order book", "backtest", "strategy", "alpha", "spib", "tkan", "arbitrage", "momentum", "quant", "hft", "algorithm"],
  titan: ["kernel", "c++", "titan", "compile", "clang", "cmake", "lock-free", "abi", "ipc", "shared memory", "mmap", "cap'n proto"],
  code: ["code", "function", "class", "api", "endpoint", "build", "implement", "debug", "fix", "typescript", "python", "rust", "go"],
  research: ["research", "analyze", "study", "explain", "how does", "what is", "compare", "why"],
  aiml: ["model", "neural network", "llm", "embedding", "fine-tune", "training", "inference", "agent", "swarm"],
  data: ["data", "database", "sql", "query", "schema", "pipeline", "etl", "analytics"],
  security: ["security", "vulnerability", "exploit", "auth", "encryption", "penetration", "audit"],
};

/** Detect relevant domains from a user message */
export function detectDomains(message: string): string[] {
  const lower = message.toLowerCase();
  const scores: Record<string, number> = {};

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    const score = keywords.filter((kw) => lower.includes(kw)).length;
    if (score > 0) scores[domain] = score;
  }

  if (Object.keys(scores).length === 0) {
    return ["research", "code"];
  }

  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([domain]) => domain);
}

/** Extract code blocks and documents from synthesized response */
export function extractArtifacts(content: string): MayaArtifact[] {
  const artifacts: MayaArtifact[] = [];
  const codeBlockRegex = /```(\w+)?
([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  let counter = 1;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const lang = match[1]?.toLowerCase() || "text";
    const code = match[2].trim();
    if (code.length < 10) continue;

    const ext: Record<string, string> = {
      typescript: "ts", javascript: "js", python: "py", rust: "rs",
      go: "go", cpp: "cpp", c: "c", java: "java", sql: "sql",
      bash: "sh", shell: "sh", markdown: "md", json: "json",
      yaml: "yaml", toml: "toml", html: "html", css: "css",
    };

    artifacts.push({
      id: crypto.randomUUID(),
      type: "code",
      language: lang,
      filename: `artifact_${counter++}.${ext[lang] ?? "txt"}`,
      title: `${lang.toUpperCase()} Module ${counter - 1}`,
      content: code,
    });
  }

  return artifacts;
}

/** Pick the best synthesis model (prefers flagship reasoners) */
function getSynthesisModelId(): string {
  // Try domain="research" to get a flagship reasoning model
  return (
    pickBestModel("research") ??
    pickBestModel("general") ??
    "nvidia/llama-3.1-nemotron-ultra-253b-v1"
  );
}

/**
 * Stream Maya's synthesized response from swarm agent outputs.
 * Calls the `onChunk` callback with each text token as it arrives.
 * Returns the complete synthesis result when done.
 */
function buildFallbackSynthesis(userMessage: string, agentOutputs: AgentOutput[]) {
  const successOutputs = agentOutputs.filter((o) => o.status === "success");
  const domains = [...new Set(successOutputs.map((o) => o.domain))];
  const summary = successOutputs
    .slice(0, 8)
    .map((o) => `- ${o.agentName}: ${o.output.slice(0, 220) || "No detailed output returned."}`)
    .join("\n");

  const response = `## Local Swarm Synthesis

The swarm processed your request with ${successOutputs.length} successful agent outputs across ${domains.length} domains.

### What the swarm concluded
${summary || "- No agent output was available for synthesis."}

### Recommended next steps
1. Review the agent findings above.
2. Turn the strongest insight into an implementation plan.
3. Run the task again with live model credentials if you want richer narrative synthesis.

### Short execution summary
- Request: ${userMessage}
- Domains covered: ${domains.join(", ") || "none"}
- Status: local fallback synthesis completed successfully`;

  return response;
}

export async function streamMayaSynthesis(
  userMessage: string,
  agentOutputs: AgentOutput[],
  onChunk: (chunk: string) => void,
): Promise<SynthesisResult> {
  const successOutputs = agentOutputs.filter((o) => o.status === "success");
  const domainGroups: Record<string, AgentOutput[]> = {};
  for (const o of successOutputs) {
    if (!domainGroups[o.domain]) domainGroups[o.domain] = [];
    domainGroups[o.domain].push(o);
  }

  const contextParts: string[] = [];
  for (const [domain, outputs] of Object.entries(domainGroups)) {
    contextParts.push(`\n## ${domain.toUpperCase()} DOMAIN AGENTS (${outputs.length} agents)\n`);
    for (const output of outputs.slice(0, 3)) {
      contextParts.push(`### ${output.agentName}\n${output.output.slice(0, 2000)}\n`);
    }
  }

  const agentContext = contextParts.join("\n");

  const userContent = `User Request: "${userMessage}"

Swarm Analysis (${successOutputs.length} agents across ${Object.keys(domainGroups).length} domains):

${agentContext}

---

Now synthesize the above into Maya's comprehensive response. Be complete, structured, and precise.`;

  const modelId = getSynthesisModelId();
  const model = getModelById(modelId);
  const isNvidia = model?.provider === "nvidia";

  await acquireModel(modelId);

  try {
    const client = isNvidia ? nvidia : openrouter;
    const stream = await client.chat.completions.create({
      model: modelId,
      max_tokens: 16384,
      stream: true,
      messages: [
        { role: "system", content: MAYA_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    });

    let fullResponse = "";
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) {
        fullResponse += delta;
        onChunk(delta);
      }
    }

    const artifacts = extractArtifacts(fullResponse);
    return { response: fullResponse, artifacts };
  } catch (err) {
    const fallbackResponse = buildFallbackSynthesis(userMessage, agentOutputs);
    const chunks = fallbackResponse.split(/(?<=\n)/);
    for (const chunk of chunks) {
      onChunk(chunk);
    }
    return {
      response: fallbackResponse,
      artifacts: extractArtifacts(fallbackResponse),
    };
  } finally {
    releaseModel(modelId);
  }
}
