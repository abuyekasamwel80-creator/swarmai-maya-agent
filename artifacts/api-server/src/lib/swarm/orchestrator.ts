/**
 * SwarmAI Swarm Orchestrator — Polymorphic Multi-Model Agent Engine
 *
 * Every agent is polymorphic: it does not lock to one model.
 * Instead each execution runs a TWO-PHASE pipeline:
 *
 *   Phase 1 — PLAN  (Nemotron Ultra 550B / best reasoning model)
 *     The planner reads the task and tells the agent exactly what angle
 *     to focus on — 2-3 concise sentences, 256 tokens, near-instant.
 *
 *   Phase 2 — EXECUTE  (best available model for agent's domain)
 *     The executor performs the full analysis using the plan as context.
 *     This model comes from the full 112-model fleet (NVIDIA + OpenRouter),
 *     selected live by the OS based on availability and capability score.
 *
 * This means a single "code-rust-systems" agent might plan with Nemotron 550B
 * and execute with Poolside Laguna — two completely different LLMs per run,
 * dynamically chosen from the entire fleet.
 *
 * For Maya chat (maxAgents <= 60) both phases run. For large swarms
 * (maxAgents > 60) Phase 1 is skipped to preserve RPM capacity.
 */

import { EventEmitter } from "events";
import { db } from "@workspace/db";
import {
  swarmTasksTable,
  taskRunsTable,
  agentResultsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { openrouter } from "@workspace/integrations-openrouter-ai";
import nvidia from "../nvidia/client.js";
import {
  acquireModel,
  releaseModel,
  pickBestModel,
  getAvailableModelsForDomain,
} from "../os/index.js";
import { getModelById } from "../models/registry.js";
import { SKILL, callSkill } from "../nvidia/skills.js";
import {
  getAgentsForDomains,
  getAgentById,
  type AgentDefinition,
} from "../agents/registry.js";
import { extractAndSaveMemoryNodes } from "../memory/graph.js";

// ── In-memory SSE event bus ───────────────────────────────────────────────────
export const runEmitters = new Map<string, EventEmitter>();

// ── Phase 1: Planning ─────────────────────────────────────────────────────────
async function planAgentApproach(
  agent: AgentDefinition,
  task: { title: string; description: string },
): Promise<string> {
  try {
    return await callSkill(
      SKILL.ULTRA_REASON,
      `Agent: ${agent.name} (domain: ${agent.domain}/${agent.subdomain})
Capabilities: ${agent.capabilities.join(", ")}
Task title: ${task.title}
Task: ${task.description.slice(0, 800)}

In 2-3 concise sentences: what specific angle should this agent focus on? What unique contribution does their expertise make here?`,
      {
        systemPrompt:
          "You are a task decomposition engine for a multi-agent AI system. Output only the focused approach for this specific agent — no preamble, no headers, no bullet points. Plain sentences only.",
        maxTokens: 200,
        temperature: 0.25,
      },
    );
  } catch {
    // If planning model is at capacity, skip and use empty context
    return "";
  }
}

// ── Phase 2: Execution ────────────────────────────────────────────────────────
function buildExecutionPrompt(
  task: { title: string; description: string },
  agent: AgentDefinition,
  plan: string,
  memoryContext: string,
): string {
  return [
    `## Task: ${task.title}`,
    "",
    task.description,
    "",
    plan
      ? `## Your Focus for This Task\n${plan}\n`
      : "",
    memoryContext
      ? `## Relevant Prior Context\n${memoryContext}\n`
      : "",
    `## Your Assignment`,
    `As ${agent.name} (${agent.domain}/${agent.subdomain}), provide your specialized analysis and output.`,
    `Your capabilities: ${agent.capabilities.join(", ")}`,
    `Be thorough, specific, and actionable. Structure your response clearly.`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ── Execute one polymorphic agent ─────────────────────────────────────────────
async function executePolymorphicAgent(
  agent: AgentDefinition,
  task: { title: string; description: string },
  memoryContext: string,
  usePlanning: boolean,
): Promise<{
  output: string;
  tokensUsed: number;
  durationMs: number;
  modelUsed: string;
  plannerModel: string | null;
}> {
  const start = Date.now();

  // Phase 1: Plan (only for smaller swarms to preserve RPM for large runs)
  const plan = usePlanning ? await planAgentApproach(agent, task) : "";
  const plannerModel = usePlanning ? SKILL.ULTRA_REASON : null;

  // Phase 2: Execute — OS picks best available model for this domain from all 112
  const modelId =
    pickBestModel(agent.domain) ??
    getAvailableModelsForDomain(agent.domain)[0]?.id ??
    agent.preferredModel;

  const model = getModelById(modelId);
  const isNvidia = model?.provider === "nvidia";

  await acquireModel(modelId);
  try {
    const client = isNvidia ? nvidia : openrouter;
    const response = await client.chat.completions.create({
      model: modelId,
      max_tokens: 8192,
      messages: [
        { role: "system", content: agent.systemPrompt },
        {
          role: "user",
          content: buildExecutionPrompt(task, agent, plan, memoryContext),
        },
      ],
    });

    const output =
      response.choices[0]?.message?.content ?? "(no output produced)";
    const tokensUsed = response.usage?.total_tokens ?? 0;

    return {
      output,
      tokensUsed,
      durationMs: Date.now() - start,
      modelUsed: modelId,
      plannerModel,
    };
  } finally {
    releaseModel(modelId);
  }
}

// ── Main swarm runner ─────────────────────────────────────────────────────────
export async function runSwarmTask(
  taskId: string,
  runId: string,
  maxAgents: number,
  selectedAgentIds?: string[],
): Promise<void> {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(200);
  runEmitters.set(runId, emitter);

  // Use planning phase for smaller focused swarms (Maya chat, targeted tasks)
  // Skip for large carpet-bombing swarms to preserve RPM headroom
  const usePlanning = maxAgents <= 60;

  try {
    const [task] = await db
      .select()
      .from(swarmTasksTable)
      .where(eq(swarmTasksTable.id, taskId));
    if (!task) throw new Error(`Task ${taskId} not found`);

    // Select agents
    let agents: AgentDefinition[];
    if (selectedAgentIds?.length) {
      agents = selectedAgentIds
        .map((id) => getAgentById(id))
        .filter((a): a is AgentDefinition => !!a);
    } else {
      agents = getAgentsForDomains(task.domains as string[]);
    }
    agents = agents.slice(0, maxAgents);

    await db
      .update(taskRunsTable)
      .set({ agentsSpawned: agents.length })
      .where(eq(taskRunsTable.id, runId));

    await db
      .update(swarmTasksTable)
      .set({
        status: "running",
        agentCount: agents.length,
        updatedAt: new Date(),
      })
      .where(eq(swarmTasksTable.id, taskId));

    const domainSet = new Set(agents.map((a) => a.domain));
    emitter.emit("event", {
      type: "start",
      message: `Deploying ${agents.length} polymorphic agents across ${domainSet.size} domains — 112-model fleet`,
      totalAgents: agents.length,
      domains: [...domainSet],
      polymorphic: usePlanning,
      plannerModel: usePlanning ? "nvidia/nemotron-3-ultra-550b-a55b" : null,
    });

    let completed = 0;

    await Promise.allSettled(
      agents.map(async (agent) => {
        const resultId = crypto.randomUUID();
        try {
          const { output, tokensUsed, durationMs, modelUsed, plannerModel } =
            await executePolymorphicAgent(agent, task, "", usePlanning);

          await db.insert(agentResultsTable).values({
            id: resultId,
            taskId,
            runId,
            agentId: agent.id,
            agentName: agent.name,
            domain: agent.domain,
            model: modelUsed,
            output,
            status: "success",
            tokensUsed,
            durationMs,
          });

          completed++;
          emitter.emit("event", {
            type: "agent_complete",
            agentId: agent.id,
            agentName: agent.name,
            domain: agent.domain,
            subdomain: agent.subdomain,
            model: modelUsed,
            plannerModel,
            output: output.slice(0, 500),
            status: "success",
            tokensUsed,
            durationMs,
            completedCount: completed,
            totalAgents: agents.length,
          });

          extractAndSaveMemoryNodes(taskId, agent, output).catch(() => {});
        } catch (err) {
          const errorMsg =
            err instanceof Error ? err.message : "Unknown error";

          await db.insert(agentResultsTable).values({
            id: resultId,
            taskId,
            runId,
            agentId: agent.id,
            agentName: agent.name,
            domain: agent.domain,
            model: agent.preferredModel,
            output: `Error: ${errorMsg}`,
            status: "failed",
          });

          completed++;
          emitter.emit("event", {
            type: "agent_complete",
            agentId: agent.id,
            agentName: agent.name,
            domain: agent.domain,
            model: agent.preferredModel,
            output: `Error: ${errorMsg}`,
            status: "failed",
            completedCount: completed,
            totalAgents: agents.length,
          });
        }
      }),
    );

    await db
      .update(taskRunsTable)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(taskRunsTable.id, runId));

    await db
      .update(swarmTasksTable)
      .set({ status: "completed", updatedAt: new Date() })
      .where(eq(swarmTasksTable.id, taskId));

    emitter.emit("event", {
      type: "done",
      message: `Swarm complete: ${completed}/${agents.length} agents finished`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    await db
      .update(swarmTasksTable)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(swarmTasksTable.id, taskId));
    await db
      .update(taskRunsTable)
      .set({ status: "failed", completedAt: new Date() })
      .where(eq(taskRunsTable.id, runId));

    emitter.emit("event", { type: "error", message: msg });
  } finally {
    setTimeout(() => runEmitters.delete(runId), 60_000);
  }
}
