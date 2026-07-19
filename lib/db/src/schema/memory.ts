import { pgTable, text, real, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const memoryNodesTable = pgTable("memory_nodes", {
  id: text("id").primaryKey(),
  taskId: text("task_id"),
  type: text("type").notNull(),
  content: text("content").notNull(),
  summary: text("summary").notNull(),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  importance: real("importance").notNull().default(0.5),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMemoryNodeSchema = createInsertSchema(memoryNodesTable).omit(
  { createdAt: true },
);
export type MemoryNode = typeof memoryNodesTable.$inferSelect;
export type InsertMemoryNode = z.infer<typeof insertMemoryNodeSchema>;
