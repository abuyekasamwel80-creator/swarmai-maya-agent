import { promises as fs } from "node:fs";
import path from "node:path";
import { Octokit } from "@octokit/rest";
import { db, githubConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface ToolCallPayload { toolId: string; args?: Record<string, unknown>; }
export interface ToolExecutionResult { ok: boolean; toolId: string; data?: unknown; error?: string; source?: string; }

const memoryStore = new Map<string, unknown>();

function getWorkspaceRoot() { return path.resolve(process.cwd(), "..", ".."); }
function ensureInsideWorkspace(targetPath: string) {
  const workspaceRoot = getWorkspaceRoot();
  const resolved = path.resolve(targetPath);
  if (!resolved.startsWith(workspaceRoot)) throw new Error("Resolved path escapes the workspace root");
  return resolved;
}

async function getGitHubConfig() {
  const [config] = await db.select().from(githubConfigTable);
  if (!config) return null;
  return config as { token?: string | null; repoName?: string | null; repoUrl?: string | null; branch?: string | null };
}

async function getOctokit() {
  const config = await getGitHubConfig();
  const token = config?.token ?? process.env.GITHUB_TOKEN ?? process.env.GITHUB_PAT;
  if (!token) throw new Error("GitHub credentials are not configured");
  return new Octokit({ auth: token });
}

async function listDirectory(args: Record<string, unknown>) {
  const target = typeof args.path === "string" ? args.path : ".";
  const resolved = ensureInsideWorkspace(path.resolve(getWorkspaceRoot(), target));
  const entries = await fs.readdir(resolved, { withFileTypes: true });
  return entries.map((entry) => ({ name: entry.name, type: entry.isDirectory() ? "dir" : entry.isFile() ? "file" : "other" }));
}

async function readFile(args: Record<string, unknown>) {
  const target = typeof args.path === "string" ? args.path : "";
  if (!target) throw new Error("A file path is required");
  const resolved = ensureInsideWorkspace(path.resolve(getWorkspaceRoot(), target));
  const contents = await fs.readFile(resolved, "utf8");
  return { path: target, contents };
}

async function writeFile(args: Record<string, unknown>) {
  const target = typeof args.path === "string" ? args.path : "";
  const content = typeof args.content === "string" ? args.content : "";
  if (!target) throw new Error("A file path is required");
  const resolved = ensureInsideWorkspace(path.resolve(getWorkspaceRoot(), target));
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, content, "utf8");
  return { path: target, written: true };
}

async function memoryGet(args: Record<string, unknown>) {
  const key = typeof args.key === "string" ? args.key : "";
  if (!key) throw new Error("A memory key is required");
  return { key, value: memoryStore.get(key) ?? null };
}

async function memorySet(args: Record<string, unknown>) {
  const key = typeof args.key === "string" ? args.key : "";
  const value = args.value;
  if (!key) throw new Error("A memory key is required");
  memoryStore.set(key, value);
  return { key, stored: true };
}

async function githubStatus() {
  const config = await getGitHubConfig();
  return { connected: !!config?.token && !!config?.repoName, repoName: config?.repoName ?? null, repoUrl: config?.repoUrl ?? null, branch: config?.branch ?? "main" };
}

async function githubGetRepoInfo(args: Record<string, unknown>) {
  const octokit = await getOctokit();
  const owner = typeof args.owner === "string" ? args.owner : "";
  const repo = typeof args.repo === "string" ? args.repo : "";
  if (!owner || !repo) {
    const config = await getGitHubConfig();
    if (!config?.repoName) throw new Error("GitHub repo is not configured");
    const [cfgOwner, cfgRepo] = config.repoName.split("/");
    return octokit.repos.get({ owner: cfgOwner, repo: cfgRepo });
  }
  return octokit.repos.get({ owner, repo });
}

async function githubListIssues(args: Record<string, unknown>) {
  const octokit = await getOctokit();
  const owner = typeof args.owner === "string" ? args.owner : "";
  const repo = typeof args.repo === "string" ? args.repo : "";
  if (!owner || !repo) {
    const config = await getGitHubConfig();
    if (!config?.repoName) throw new Error("GitHub repo is not configured");
    const [cfgOwner, cfgRepo] = config.repoName.split("/");
    const { data } = await octokit.issues.listForRepo({ owner: cfgOwner, repo: cfgRepo, per_page: 10 });
    return data;
  }
  const { data } = await octokit.issues.listForRepo({ owner, repo, per_page: 10 });
  return data;
}

async function githubCreateIssue(args: Record<string, unknown>) {
  const octokit = await getOctokit();
  const owner = typeof args.owner === "string" ? args.owner : "";
  const repo = typeof args.repo === "string" ? args.repo : "";
  const title = typeof args.title === "string" ? args.title : "";
  const body = typeof args.body === "string" ? args.body : "";
  if (!owner || !repo || !title) throw new Error("owner, repo, and title are required");
  const { data } = await octokit.issues.create({ owner, repo, title, body });
  return data;
}

async function githubPushFile(args: Record<string, unknown>) {
  const octokit = await getOctokit();
  const pathValue = typeof args.path === "string" ? args.path : "";
  const content = typeof args.content === "string" ? args.content : "";
  const message = typeof args.message === "string" ? args.message : `SwarmAI: ${pathValue || "update"}`;
  const branch = typeof args.branch === "string" ? args.branch : "main";
  if (!pathValue || !content) throw new Error("path and content are required");
  const config = await getGitHubConfig();
  const repoName = typeof args.repo === "string" ? args.repo : config?.repoName ?? "";
  if (!repoName) throw new Error("GitHub repo is not configured");
  const [owner, repo] = repoName.split("/");
  if (!owner || !repo) throw new Error("GitHub repo must be in owner/repo format");
  let sha: string | undefined;
  try { const { data } = await octokit.repos.getContent({ owner, repo, path: pathValue, ref: branch }); if (!Array.isArray(data) && "sha" in data) sha = data.sha; } catch {}
  const { data } = await octokit.repos.createOrUpdateFileContents({ owner, repo, path: pathValue, message, content: Buffer.from(content).toString("base64"), branch, ...(sha ? { sha } : {}) });
  return { htmlUrl: data.content?.html_url, commitSha: data.commit?.sha, path: pathValue, branch };
}

const toolHandlers: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {
  "filesystem.list_dir": listDirectory,
  "filesystem.read_file": readFile,
  "filesystem.write_file": writeFile,
  "memory.get": memoryGet,
  "memory.set": memorySet,
  "github.status": githubStatus,
  "github.get_repo_info": githubGetRepoInfo,
  "github.list_issues": githubListIssues,
  "github.create_issue": githubCreateIssue,
  "github.push_file": githubPushFile,
};

export async function executeTool(toolId: string, args: Record<string, unknown> = {}): Promise<ToolExecutionResult> {
  const handler = toolHandlers[toolId];
  if (!handler) return { ok: false, toolId, error: `Unknown tool: ${toolId}` };
  try { const data = await handler(args); return { ok: true, toolId, data, source: "runtime" }; }
  catch (error) { return { ok: false, toolId, error: error instanceof Error ? error.message : String(error), source: "runtime" }; }
}
