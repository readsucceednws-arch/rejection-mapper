import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  Workspace, Project, Issue, Comment, Sprint, Label,
  InsertWorkspace, InsertProject, InsertIssue, InsertComment,
} from "@shared/schema-jira";

const api = async (url: string, options?: RequestInit) => {
  const res = await fetch(`/api${url}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Request failed" }));
    throw new Error(err.message);
  }
  if (res.status === 204) return null;
  return res.json();
};

// ── Workspaces ────────────────────────────────────────────────────────────────

export function useWorkspaces() {
  return useQuery<Workspace[]>({
    queryKey: ["workspaces"],
    queryFn: () => api("/workspaces"),
  });
}

export function useCreateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: InsertWorkspace) =>
      api("/workspaces", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspaces"] }),
  });
}

// ── Projects ──────────────────────────────────────────────────────────────────

export function useProjects(workspaceId: number | undefined) {
  return useQuery<Project[]>({
    queryKey: ["projects", workspaceId],
    queryFn: () => api(`/workspaces/${workspaceId}/projects`),
    enabled: !!workspaceId,
  });
}

export function useProject(projectId: number | undefined) {
  return useQuery<Project>({
    queryKey: ["project", projectId],
    queryFn: () => api(`/projects/${projectId}`),
    enabled: !!projectId,
  });
}

export function useCreateProject(workspaceId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<InsertProject>) =>
      api(`/workspaces/${workspaceId}/projects`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects", workspaceId] }),
  });
}

// ── Issues ────────────────────────────────────────────────────────────────────

export function useIssues(projectId: number | undefined) {
  return useQuery<Issue[]>({
    queryKey: ["issues", projectId],
    queryFn: () => api(`/projects/${projectId}/issues`),
    enabled: !!projectId,
  });
}

export function useIssue(issueId: number | undefined) {
  return useQuery<Issue>({
    queryKey: ["issue", issueId],
    queryFn: () => api(`/issues/${issueId}`),
    enabled: !!issueId,
  });
}

export function useCreateIssue(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<InsertIssue>) =>
      api(`/projects/${projectId}/issues`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["issues", projectId] }),
  });
}

export function useUpdateIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Issue> & { id: number }) =>
      api(`/issues/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: (updated: Issue) => {
      qc.invalidateQueries({ queryKey: ["issues", updated.projectId] });
      qc.invalidateQueries({ queryKey: ["issue", updated.id] });
    },
  });
}

export function useDeleteIssue(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (issueId: number) =>
      api(`/issues/${issueId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["issues", projectId] }),
  });
}

// ── Comments ──────────────────────────────────────────────────────────────────

export function useComments(issueId: number | undefined) {
  return useQuery<Comment[]>({
    queryKey: ["comments", issueId],
    queryFn: () => api(`/issues/${issueId}/comments`),
    enabled: !!issueId,
  });
}

export function useCreateComment(issueId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: InsertComment) =>
      api(`/issues/${issueId}/comments`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comments", issueId] }),
  });
}

export function useDeleteComment(issueId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: number) =>
      api(`/comments/${commentId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comments", issueId] }),
  });
}

// ── Sprints ────────────────────────────────────────────────────────────────────

export function useSprints(projectId: number | undefined) {
  return useQuery<Sprint[]>({
    queryKey: ["sprints", projectId],
    queryFn: () => api(`/projects/${projectId}/sprints`),
    enabled: !!projectId,
  });
}

// ── Labels ─────────────────────────────────────────────────────────────────────

export function useLabels(projectId: number | undefined) {
  return useQuery<Label[]>({
    queryKey: ["labels", projectId],
    queryFn: () => api(`/projects/${projectId}/labels`),
    enabled: !!projectId,
  });
}
