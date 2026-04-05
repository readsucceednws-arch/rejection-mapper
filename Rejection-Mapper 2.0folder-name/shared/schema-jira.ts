import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users, organizations } from "./schema"; // your existing schema

// ── Workspaces ──────────────────────────────────────────────────────────────
export const workspaces = pgTable("workspaces", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  organizationId: integer("organization_id").references(() => organizations.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Projects ─────────────────────────────────────────────────────────────────
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  key: text("key").notNull(),           // e.g. "MOB", "WEB"
  description: text("description"),
  color: text("color").notNull().default("#378ADD"),
  workspaceId: integer("workspace_id").references(() => workspaces.id).notNull(),
  createdById: integer("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Sprints ───────────────────────────────────────────────────────────────────
export const sprints = pgTable("sprints", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  projectId: integer("project_id").references(() => projects.id).notNull(),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  status: text("status").notNull().default("active"), // active | completed | planned
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Issues ────────────────────────────────────────────────────────────────────
export const issues = pgTable("issues", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("backlog"),
  // backlog | todo | in_progress | in_review | done | cancelled
  priority: text("priority").notNull().default("medium"),
  // urgent | high | medium | low
  type: text("type").notNull().default("task"),
  // task | bug | feature | improvement
  projectId: integer("project_id").references(() => projects.id).notNull(),
  sprintId: integer("sprint_id").references(() => sprints.id),
  assigneeId: integer("assignee_id").references(() => users.id),
  reporterId: integer("reporter_id").references(() => users.id),
  order: integer("order").notNull().default(0),
  dueDate: timestamp("due_date"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Labels ────────────────────────────────────────────────────────────────────
export const labels = pgTable("labels", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#378ADD"),
  projectId: integer("project_id").references(() => projects.id).notNull(),
});

export const issueLabels = pgTable("issue_labels", {
  id: serial("id").primaryKey(),
  issueId: integer("issue_id").references(() => issues.id).notNull(),
  labelId: integer("label_id").references(() => labels.id).notNull(),
});

// ── Comments ──────────────────────────────────────────────────────────────────
export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  body: text("body").notNull(),
  issueId: integer("issue_id").references(() => issues.id).notNull(),
  authorId: integer("author_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Workspace Members ─────────────────────────────────────────────────────────
export const workspaceMembers = pgTable("workspace_members", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").references(() => workspaces.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  role: text("role").notNull().default("member"), // owner | admin | member | viewer
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
});

// ── Relations ─────────────────────────────────────────────────────────────────
export const workspacesRelations = relations(workspaces, ({ many }) => ({
  projects: many(projects),
  members: many(workspaceMembers),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [projects.workspaceId], references: [workspaces.id] }),
  issues: many(issues),
  sprints: many(sprints),
  labels: many(labels),
}));

export const issuesRelations = relations(issues, ({ one, many }) => ({
  project: one(projects, { fields: [issues.projectId], references: [projects.id] }),
  sprint: one(sprints, { fields: [issues.sprintId], references: [sprints.id] }),
  assignee: one(users, { fields: [issues.assigneeId], references: [users.id] }),
  reporter: one(users, { fields: [issues.reporterId], references: [users.id] }),
  comments: many(comments),
  issueLabels: many(issueLabels),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  issue: one(issues, { fields: [comments.issueId], references: [issues.id] }),
  author: one(users, { fields: [comments.authorId], references: [users.id] }),
}));

// ── Zod Schemas ───────────────────────────────────────────────────────────────
export const insertWorkspaceSchema = createInsertSchema(workspaces).omit({ id: true, createdAt: true });
export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true });
export const insertSprintSchema = createInsertSchema(sprints).omit({ id: true, createdAt: true });
export const insertIssueSchema = createInsertSchema(issues).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCommentSchema = createInsertSchema(comments).omit({ id: true, createdAt: true, updatedAt: true });
export const insertLabelSchema = createInsertSchema(labels).omit({ id: true });

export type Workspace = typeof workspaces.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Sprint = typeof sprints.$inferSelect;
export type Issue = typeof issues.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Label = typeof labels.$inferSelect;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;

export type InsertWorkspace = z.infer<typeof insertWorkspaceSchema>;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type InsertIssue = z.infer<typeof insertIssueSchema>;
export type InsertComment = z.infer<typeof insertCommentSchema>;
