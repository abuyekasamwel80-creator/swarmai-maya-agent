import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const githubConfigTable = pgTable("github_config", {
  id: text("id").primaryKey().default("singleton"),
  repoUrl: text("repo_url"),
  repoName: text("repo_name"),
  branch: text("branch").default("main"),
  token: text("token"),
  lastPushedAt: timestamp("last_pushed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertGithubConfigSchema = createInsertSchema(
  githubConfigTable,
).omit({ createdAt: true, updatedAt: true });
export type GithubConfig = typeof githubConfigTable.$inferSelect;
export type InsertGithubConfig = z.infer<typeof insertGithubConfigSchema>;
