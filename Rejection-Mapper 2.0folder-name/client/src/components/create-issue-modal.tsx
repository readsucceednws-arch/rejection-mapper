import { useState } from "react";
import { X, ChevronDown } from "lucide-react";
import { useCreateIssue } from "@/hooks/use-jira";
import { useToast } from "@/hooks/use-toast";

const STATUSES = [
  { value: "backlog", label: "Backlog", color: "#B4B2A9" },
  { value: "todo", label: "Todo", color: "#378ADD" },
  { value: "in_progress", label: "In Progress", color: "#EF9F27" },
  { value: "in_review", label: "In Review", color: "#7F77DD" },
  { value: "done", label: "Done", color: "#639922" },
];

const PRIORITIES = [
  { value: "urgent", label: "Urgent", color: "#E24B4A" },
  { value: "high", label: "High", color: "#EF9F27" },
  { value: "medium", label: "Medium", color: "#378ADD" },
  { value: "low", label: "Low", color: "#B4B2A9" },
];

const TYPES = [
  { value: "task", label: "Task" },
  { value: "bug", label: "Bug" },
  { value: "feature", label: "Feature" },
  { value: "improvement", label: "Improvement" },
];

interface CreateIssueModalProps {
  projectId: number;
  defaultStatus?: string;
  onClose: () => void;
}

export function CreateIssueModal({ projectId, defaultStatus = "backlog", onClose }: CreateIssueModalProps) {
  const { toast } = useToast();
  const createIssue = useCreateIssue(projectId);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState(defaultStatus);
  const [priority, setPriority] = useState("medium");
  const [type, setType] = useState("task");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    try {
      await createIssue.mutateAsync({ title, description, status, priority, type, projectId });
      toast({ title: "Issue created" });
      onClose();
    } catch (err: any) {
      toast({ title: "Failed to create issue", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-background border border-border rounded-xl shadow-xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-medium">Create issue</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="px-5 py-4 space-y-4">
            {/* Title */}
            <div>
              <input
                autoFocus
                type="text"
                placeholder="Issue title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full text-sm font-medium bg-transparent border-none outline-none placeholder:text-muted-foreground/50 text-foreground"
              />
            </div>

            {/* Description */}
            <div>
              <textarea
                placeholder="Add description..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full text-sm bg-muted/30 rounded-lg border border-border p-3 outline-none resize-none placeholder:text-muted-foreground/50 text-foreground"
              />
            </div>

            {/* Meta row */}
            <div className="flex flex-wrap gap-2">
              <SelectPill
                label={STATUSES.find((s) => s.value === status)?.label ?? "Status"}
                color={STATUSES.find((s) => s.value === status)?.color}
                options={STATUSES}
                value={status}
                onChange={setStatus}
              />
              <SelectPill
                label={PRIORITIES.find((p) => p.value === priority)?.label ?? "Priority"}
                color={PRIORITIES.find((p) => p.value === priority)?.color}
                options={PRIORITIES}
                value={priority}
                onChange={setPriority}
              />
              <SelectPill
                label={TYPES.find((t) => t.value === type)?.label ?? "Type"}
                options={TYPES}
                value={type}
                onChange={setType}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || createIssue.isPending}
              className="px-4 py-1.5 text-sm bg-foreground text-background rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {createIssue.isPending ? "Creating..." : "Create issue"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SelectPill({
  label, color, options, value, onChange,
}: {
  label: string;
  color?: string;
  options: { value: string; label: string; color?: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border border-border bg-muted/30 hover:bg-muted transition-colors text-foreground"
      >
        {color && (
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
        )}
        {label}
        <ChevronDown size={11} className="text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-background border border-border rounded-lg shadow-lg py-1 min-w-[120px]">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted transition-colors text-left ${value === opt.value ? "font-medium" : ""}`}
            >
              {opt.color && (
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: opt.color }} />
              )}
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
