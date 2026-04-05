import { Router } from "express";
import { db } from "../db"; // your existing db import
import { isAuthenticated } from "../auth";
import {
  workspaces, projects, issues, comments, sprints, labels,
  issueLabels, workspaceMembers,
  insertWorkspaceSchema, insertProjectSchema, insertIssueSchema, insertCommentSchema,
} from "../../shared/schema-jira";
import { eq, and, asc, desc } from "drizzle-orm";

const router = Router();

// ── Workspaces ────────────────────────────────────────────────────────────────

router.get("/workspaces", isAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const memberships = await db
      .select({ workspaceId: workspaceMembers.workspaceId })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, userId));

    const ids = memberships.map((m) => m.workspaceId);
    if (!ids.length) return res.json([]);

    const result = await db.select().from(workspaces).where(
      ids.length === 1
        ? eq(workspaces.id, ids[0])
        : undefined
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch workspaces" });
  }
});

router.post("/workspaces", isAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const parsed = insertWorkspaceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });

    const [ws] = await db.insert(workspaces).values(parsed.data).returning();

    await db.insert(workspaceMembers).values({
      workspaceId: ws.id,
      userId,
      role: "owner",
    });

    res.status(201).json(ws);
  } catch (err) {
    res.status(500).json({ message: "Failed to create workspace" });
  }
});

// ── Projects ──────────────────────────────────────────────────────────────────

router.get("/workspaces/:wsId/projects", isAuthenticated, async (req, res) => {
  try {
    const wsId = parseInt(req.params.wsId);
    const result = await db.select().from(projects)
      .where(eq(projects.workspaceId, wsId))
      .orderBy(asc(projects.createdAt));
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch projects" });
  }
});

router.post("/workspaces/:wsId/projects", isAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const wsId = parseInt(req.params.wsId);
    const parsed = insertProjectSchema.safeParse({ ...req.body, workspaceId: wsId, createdById: userId });
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });

    const [project] = await db.insert(projects).values(parsed.data).returning();

    // Create default labels
    await db.insert(labels).values([
      { name: "Bug", color: "#E24B4A", projectId: project.id },
      { name: "Feature", color: "#639922", projectId: project.id },
      { name: "Improvement", color: "#378ADD", projectId: project.id },
      { name: "Design", color: "#7F77DD", projectId: project.id },
    ]);

    // Create default sprint
    const now = new Date();
    const twoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    await db.insert(sprints).values({
      name: "Sprint 1",
      projectId: project.id,
      startDate: now,
      endDate: twoWeeks,
      status: "active",
    });

    res.status(201).json(project);
  } catch (err) {
    res.status(500).json({ message: "Failed to create project" });
  }
});

router.get("/projects/:projectId", isAuthenticated, async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!project) return res.status(404).json({ message: "Project not found" });
    res.json(project);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch project" });
  }
});

// ── Issues ────────────────────────────────────────────────────────────────────

router.get("/projects/:projectId/issues", isAuthenticated, async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const result = await db.select().from(issues)
      .where(eq(issues.projectId, projectId))
      .orderBy(asc(issues.order), desc(issues.createdAt));
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch issues" });
  }
});

router.post("/projects/:projectId/issues", isAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const projectId = parseInt(req.params.projectId);
    const parsed = insertIssueSchema.safeParse({
      ...req.body,
      projectId,
      reporterId: userId,
    });
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });

    const [issue] = await db.insert(issues).values(parsed.data).returning();
    res.status(201).json(issue);
  } catch (err) {
    res.status(500).json({ message: "Failed to create issue" });
  }
});

router.get("/issues/:issueId", isAuthenticated, async (req, res) => {
  try {
    const issueId = parseInt(req.params.issueId);
    const [issue] = await db.select().from(issues).where(eq(issues.id, issueId));
    if (!issue) return res.status(404).json({ message: "Issue not found" });
    res.json(issue);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch issue" });
  }
});

router.patch("/issues/:issueId", isAuthenticated, async (req, res) => {
  try {
    const issueId = parseInt(req.params.issueId);
    const updates = { ...req.body, updatedAt: new Date() };

    // Mark completedAt when done
    if (updates.status === "done" && !updates.completedAt) {
      updates.completedAt = new Date();
    } else if (updates.status && updates.status !== "done") {
      updates.completedAt = null;
    }

    const [updated] = await db.update(issues)
      .set(updates)
      .where(eq(issues.id, issueId))
      .returning();

    if (!updated) return res.status(404).json({ message: "Issue not found" });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: "Failed to update issue" });
  }
});

router.delete("/issues/:issueId", isAuthenticated, async (req, res) => {
  try {
    const issueId = parseInt(req.params.issueId);
    await db.delete(comments).where(eq(comments.issueId, issueId));
    await db.delete(issueLabels).where(eq(issueLabels.issueId, issueId));
    await db.delete(issues).where(eq(issues.id, issueId));
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ message: "Failed to delete issue" });
  }
});

// ── Comments ──────────────────────────────────────────────────────────────────

router.get("/issues/:issueId/comments", isAuthenticated, async (req, res) => {
  try {
    const issueId = parseInt(req.params.issueId);
    const result = await db.select().from(comments)
      .where(eq(comments.issueId, issueId))
      .orderBy(asc(comments.createdAt));
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch comments" });
  }
});

router.post("/issues/:issueId/comments", isAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const issueId = parseInt(req.params.issueId);
    const parsed = insertCommentSchema.safeParse({
      body: req.body.body,
      issueId,
      authorId: userId,
    });
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const [comment] = await db.insert(comments).values(parsed.data).returning();
    res.status(201).json(comment);
  } catch (err) {
    res.status(500).json({ message: "Failed to create comment" });
  }
});

router.delete("/comments/:commentId", isAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const commentId = parseInt(req.params.commentId);
    const [comment] = await db.select().from(comments).where(eq(comments.id, commentId));
    if (!comment) return res.status(404).json({ message: "Comment not found" });
    if (comment.authorId !== userId) return res.status(403).json({ message: "Forbidden" });
    await db.delete(comments).where(eq(comments.id, commentId));
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ message: "Failed to delete comment" });
  }
});

// ── Sprints ────────────────────────────────────────────────────────────────────

router.get("/projects/:projectId/sprints", isAuthenticated, async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const result = await db.select().from(sprints)
      .where(eq(sprints.projectId, projectId))
      .orderBy(desc(sprints.createdAt));
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch sprints" });
  }
});

// ── Labels ─────────────────────────────────────────────────────────────────────

router.get("/projects/:projectId/labels", isAuthenticated, async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const result = await db.select().from(labels).where(eq(labels.projectId, projectId));
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch labels" });
  }
});

// ── Workspace Members ─────────────────────────────────────────────────────────

router.get("/workspaces/:wsId/members", isAuthenticated, async (req, res) => {
  try {
    const wsId = parseInt(req.params.wsId);
    const result = await db.select().from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, wsId));
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch members" });
  }
});

router.post("/workspaces/:wsId/members", isAuthenticated, async (req, res) => {
  try {
    const wsId = parseInt(req.params.wsId);
    const [member] = await db.insert(workspaceMembers).values({
      workspaceId: wsId,
      userId: req.body.userId,
      role: req.body.role ?? "member",
    }).returning();
    res.status(201).json(member);
  } catch (err) {
    res.status(500).json({ message: "Failed to add member" });
  }
});

export default router;
