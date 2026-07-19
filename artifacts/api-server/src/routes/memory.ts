import { Router } from "express";
import { db } from "@workspace/db";
import { memoryNodesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { searchMemoryNodes } from "../lib/memory/graph.js";

const router = Router();

router.get("/memory/nodes", async (req, res) => {
  try {
    const { taskId, type } = req.query as {
      taskId?: string;
      type?: string;
    };

    let query = db
      .select()
      .from(memoryNodesTable)
      .orderBy(desc(memoryNodesTable.importance))
      .limit(100);

    const nodes = await query;

    const filtered = nodes.filter((n) => {
      if (taskId && n.taskId !== taskId) return false;
      if (type && n.type !== type) return false;
      return true;
    });

    res.json(filtered);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch memory nodes" });
  }
});

router.post("/memory/nodes", async (req, res) => {
  try {
    const { taskId, type, content, summary, tags, importance } = req.body;

    const node = {
      id: crypto.randomUUID(),
      taskId: taskId ?? null,
      type: type ?? "fact",
      content,
      summary,
      tags: tags ?? [],
      importance: importance ?? 0.5,
    };

    await db.insert(memoryNodesTable).values(node);
    const created = await db
      .select()
      .from(memoryNodesTable)
      .where(eq(memoryNodesTable.id, node.id));

    res.status(201).json(created[0]);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to create memory node" });
  }
});

router.post("/memory/search", async (req, res) => {
  try {
    const { query, taskId, limit } = req.body;
    const nodes = await searchMemoryNodes(query, taskId, limit);
    res.json(nodes);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to search memory" });
  }
});

router.get("/memory/summary", async (req, res) => {
  try {
    const { taskId } = req.query as { taskId: string };

    const nodes = await db
      .select()
      .from(memoryNodesTable)
      .where(eq(memoryNodesTable.taskId, taskId))
      .orderBy(desc(memoryNodesTable.importance))
      .limit(50);

    const keyFacts = nodes.slice(0, 10).map((n) => n.summary);
    const summary = nodes.length
      ? `${nodes.length} memory nodes across types: ${[...new Set(nodes.map((n) => n.type))].join(", ")}.`
      : "No memory nodes found for this task.";

    res.json({
      taskId,
      nodeCount: nodes.length,
      summary,
      keyFacts,
      lastUpdated:
        nodes[0]?.createdAt ?? new Date(),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get memory summary" });
  }
});

export default router;
