import { useState } from "react";
import { X, Trash2, Send } from "lucide-react";
import { useIssue, useUpdateIssue, useDeleteIssue, useComments, useCreateComment } from "@/hooks/use-jira";
import { useUser } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

const STATUSES = [
  { value: "backlog", label: "Backlog", color: "#B4B2A9" },
  { value: "todo", label: "Todo", color: "#378ADD" },
  { value: "in_progress", label: "In Progress", color: "#EF9F27" },
  { value: "in_review", label: "In Review", color: "#7F77DD" },
  { value: "done", label: "Done", color: "#639922" },
  { value: "cancelled", label: "Cancelled", color: "#E24B4A" },
];

const PRIORITIES = [
  { value: "urgent", label: "Urgent", color: "#E24B4A" },
  { value: "high", label: "High", color: "#EF9F27" },
  { value: "medium", label: "Medium", color: "#378ADD" },
  { value: "low", label: "Low", color: "#B4B2A9" },
];

interface IssueDetailProps {
  issueId: number;
  projectId: number;
  onClose: () => void;
}

export function IssueDetail({ issueId, projectId, onClose }: IssueDetailProps) {
  const { data: issue, isLoading } = useIssue(issueId);
  const { data: comments = [] } = useComments(issueId);
  const { data: user } = useUser();
  const updateIssue = useUpdateIssue();
  const deleteIssue = useDeleteIssue(projectId);
  const createComment = useCreateComment(issueId);
  const { toast } = useToast();
  const [comment, setComment] = useState("");
  const [editTitle, setEditTitle] = useState(false);
  const [title, setTitle] = useState("");

  if (isLoading || !issue) {
    return (
      <SlidePanelShell onClose={onClose}>
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
          Loading...
        </div>
      </SlidePanelShell>
    );
  }

  const handleStatusChange = async (status: string) => {
    await updateIssue.mutateAsync({ id: issue.id, status });
  };

  const handlePriorityChange = async (priority: string) => {
    await updateIssue.mutateAsync({ id: issue.id, priority });
  };

  const handleTitleSave = async () => {
    if (title.trim() && title !== issue.title) {
      await updateIssue.mutateAsync({ id: issue.id, title });
    }
    setEditTitle(false);
  };

  const handleDelete = async () => {
    await deleteIssue.mutateAsync(issue.id);
    toast({ title: "Issue deleted" });
    onClose();
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;
    await createComment.mutateAsync({ body: comment, issueId, authorId: (user as any)?.id });
    setComment("");
  };

  const currentStatus = STATUSES.find((s) => s.value === issue.status);
  const currentPriority = PRIORITIES.find((p) => p.value === issue.priority);

  return (
    <SlidePanelShell onClose={onClose}>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <StatusBadge
            label={currentStatus?.label ?? issue.status}
            color={currentStatus?.color ?? "#B4B2A9"}
            options={STATUSES}
            value={issue.status}
            onChange={handleStatusChange}
          />
          <StatusBadge
            label={currentPriority?.label ?? issue.priority}
            color={currentPriority?.color ?? "#B4B2A9"}
            options={PRIORITIES}
            value={issue.priority}
            onChange={handlePriorityChange}
          />
        </div>
        <button
          onClick={handleDelete}
          className="text-muted-foreground hover:text-destructive transition-colors p-1"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Title */}
      {editTitle ? (
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleTitleSave}
          onKeyDown={(e) => e.key === "Enter" && handleTitleSave()}
          className="w-full text-lg font-medium bg-muted/30 rounded-lg px-2 py-1 outline-none border border-border mb-3"
        />
      ) : (
        <h2
          className="text-lg font-medium mb-3 cursor-pointer hover:opacity-70 transition-opacity"
          onClick={() => { setTitle(issue.title); setEditTitle(true); }}
        >
          {issue.title}
        </h2>
      )}

      {/* Description */}
      <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
        {issue.description || <span className="italic">No description</span>}
      </p>

      {/* Meta */}
      <div className="grid grid-cols-2 gap-3 mb-6 text-sm">
        <MetaItem label="Type" value={issue.type} />
        <MetaItem label="Created" value={formatDistanceToNow(new Date(issue.createdAt), { addSuffix: true })} />
        {issue.dueDate && (
          <MetaItem label="Due" value={new Date(issue.dueDate).toLocaleDateString()} />
        )}
        {issue.completedAt && (
          <MetaItem label="Completed" value={formatDistanceToNow(new Date(issue.completedAt), { addSuffix: true })} />
        )}
      </div>

      {/* Comments */}
      <div className="border-t border-border pt-4">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Comments · {comments.length}
        </h3>

        <div className="space-y-3 mb-4">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium flex-shrink-0">
                U
              </div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground mb-1">
                  {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                </p>
                <p className="text-sm leading-relaxed">{c.body}</p>
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={handleComment} className="flex gap-2">
          <input
            type="text"
            placeholder="Add a comment..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="flex-1 text-sm bg-muted/30 border border-border rounded-lg px-3 py-2 outline-none placeholder:text-muted-foreground/50"
          />
          <button
            type="submit"
            disabled={!comment.trim() || createComment.isPending}
            className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
          >
            <Send size={14} />
          </button>
        </form>
      </div>
    </SlidePanelShell>
  );
}

function SlidePanelShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-background border-l border-border w-full max-w-md h-full overflow-y-auto p-5">
        <div className="flex justify-end mb-2">
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-sm capitalize">{value}</p>
    </div>
  );
}

function StatusBadge({
  label, color, options, value, onChange,
}: {
  label: string; color: string;
  options: { value: string; label: string; color?: string }[];
  value: string; onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border border-border hover:bg-muted transition-colors"
      >
        <span className="w-2 h-2 rounded-full" style={{ background: color }} />
        {label}
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-background border border-border rounded-lg shadow-lg py-1 min-w-[130px]">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted text-left"
            >
              {opt.color && <span className="w-2 h-2 rounded-full" style={{ background: opt.color }} />}
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
