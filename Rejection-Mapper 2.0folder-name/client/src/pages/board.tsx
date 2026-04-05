import { useState } from "react";
import { Plus } from "lucide-react";
import { useIssues, useUpdateIssue, useSprints } from "@/hooks/use-jira";
import { CreateIssueModal } from "@/components/create-issue-modal";
import { IssueDetail } from "@/components/issue-detail";
import type { Issue } from "@shared/schema-jira";

const COLUMNS = [
  { status: "backlog", label: "Backlog", color: "#B4B2A9" },
  { status: "todo", label: "Todo", color: "#378ADD" },
  { status: "in_progress", label: "In Progress", color: "#EF9F27" },
  { status: "in_review", label: "In Review", color: "#7F77DD" },
  { status: "done", label: "Done", color: "#639922" },
  { status: "cancelled", label: "Cancelled", color: "#E24B4A" },
];

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#E24B4A",
  high: "#EF9F27",
  medium: "#378ADD",
  low: "#B4B2A9",
};

const PRIORITY_LABELS: Record<string, string> = {
  urgent: "U", high: "H", medium: "M", low: "L",
};

const TYPE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  bug: { bg: "#FCEBEB", text: "#A32D2D", label: "Bug" },
  feature: { bg: "#EAF3DE", text: "#3B6D11", label: "Feature" },
  task: { bg: "#E6F1FB", text: "#185FA5", label: "Task" },
  improvement: { bg: "#EEEDFE", text: "#3C3489", label: "Improvement" },
};

interface BoardPageProps {
  projectId: number;
}

export default function BoardPage({ projectId }: BoardPageProps) {
  const { data: issues = [], isLoading } = useIssues(projectId);
  const { data: sprints = [] } = useSprints(projectId);
  const updateIssue = useUpdateIssue();
  const [createFor, setCreateFor] = useState<string | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<number | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);

  const activeSprint = sprints.find((s) => s.status === "active");

  const issuesByStatus = (status: string) =>
    issues.filter((i) => i.status === status);

  const handleDrop = async (e: React.DragEvent, targetStatus: string) => {
    e.preventDefault();
    if (dragId === null) return;
    const issue = issues.find((i) => i.id === dragId);
    if (!issue || issue.status === targetStatus) return;
    await updateIssue.mutateAsync({ id: dragId, status: targetStatus });
    setDragId(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Loading board...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Topbar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-background">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-medium">Board</h1>
          {activeSprint && (
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {activeSprint.name}
            </span>
          )}
        </div>
        <button
          onClick={() => setCreateFor("backlog")}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-foreground text-background rounded-lg hover:opacity-90 transition-opacity"
        >
          <Plus size={13} />
          New issue
        </button>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto p-4">
        <div className="flex gap-3 h-full" style={{ minWidth: `${COLUMNS.length * 272}px` }}>
          {COLUMNS.map((col) => {
            const colIssues = issuesByStatus(col.status);
            return (
              <div
                key={col.status}
                className="w-64 flex-shrink-0 flex flex-col"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDrop(e, col.status)}
              >
                {/* Column header */}
                <div className="flex items-center gap-2 mb-2 px-1">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: col.color }} />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {col.label}
                  </span>
                  <span className="text-xs text-muted-foreground bg-muted px-1.5 rounded-full ml-auto">
                    {colIssues.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex flex-col gap-2 flex-1">
                  {colIssues.map((issue) => (
                    <IssueCard
                      key={issue.id}
                      issue={issue}
                      onClick={() => setSelectedIssue(issue.id)}
                      onDragStart={() => setDragId(issue.id)}
                    />
                  ))}

                  {/* Add button */}
                  <button
                    onClick={() => setCreateFor(col.status)}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg border border-dashed border-border transition-colors"
                  >
                    <Plus size={12} />
                    Add issue
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modals */}
      {createFor && (
        <CreateIssueModal
          projectId={projectId}
          defaultStatus={createFor}
          onClose={() => setCreateFor(null)}
        />
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

function IssueCard({
  issue, onClick, onDragStart,
}: {
  issue: Issue;
  onClick: () => void;
  onDragStart: () => void;
}) {
  const typeInfo = TYPE_COLORS[issue.type] ?? TYPE_COLORS.task;
  const priorityColor = PRIORITY_COLORS[issue.priority] ?? "#B4B2A9";
  const priorityLabel = PRIORITY_LABELS[issue.priority] ?? "M";

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className="bg-background border border-border rounded-xl p-3 cursor-pointer hover:border-border/80 hover:shadow-sm transition-all group"
    >
      <p className="text-[11px] text-muted-foreground mb-1">
        #{issue.id}
      </p>
      <p className="text-sm leading-snug mb-2.5 line-clamp-2">{issue.title}</p>
      <div className="flex items-center gap-1.5">
        {/* Priority */}
        <div
          className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold flex-shrink-0"
          style={{ background: priorityColor + "20", color: priorityColor }}
        >
          {priorityLabel}
        </div>
        {/* Type */}
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
          style={{ background: typeInfo.bg, color: typeInfo.text }}
        >
          {typeInfo.label}
        </span>
        {/* Assignee avatar */}
        {issue.assigneeId && (
          <div className="ml-auto w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[9px] font-medium">
            ?
          </div>
        )}
      </div>
    </div>
  );
}
