import { Router } from "express";
import { db } from "@workspace/db";
import { githubConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { Octokit } from "@octokit/rest";

const router = Router();

router.get("/github/status", async (req, res) => {
  try {
    const [config] = await db.select().from(githubConfigTable);
    if (!config) { res.json({ connected: false }); return; }
    res.json({ connected: !!config.token && !!config.repoName, repoUrl: config.repoUrl, repoName: config.repoName, branch: config.branch, lastPushedAt: config.lastPushedAt });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Failed to get GitHub status" }); }
});

router.post("/github/connect", async (req, res) => {
  try {
    const { repoUrl, token, branch } = req.body;
    const match = repoUrl.match(/github\.com[/:]([^/]+\/[^/]+?)(\.git)?$/);
    if (!match) { res.status(400).json({ error: "Invalid GitHub repo URL" }); return; }
    const repoName = match[1];
    const octokit = new Octokit({ auth: token });
    const [owner, repo] = repoName.split("/");
    try { await octokit.repos.get({ owner, repo }); } catch { res.status(400).json({ error: "Cannot access repository" }); return; }
    const configRow = await db.select().from(githubConfigTable);
    if (configRow.length) { await db.update(githubConfigTable).set({ repoUrl, repoName, token, branch: branch ?? "main", updatedAt: new Date() }).where(eq(githubConfigTable.id, "singleton")); }
    else { await db.insert(githubConfigTable).values({ id: "singleton", repoUrl, repoName, token, branch: branch ?? "main" }); }
    res.json({ connected: true, repoName, branch: branch ?? "main" });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Failed to connect GitHub" }); }
});

router.post("/github/create-repo", async (req, res) => {
  try {
    const { name, description, private: isPrivate, token } = req.body as { name: string; description?: string; private?: boolean; token?: string };
    if (!name?.trim()) { res.status(400).json({ error: "Repository name is required" }); return; }
    let authToken = token;
    if (!authToken) { const [config] = await db.select().from(githubConfigTable); authToken = config?.token ?? undefined; }
    if (!authToken) { res.status(400).json({ error: "No GitHub token available" }); return; }
    const octokit = new Octokit({ auth: authToken });
    const { data: user } = await octokit.users.getAuthenticated();
    const owner = user.login;
    let repo;
    try { const existing = await octokit.repos.get({ owner, repo: name }); repo = existing.data; } catch {
      const { data: created } = await octokit.repos.createForAuthenticatedUser({ name, description: description ?? "SwarmAI Agent Swarm", private: isPrivate ?? false, auto_init: true });
      repo = created;
    }
    const repoUrl = repo.html_url;
    const repoName = `${owner}/${name}`;
    const branch = repo.default_branch ?? "main";
    const configRow = await db.select().from(githubConfigTable);
    if (configRow.length) { await db.update(githubConfigTable).set({ repoUrl, repoName, token: authToken, branch, updatedAt: new Date() }).where(eq(githubConfigTable.id, "singleton")); }
    else { await db.insert(githubConfigTable).values({ id: "singleton", repoUrl, repoName, token: authToken, branch }); }
    res.json({ connected: true, repoUrl, repoName, branch, owner, created: !repo.pushed_at });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Failed to create repository" }); }
});

router.post("/github/push", async (req, res) => {
  try {
    const { filename, content, commitMessage } = req.body;
    const [config] = await db.select().from(githubConfigTable);
    if (!config?.token || !config?.repoName) { res.status(400).json({ error: "GitHub not configured" }); return; }
    const octokit = new Octokit({ auth: config.token });
    const [owner, repo] = config.repoName.split("/");
    const branch = config.branch ?? "main";
    let sha: string | undefined;
    try { const { data } = await octokit.repos.getContent({ owner, repo, path: filename, ref: branch }); if (!Array.isArray(data) && "sha" in data) sha = data.sha; } catch {}
    const result = await octokit.repos.createOrUpdateFileContents({ owner, repo, path: filename, message: commitMessage ?? `SwarmAI: ${filename}`, content: Buffer.from(content).toString("base64"), branch, ...(sha ? { sha } : {}) });
    await db.update(githubConfigTable).set({ lastPushedAt: new Date(), updatedAt: new Date() }).where(eq(githubConfigTable.id, "singleton"));
    res.json({ url: result.data.content?.html_url, sha: result.data.content?.sha });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Failed to push to GitHub" }); }
});

export default router;
