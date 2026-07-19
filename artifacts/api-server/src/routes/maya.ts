/**
 * Maya — AI Chat Interface Routes
 *
 * POST /api/maya/chat               — SSE streaming chat endpoint
 * GET  /api/maya/conversations      — list conversations
 * GET  /api/maya/conversations/:id/messages — get messages
 * DELETE /api/maya/conversations/:id — delete conversation
 */
import { Router } from "express";
import { db } from "@workspace/db";
import { mayaConversationsTable, mayaMessagesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import {
  streamMayaSynthesis,
  detectDomains,
  type AgentOutput,
} from "../lib/maya/synthesizer.js";
import { getAgentsForDomains } from "../lib/agents/registry.js";
import { buildAutonomyPlan, executeAutonomyPlan } from "../lib/agents/autonomy.js";
import { getModelById } from "../lib/models/registry.js";
import { acquireModel, releaseModel } from "../lib/os/rate-limiter.js";
import { pickBestModel } from "../lib/os/model-router.js";
import { openrouter } from "@workspace/integrations-openrouter-ai";
import nvidia from "../lib/nvidia/client.js";
import { getEnabledTools } from "../lib/tools/registry.js";

const router = Router();

// ── SSE helper ────────────────────────────────────────────────────────────────
function setupSSE(res: import("express").Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
}

function sendSSE(res: import("express").Response, data: unknown) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  if (typeof (res as any).flush === "function") (res as any).flush();
}

// ── POST /api/maya/chat ───────────────────────────────────────────────────────
router.post("/maya/chat", async (req, res) => {
  const { message, conversationId } = req.body as {
    message: string;
    conversationId?: string;
  };

  if (!message?.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  setupSSE(res);
  const start = Date.now();

  try {
    // Ensure conversation exists in DB
    const convId = conversationId ?? crypto.randomUUID();
    const title = message.slice(0, 60).trim();

    await db
      .insert(mayaConversationsTable)
      .values({ id: convId, title, taskType: "general" })
      .onConflictDoNothing();

    // Save user message
    await db.insert(mayaMessagesTable).values({
      id: crypto.randomUUID(),
      conversationId: convId,
      role: "user",
      content: message,
    });

    // Detect domains and pick agents
    const domains = detectDomains(message);
    const allAgents = getAgentsForDomains(domains);
    const agents = allAgents.slice(0, 60); // cap at 60 agents for chat

    const availableTools = getEnabledTools();
    const toolPrompt = availableTools.length
      ? `\n\nYou also have access to these tool capabilities when helpful: ${availableTools.map((tool) => `${tool.id} (${tool.kind})`).join(", ")}. Use them for repo inspection, file operations, and GitHub workflows when they add value.`
      : "";

    const autonomyPlan = await buildAutonomyPlan(message);
    const autonomySteps = await executeAutonomyPlan(autonomyPlan);
    const autonomyContext = autonomySteps.length
      ? `\n\nAutonomy context captured before reasoning: ${autonomySteps.map((step) => `${step.stepId}: ${step.result && typeof step.result === "object" && "ok" in step.result ? (step.result as { ok: boolean; error?: string }).ok ? "ok" : (step.result as { error?: string }).error ?? "failed" : String(step.result)}`).join(" | ")}`
      : "";

    sendSSE(res, {
      type: "start",
      message: `Deploying ${agents.length} agents across ${domains.length} domains`,
      domains,
      agentCount: agents.length,
      tools: availableTools,
      autonomyPlan,
      autonomyResults: autonomySteps,
    });

    // Run agents concurrently
    const agentOutputs: AgentOutput[] = [];

    await Promise.allSettled(
      agents.map(async (agent) => {
        const modelId =
          pickBestModel(agent.domain) ?? agent.preferredModel;
        const model = getModelById(modelId);
        const isNvidia = model?.provider === "nvidia";

        await acquireModel(modelId);
        const agentStart = Date.now();

        try {
          const client = isNvidia ? nvidia : openrouter;
          const response = await client!.chat.completions.create({
            model: modelId,
            max_tokens: 4096,
            messages: [
              { role: "system", content: agent.systemPrompt },
              {
                role: "user",
                content: `Task: ${message}\n\nProvide your specialized analysis and any code, algorithms, or concrete implementations relevant to your domain (${agent.domain}/${agent.subdomain}). Be thorough and complete.${toolPrompt}${autonomyContext}`,
              },
            ],
          });

          const output = response.choices[0]?.message?.content ?? "";
          const tokensUsed = response.usage?.total_tokens ?? 0;
          const durationMs = Date.now() - agentStart;

          agentOutputs.push({
            agentName: agent.name,
            domain: agent.domain,
            output,
            modelUsed: modelId,
            status: "success",
          });

          sendSSE(res, {
            type: "agent_complete",
            agentId: agent.id,
            agentName: agent.name,
            domain: agent.domain,
            subdomain: agent.subdomain,
            model: modelId,
            output: output.slice(0, 400),
            status: "success",
            tokensUsed,
            durationMs,
          });
        } catch (err) {
          agentOutputs.push({
            agentName: agent.name,
            domain: agent.domain,
            output: "",
            modelUsed: modelId,
            status: "failed",
          });

          sendSSE(res, {
            type: "agent_complete",
            agentId: agent.id,
            agentName: agent.name,
            domain: agent.domain,
            model: modelId,
            output: "",
            status: "failed",
            durationMs: Date.now() - agentStart,
          });
        } finally {
          releaseModel(modelId);
        }
      }),
    );

    sendSSE(res, {
      type: "synthesis_start",
      message: "Synthesizing swarm intelligence into Maya response...",
    });

    // Stream Maya's synthesized response
    let fullResponse = "";
    let artifacts: any[] = [];

    try {
      const result = await streamMayaSynthesis(
        message,
        agentOutputs,
        (chunk) => {
          fullResponse += chunk;
          sendSSE(res, { type: "synthesis_chunk", chunk });
        },
      );
      fullResponse = result.response;
      artifacts = result.artifacts;
    } catch (synthErr) {
      // Fallback: compile agent outputs directly
      const success = agentOutputs.filter((o) => o.status === "success");
      fullResponse = success
        .slice(0, 5)
        .map((o) => `## ${o.agentName}\n${o.output}`)
        .join("\n\n---\n\n");
      artifacts = [];
    }

    const durationMs = Date.now() - start;
    const modelsUsed = [
      ...new Set(agentOutputs.map((o) => o.modelUsed).filter(Boolean)),
    ];
    const domainsUsed = [...new Set(agentOutputs.map((o) => o.domain))];

    // Save Maya message
    await db.insert(mayaMessagesTable).values({
      id: crypto.randomUUID(),
      conversationId: convId,
      role: "maya",
      content: fullResponse,
      artifacts: artifacts as any,
      agentCount: agents.length,
      domainsUsed,
      durationMs,
      modelsUsed,
    });

    sendSSE(res, {
      type: "done",
      response: fullResponse,
      artifacts,
      agentCount: agents.length,
      domainsUsed,
      durationMs,
      modelsUsed,
      conversationId: convId,
    });

    res.end();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    sendSSE(res, { type: "error", message: msg });
    res.end();
  }
});

// ── GET /api/maya/conversations ───────────────────────────────────────────────
router.get("/maya/conversations", async (_req, res) => {
  try {
    const convs = await db
      .select()
      .from(mayaConversationsTable)
      .orderBy(desc(mayaConversationsTable.createdAt))
      .limit(50);
    res.json(convs);
  } catch (err) {
    res.status(500).json({ error: "Failed to list conversations" });
  }
});

// ── GET /api/maya/conversations/:id/messages ──────────────────────────────────
router.get("/maya/conversations/:id/messages", async (req, res) => {
  try {
    const messages = await db
      .select()
      .from(mayaMessagesTable)
      .where(eq(mayaMessagesTable.conversationId, req.params.id))
      .orderBy(mayaMessagesTable.createdAt);
    res.json(
      messages.map((m) => ({
        ...m,
        timestamp: m.createdAt,
      })),
    );
  } catch (err) {
    res.status(500).json({ error: "Failed to get messages" });
  }
});

// ── DELETE /api/maya/conversations/:id ────────────────────────────────────────
router.delete("/maya/conversations/:id", async (req, res) => {
  try {
    await db
      .delete(mayaConversationsTable)
      .where(eq(mayaConversationsTable.id, req.params.id));
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Failed to delete conversation" });
  }
});

export default router;
