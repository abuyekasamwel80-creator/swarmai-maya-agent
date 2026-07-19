import { Router } from "express";
import { db } from "@workspace/db";
import {
  swarmTasksTable,
  taskRunsTable,
  agentResultsTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { runSwarmTask, runEmitters } from "../lib/swarm/orchestrator.js";
import { runAutonomousTask } from "../lib/agents/autonomous-runtime.js";
import { githubConfigTable } from "@workspace/db";
import { Octokit } from "@octokit/rest";

const router = Router();

// ── List tasks ───────────────────────────────────────────────────────────────
router.get("/tasks", async (req, res) => {
  try {
    const tasks = await db
      .select()
      .from(swarmTasksTable)
      .orderBy(desc(swarmTasksTable.createdAt));
    res.json(tasks);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list tasks" });
  }
});

// ── Create task ──────────────────────────────────────────────────────────────
router.post("/tasks", async (req, res) => {
  try {
    const { title, description, domains, maxAgents } = req.body;
    const id = crypto.randomUUID();
    await db.insert(swarmTasksTable).values({
      id,
      title,
      description,
      domains: domains ?? [],
      agentCount: maxAgents ?? 50,
      status: "pending",
    });
    const [task] = await db
      .select()
      .from(swarmTasksTable)
      .where(eq(swarmTasksTable.id, id));
    res.status(201).json(task);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to create task" });
  }
});

// ── Get task ─────────────────────────────────────────────────────────────────
router.get("/tasks/:id", async (req, res) => {
  try {
    const [task] = await db
      .select()
      .from(swarmTasksTable)
      .where(eq(swarmTasksTable.id, req.params.id));
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.json(task);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get task" });
  }
});

// ── Delete task ──────────────────────────────────────────────────────────────
router.delete("/tasks/:id", async (req, res) => {
  try {
    await db
      .delete(swarmTasksTable)
      .where(eq(swarmTasksTable.id, req.params.id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete task" });
  }
});

// ── Run task (launch swarm) ──────────────────────────────────────────────────
router.post("/tasks/:id/run", async (req, res) => {
  try {
    const taskId = req.params.id;
    const { maxAgents = 50, agentIds } = req.body ?? {};

    const [task] = await db
      .select()
      .from(swarmTasksTable)
      .where(eq(swarmTasksTable.id, taskId));
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const runId = crypto.randomUUID();
    await db.insert(taskRunsTable).values({
      id: runId,
      taskId,
      status: "running",
    });

    // Launch swarm asynchronously — prefer the full autonomous loop when the task is high-value
    const shouldUseAutonomy = Boolean(task.description?.toLowerCase().includes("autonomous") || task.description?.toLowerCase().includes("implement") || task.description?.toLowerCase().includes("fix") || task.description?.toLowerCase().includes("build") || task.description?.toLowerCase().includes("repo"));

    if (shouldUseAutonomy) {
      runAutonomousTask(taskId, runId).catch((err) =>
        console.error("Autonomous run failed:", err),
      );
    } else {
      runSwarmTask(taskId, runId, maxAgents, agentIds).catch((err) =>
        console.error("Swarm run failed:", err),
      );
    }

    res.status(202).json({ runId, taskId, status: "running" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to run task" });
  }
});

// ── SSE stream for a run ─────────────────────────────────────────────────────
router.get("/tasks/:id/stream", (req, res) => {
  const { runId } = req.query as { runId: string };

  if (!runId) {
    res.status(400).json({ error: "runId query param required" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    if (typeof (res as any).flush === "function") (res as any).flush();
  };

  const emitter = runEmitters.get(runId);
  if (!emitter) {
    send({ type: "error", message: "Run not found or already completed" });
    res.end();
    return;
  }

  const onEvent = (data: unknown) => send(data);
  emitter.on("event", onEvent);

  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 15_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    emitter.off("event", onEvent);
  });

  // Auto-close when done
  const onDone = () => {
    clearInterval(heartbeat);
    emitter.off("event", onEvent);
    emitter.off("done-internal", onDone);
    res.end();
  };
  emitter.on("done-internal", onDone);
});

// ── Get task results ──────────────────────────────────────────────────────────
router.get("/tasks/:id/results", async (req, res) => {
  try {
    const results = await db
      .select()
      .from(agentResultsTable)
      .where(eq(agentResultsTable.taskId, req.params.id))
      .orderBy(desc(agentResultsTable.createdAt));
    res.json(results);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get results" });
  }
});

// ── Save task work ────────────────────────────────────────────────────────────
router.post("/tasks/:id/save", async (req, res) => {
  try {
    const taskId = req.params.id;
    const { filename, format, pushToGithub, commitMessage } = req.body;

    // Gather results
    const results = await db
      .select()
      .from(agentResultsTable)
      .where(eq(agentResultsTable.taskId, taskId))
      .orderBy(desc(agentResultsTable.createdAt));

    const [task] = await db
      .select()
      .from(swarmTasksTable)
      .where(eq(swarmTasksTable.id, taskId));

    // Build content based on format
    let content = "";
    if (format === "json") {
      content = JSON.stringify({ task, results }, null, 2);
    } else {
      // markdown
      content = [
        `# ${task?.title ?? taskId}`,
        "",
        task?.description ?? "",
        "",
        `## Results (${results.length} agents)`,
        "",
        ...results.map(
          (r) =>
            `### ${r.agentName} (${r.domain})\n_Model: ${r.model} | Status: ${r.status} | ${r.durationMs ? `${r.durationMs}ms` : ""}_\n\n${r.output}\n`,
        ),
      ].join("\n");
    }

    let githubUrl: string | undefined;

    if (pushToGithub) {
      const [config] = await db.select().from(githubConfigTable);
      if (!config?.token || !config?.repoName) {
        res.status(400).json({ error: "GitHub not configured" });
        return;
      }

      const octokit = new Octokit({ auth: config.token });
      const [owner, repo] = (config.repoName ?? "").split("/");

      // Check if file exists
      let sha: string | undefined;
      try {
        const { data } = await octokit.repos.getContent({
          owner,
          repo,
          path: filename,
          ref: config.branch ?? "main",
        });
        if (!Array.isArray(data) && "sha" in data) sha = data.sha;
      } catch {}

      await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: filename,
        message: commitMessage ?? `SwarmAI: save ${filename}`,
        content: Buffer.from(content).toString("base64"),
        branch: config.branch ?? "main",
        ...(sha ? { sha } : {}),
      });

      githubUrl = `https://github.com/${owner}/${repo}/blob/${config.branch ?? "main"}/${filename}`;

      await db
        .update(githubConfigTable)
        .set({ lastPushedAt: new Date(), updatedAt: new Date() })
        .where(eq(githubConfigTable.id, "singleton"));
    }

    res.json({ filename, format, content, githubUrl });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to save task work" });
  }
});

export default router;
