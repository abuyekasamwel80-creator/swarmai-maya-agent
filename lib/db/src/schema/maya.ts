import { pgTable, text, integer, jsonb, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const mayaConversationsTable = pgTable("maya_conversations", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default("New Conversation"),
  taskType: text("task_type").notNull().default("general"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const mayaMessagesTable = pgTable("maya_messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => mayaConversationsTable.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  artifacts: jsonb("artifacts").$type<MayaArtifact[]>().default([]),
  agentCount: integer("agent_count"),
  domainsUsed: jsonb("domains_used").$type<string[]>().default([]),
  durationMs: integer("duration_ms"),
  modelsUsed: jsonb("models_used").$type<string[]>().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export interface MayaArtifact {
  id: string;
  type: "code" | "document" | "data" | "chart";
  language?: string;
  filename?: string;
  title?: string;
  content: string;
}

export const insertMayaConversationSchema = createInsertSchema(mayaConversationsTable).omit({
  createdAt: true,
  updatedAt: true,
});

export const insertMayaMessageSchema = createInsertSchema(mayaMessagesTable).omit({
  createdAt: true,
});

export type MayaConversation = typeof mayaConversationsTable.$inferSelect;
export type MayaMessage = typeof mayaMessagesTable.$inferSelect;
export type InsertMayaConversation = z.infer<typeof insertMayaConversationSchema>;
export type InsertMayaMessage = z.infer<typeof insertMayaMessageSchema>;
