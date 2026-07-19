import { pgTable, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const swarmTasksTable = pgTable("swarm_tasks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("pending"),
  domains: jsonb("domains").$type<string[]>().notNull().default([]),
  agentCount: integer("agent_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const taskRunsTable = pgTable("task_runs", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .references(() => swarmTasksTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("running"),
  agentsSpawned: integer("agents_spawned").notNull().default(0),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const agentResultsTable = pgTable("agent_results", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .references(() => swarmTasksTable.id, { onDelete: "cascade" }),
  runId: text("run_id")
    .notNull()
    .references(() => taskRunsTable.id, { onDelete: "cascade" }),
  agentId: text("agent_id").notNull(),
  agentName: text("agent_name").notNull(),
  domain: text("domain").notNull(),
  model: text("model").notNull(),
  output: text("output").notNull(),
  status: text("status").notNull().default("success"),
  tokensUsed: integer("tokens_used"),
  durationMs: integer("duration_ms"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSwarmTaskSchema = createInsertSchema(swarmTasksTable).omit({
  createdAt: true,
  updatedAt: true,
});
export const insertTaskRunSchema = createInsertSchema(taskRunsTable).omit({
  startedAt: true,
});
export const insertAgentResultSchema = createInsertSchema(
  agentResultsTable,
).omit({ createdAt: true });

export type SwarmTask = typeof swarmTasksTable.$inferSelect;
export type InsertSwarmTask = z.infer<typeof insertSwarmTaskSchema>;
export type TaskRun = typeof taskRunsTable.$inferSelect;
export type InsertTaskRun = z.infer<typeof insertTaskRunSchema>;
export type AgentResult = typeof agentResultsTable.$inferSelect;
export type InsertAgentResult = z.infer<typeof insertAgentResultSchema>;
