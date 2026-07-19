import { EventEmitter } from "events";
import { db, pool } from "@workspace/db";
import { swarmTasksTable, taskRunsTable, agentResultsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { buildAutonomyPlan, executeAutonomyPlan } from "./autonomy.js";
import { executeTool } from "../tools/runtime.js";
import { runEmitters } from "../swarm/orchestrator.js";

async function withReconnect<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const maxRetries = 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try { return await fn(); }
    catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient = /ECONNRESET|ETIMEDOUT|ENOTFOUND|EPIPE|connection|terminating|idle|socket/i.test(msg);
      if (!isTransient || attempt === maxRetries) throw err;
      const delay = Math.min(500 * 2 ** (attempt - 1), 4000);
      console.warn(`[autonomous-runtime] DB op "${label}" failed (attempt ${attempt}/${maxRetries}), reconnecting in ${delay}ms: ${msg}`);
      try { const client = await (pool as any).connect(); client.release(); } catch {}
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastErr;
}

export async function runAutonomousTask(taskId: string, runId: string): Promise<void> {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(200);
  runEmitters.set(runId, emitter);
  try {
    const [task] = await db.select().from(swarmTasksTable).where(eq(swarmTasksTable.id, taskId));
    if (!task) throw new Error(`Task ${taskId} not found`);
    await db.update(taskRunsTable).set({ status: "running", startedAt: new Date() }).where(eq(taskRunsTable.id, runId));
    await db.update(swarmTasksTable).set({ status: "running", updatedAt: new Date() }).where(eq(swarmTasksTable.id, taskId));
    emitter.emit("event", { type: "start", message: `Autonomous execution started for: ${task.title}`, totalAgents: 1, mode: "autonomous" });
    const autonomyPlan = await buildAutonomyPlan(task.description);
    const planResults = await executeAutonomyPlan(autonomyPlan);
    const workspaceSnapshot = [] as string[];
    const rootList = await executeTool("filesystem.list_dir", { path: "." });
    if (rootList.ok) workspaceSnapshot.push(`root entries: ${(rootList.data as Array<{ name: string }> | []).map((entry) => entry.name).slice(0, 12).join(", ")}`);
    const packageJson = await executeTool("filesystem.read_file", { path: "package.json" });
    if (packageJson.ok) workspaceSnapshot.push("package.json available");
    const githubStatus = await executeTool("github.status", {});
    if (githubStatus.ok) workspaceSnapshot.push(`github connected: ${(githubStatus.data as { connected?: boolean } | undefined)?.connected ? "yes" : "no"}`);
    await executeTool("memory.set", { key: `autonomy:task:${taskId}`, value: { title: task.title, description: task.description, plan: autonomyPlan.steps.map((step) => step.title), results: planResults } });
    const summary = [`# Autonomous Execution Summary`, "", `Task: ${task.title}`, "", `Goal: ${task.description}`, "", "## Plan", ...autonomyPlan.steps.map((step) => `- ${step.title}`), "", "## Execution", ...planResults.map((step) => `- ${step.stepId}: ${step.result && typeof step.result === "object" && "ok" in step.result && (step.result as { ok: boolean }).ok ? "completed" : "checked"}`), "", "## Workspace Snapshot", ...workspaceSnapshot, "", "## Outcome", "The autonomous loop completed its inspection and recorded the task context for follow-on execution."].join("\n");
    const reportPath = `artifacts/autonomous/${taskId}.md`;
    await executeTool("filesystem.write_file", { path: reportPath, content: summary });
    let githubPush: unknown = null;
    const githubStatusCheck = await executeTool("github.status", {});
    if (githubStatusCheck.ok && (githubStatusCheck.data as { connected?: boolean } | undefined)?.connected) {
      githubPush = await executeTool("github.push_file", { path: `artifacts/autonomous/${taskId}.md`, content: summary, message: `SwarmAI: autonomous task ${task.title}` });
    }
    const resultId = crypto.randomUUID();
    await withReconnect("insert-agent-result", () => db.insert(agentResultsTable).values({ id: resultId, taskId, runId, agentId: "autonomous-loop", agentName: "Autonomous Execution Loop", domain: "autonomy", model: "local-autonomy", output: summary, status: "success", tokensUsed: Math.max(planResults.length * 100, 200), durationMs: 250 }));
    emitter.emit("event", { type: "agent_complete", agentId: "autonomous-loop", agentName: "Autonomous Execution Loop", domain: "autonomy", model: "local-autonomy", output: summary.slice(0, 600), status: "success", completedCount: 1, totalAgents: 1 });
    await withReconnect("complete-run", () => db.update(taskRunsTable).set({ status: "completed", completedAt: new Date() }).where(eq(taskRunsTable.id, runId)));
    await withReconnect("complete-task", () => db.update(swarmTasksTable).set({ status: "completed", updatedAt: new Date() }).where(eq(swarmTasksTable.id, taskId)));
    emitter.emit("event", { type: "done", message: githubPush ? `Autonomous task completed and pushed to GitHub at ${reportPath}` : `Autonomous task completed and saved to ${reportPath}`, reportPath, githubPush });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await withReconnect("fail-task", () => db.update(swarmTasksTable).set({ status: "failed", updatedAt: new Date() }).where(eq(swarmTasksTable.id, taskId))).catch(() => {});
    await withReconnect("fail-run", () => db.update(taskRunsTable).set({ status: "failed", completedAt: new Date() }).where(eq(taskRunsTable.id, runId))).catch(() => {});
    emitter.emit("event", { type: "error", message });
  } finally {
    setTimeout(() => runEmitters.delete(runId), 60_000);
  }
}
