import { executeTool } from "../tools/runtime.js";

export interface AutonomyPlan {
  goal: string;
  steps: Array<{
    id: string;
    title: string;
    toolId?: string;
    args?: Record<string, unknown>;
    rationale: string;
  }>;
}

export async function buildAutonomyPlan(goal: string): Promise<AutonomyPlan> {
  const normalizedGoal = goal.trim();
  const steps: AutonomyPlan["steps"] = [];

  if (/github|repo|issue|pull request|pr/i.test(normalizedGoal)) {
    steps.push({
      id: "inspect-repo",
      title: "Inspect repository context",
      toolId: "filesystem.list_dir",
      args: { path: "." },
      rationale: "Establish the repository layout before making changes or planning work.",
    });
    steps.push({
      id: "check-github",
      title: "Check GitHub connectivity",
      toolId: "github.status",
      args: {},
      rationale: "Confirm that GitHub tools are available for repository operations.",
    });
  }

  if (/file|edit|write|create|implement|code/i.test(normalizedGoal)) {
    steps.push({
      id: "inspect-targets",
      title: "Inspect likely files",
      toolId: "filesystem.list_dir",
      args: { path: "artifacts/api-server/src" },
      rationale: "Locate the relevant code paths before editing or implementing anything.",
    });
  }

  if (/memory|remember|context/i.test(normalizedGoal)) {
    steps.push({
      id: "store-context",
      title: "Persist important context",
      toolId: "memory.set",
      args: { key: "autonomy:latest_goal", value: normalizedGoal },
      rationale: "Keep the current objective available to future reasoning steps.",
    });
  }

  if (steps.length === 0) {
    steps.push({
      id: "inspect-root",
      title: "Inspect workspace root",
      toolId: "filesystem.list_dir",
      args: { path: "." },
      rationale: "Gather the core workspace context before taking action.",
    });
  }

  return { goal: normalizedGoal, steps };
}

export async function executeAutonomyPlan(plan: AutonomyPlan): Promise<Array<{ stepId: string; result: unknown }>> {
  const results: Array<{ stepId: string; result: unknown }> = [];
  for (const step of plan.steps) {
    if (!step.toolId) continue;
    const result = await executeTool(step.toolId, step.args ?? {});
    results.push({ stepId: step.id, result });
  }
  return results;
}
