import { useState } from "react";
import { Plus, Search, Filter } from "lucide-react";
import { useIssues, useUpdateIssue } from "@/hooks/use-jira";
import { CreateIssueModal } from "@/components/create-issue-modal";
import { IssueDetail } from "@/components/issue-detail";
import type { Issue } from "@shared/schema-jira";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "backlog", label: "Backlog" },
  { value: "todo", label: "Todo" },
  { value: "in_progress", label: "In Progress" },
  { value: "in_review", label: "In Review" },
  { value: "done", label: "Done" },
  { value: "cancelled", label: "Cancelled" },
];

const PRIORITY_OPTIONS = [
  { value: "all", label: "All priorities" },
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const STATUS_COLORS: Record<string, string> = {
  backlog: "#B4B2A9", todo: "#378ADD", in_progress: "#EF9F27",
  in_review: "#7F77DD", done: "#639922", cancelled: "#E24B4A",
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#E24B4A", high: "#EF9F27", medium: "#378ADD", low: "#B4B2A9",
};

interface IssuesPageProps {
  projectId: number;
}

export default function IssuesPage({ projectId }: IssuesPageProps) {
  const { data: issues = [], isLoading } = useIssues(projectId);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");

  const filtered = issues.filter((i) => {
    if (search && !i.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== "all" && i.status !== statusFilter) return false;
    if (priorityFilter !== "all" && i.priority !== priorityFilter) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full">
      {/* Topbar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-background">
        <h1 className="text-sm font-medium">Issues · {filtered.length}</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-foreground text-background rounded-lg hover:opacity-90 transition-opacity"
        >
          <Plus size={13} />
          New issue
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 px-5 py-2.5 border-b border-border bg-background">
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search issues..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-muted/30 border border-border rounded-lg outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-2.5 py-1.5 text-xs border border-border rounded-lg bg-background outline-none"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="px-2.5 py-1.5 text-xs border border-border rounded-lg bg-background outline-none"
        >
          {PRIORITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
            <Filter size={24} className="mb-2 opacity-30" />
            <p className="text-sm">No issues found</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-5 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Title</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider w-28">Status</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider w-24">Priority</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider w-20">Type</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider w-16">ID</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((issue) => (
                <IssueTableRow
                  key={issue.id}
                  issue={issue}
                  onClick={() => setSelectedIssue(issue.id)}
                />
              ))}
            </tbody>
          </table>
        )}
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

function IssueTableRow({ issue, onClick }: { issue: Issue; onClick: () => void }) {
  return (
    <tr
      onClick={onClick}
      className="border-b border-border hover:bg-muted/20 cursor-pointer transition-colors"
    >
      <td className="px-5 py-3 text-sm">{issue.title}</td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS[issue.status] ?? "#B4B2A9" }} />
          <span className="text-xs text-muted-foreground capitalize">{issue.status.replace("_", " ")}</span>
        </div>
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full" style={{ background: PRIORITY_COLORS[issue.priority] ?? "#B4B2A9" }} />
          <span className="text-xs text-muted-foreground capitalize">{issue.priority}</span>
        </div>
      </td>
      <td className="px-3 py-3">
        <span className="text-xs text-muted-foreground capitalize">{issue.type}</span>
      </td>
      <td className="px-3 py-3">
        <span className="text-[11px] text-muted-foreground">#{issue.id}</span>
      </td>
    </tr>
  );
}
