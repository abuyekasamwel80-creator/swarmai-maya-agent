import { db } from "@workspace/db";
import { memoryNodesTable } from "@workspace/db";
import { eq, like, or, and, desc } from "drizzle-orm";
import type { AgentDefinition } from "../agents/registry.js";

export async function extractAndSaveMemoryNodes(
  taskId: string,
  agent: AgentDefinition,
  output: string,
): Promise<void> {
  if (!output || output.length < 50) return;

  const summary = output.slice(0, 300).replace(/\n+/g, " ").trim();

  const typeMap: Record<string, string> = {
    code: "code",
    research: "fact",
    writing: "result",
    data: "fact",
    security: "decision",
    devops: "context",
    aiml: "result",
    design: "context",
    planning: "decision",
    testing: "result",
    business: "decision",
    voice: "result",
    video: "result",
  };

  await db.insert(memoryNodesTable).values({
    id: crypto.randomUUID(),
    taskId,
    type: typeMap[agent.domain] ?? "result",
    content: output.slice(0, 8000),
    summary,
    tags: [agent.domain, agent.subdomain, ...agent.capabilities.slice(0, 3)],
    importance: agent.priority / 10,
  });
}

export async function searchMemoryNodes(
  query: string,
  taskId?: string | null,
  limit = 20,
) {
  const q = `%${query}%`;
  const textCondition = or(
    like(memoryNodesTable.content, q),
    like(memoryNodesTable.summary, q),
  );

  const rows = taskId
    ? await db
        .select()
        .from(memoryNodesTable)
        .where(and(textCondition, eq(memoryNodesTable.taskId, taskId)))
        .orderBy(desc(memoryNodesTable.importance))
        .limit(limit)
    : await db
        .select()
        .from(memoryNodesTable)
        .where(textCondition)
        .orderBy(desc(memoryNodesTable.importance))
        .limit(limit);

  return rows;
}

export async function getMemoryContext(taskId: string): Promise<string> {
  const nodes = await db
    .select()
    .from(memoryNodesTable)
    .where(eq(memoryNodesTable.taskId, taskId))
    .orderBy(desc(memoryNodesTable.importance))
    .limit(10);

  if (!nodes.length) return "";
  return nodes.map((n) => `[${n.type.toUpperCase()}] ${n.summary}`).join("\n");
}
