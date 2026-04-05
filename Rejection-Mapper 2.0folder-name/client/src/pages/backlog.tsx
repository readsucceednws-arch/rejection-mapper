import { useState } from "react";
import { Plus, ChevronDown, ChevronRight } from "lucide-react";
import { useIssues, useSprints, useUpdateIssue } from "@/hooks/use-jira";
import { CreateIssueModal } from "@/components/create-issue-modal";
import { IssueDetail } from "@/components/issue-detail";
import type { Issue } from "@shared/schema-jira";

const STATUS_COLORS: Record<string, string> = {
  backlog: "#B4B2A9", todo: "#378ADD", in_progress: "#EF9F27",
  in_review: "#7F77DD", done: "#639922", cancelled: "#E24B4A",
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#E24B4A", high: "#EF9F27", medium: "#378ADD", low: "#B4B2A9",
};

interface BacklogPageProps {
  projectId: number;
}

export default function BacklogPage({ projectId }: BacklogPageProps) {
  const { data: issues = [], isLoading } = useIssues(projectId);
  const { data: sprints = [] } = useSprints(projectId);
  const updateIssue = useUpdateIssue();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<number | null>(null);
  const [sprintOpen, setSprintOpen] = useState(true);
  const [backlogOpen, setBacklogOpen] = useState(true);

  const activeSprint = sprints.find((s) => s.status === "active");
  const sprintIssues = activeSprint
    ? issues.filter((i) => i.sprintId === activeSprint.id)
    : [];
  const backlogIssues = issues.filter((i) => !i.sprintId || i.status === "backlog");

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-background">
        <h1 className="text-sm font-medium">Backlog</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-foreground text-background rounded-lg hover:opacity-90 transition-opacity"
        >
          <Plus size={13} />
          New issue
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Active sprint */}
        {activeSprint && (
          <Section
            title={activeSprint.name}
            count={sprintIssues.length}
            open={sprintOpen}
            onToggle={() => setSprintOpen((o) => !o)}
            badge="Active"
          >
            {sprintIssues.map((issue) => (
              <IssueRow
                key={issue.id}
                issue={issue}
                onClick={() => setSelectedIssue(issue.id)}
                onStatusChange={(s) => updateIssue.mutateAsync({ id: issue.id, status: s })}
              />
            ))}
          </Section>
        )}

        {/* Backlog */}
        <Section
          title="Backlog"
          count={backlogIssues.length}
          open={backlogOpen}
          onToggle={() => setBacklogOpen((o) => !o)}
        >
          {backlogIssues.map((issue) => (
            <IssueRow
              key={issue.id}
              issue={issue}
              onClick={() => setSelectedIssue(issue.id)}
              onStatusChange={(s) => updateIssue.mutateAsync({ id: issue.id, status: s })}
            />
          ))}
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          >
            <Plus size={12} />
            Add issue
          </button>
        </Section>
      </div>

      {showCreate && (
        <CreateIssueModal projectId={projectId} onClose={() => setShowCreate(false)} />
      )}
      {selectedIssue && (
        <IssueDetail
          issueId={selectedIssue}
          projectId={projectId}
          onClose={() => setSelectedIssue(null)}
        />
      )}
    </div>
  );
}

function Section({
  title, count, open, onToggle, badge, children,
}: {
  title: string; count: number; open: boolean;
  onToggle: () => void; badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full mb-2 group"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground bg-muted px-1.5 rounded-full">{count}</span>
        {badge && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
            {badge}
          </span>
        )}
      </button>
      {open && (
        <div className="border border-border rounded-xl overflow-hidden">
          {children}
        </div>
      )}
    </div>
  );
}

function IssueRow({
  issue, onClick, onStatusChange,
}: {
  issue: Issue;
  onClick: () => void;
  onStatusChange: (s: string) => void;
}) {
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 px-3 py-2.5 border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
    >
      {/* Status dot */}
      <div
        className="w-3 h-3 rounded-full flex-shrink-0 border-2"
        style={{ borderColor: STATUS_COLORS[issue.status] ?? "#B4B2A9" }}
      />
      {/* Title */}
      <span className="text-sm flex-1 truncate">{issue.title}</span>
      {/* Priority */}
      <div
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: PRIORITY_COLORS[issue.priority] ?? "#B4B2A9" }}
      />
      {/* ID */}
      <span className="text-[11px] text-muted-foreground">#{issue.id}</span>
    </div>
  );
}
