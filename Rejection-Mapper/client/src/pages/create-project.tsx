import { useState } from "react";
import { useLocation } from "wouter";
import { useCreateProject } from "@/hooks/use-jira";
import { useToast } from "@/hooks/use-toast";

const COLORS = [
  "#378ADD", "#D4537E", "#639922", "#EF9F27",
  "#7F77DD", "#1D9E75", "#D85A30", "#E24B4A",
];

interface CreateProjectPageProps {
  workspaceId: number;
}

export default function CreateProjectPage({ workspaceId }: CreateProjectPageProps) {
  const [, navigate] = useLocation();
  const createProject = useCreateProject(workspaceId);
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLORS[0]);

  const handleNameChange = (val: string) => {
    setName(val);
    if (!key || key === name.toUpperCase().replace(/\s+/g, "").slice(0, 4)) {
      setKey(val.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !key.trim()) return;
    try {
      const project = await createProject.mutateAsync({ name, key, description, color, workspaceId });
      toast({ title: "Project created!" });
      navigate(`/projects/${project.id}/board`);
    } catch (err: any) {
      toast({ title: "Failed to create project", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="flex items-center justify-center min-h-full p-8">
      <div className="w-full max-w-md">
        <h1 className="text-xl font-medium mb-1">Create project</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Set up a new project to track issues and manage your work.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Project name</label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Mobile App"
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background outline-none focus:border-foreground transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Key <span className="text-muted-foreground/50">(used as issue prefix)</span>
            </label>
            <input
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))}
              placeholder="MOB"
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background outline-none focus:border-foreground transition-colors font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this project about?"
              rows={3}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background outline-none resize-none focus:border-foreground transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Color</label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="w-7 h-7 rounded-full transition-transform hover:scale-110"
                  style={{
                    background: c,
                    outline: color === c ? `3px solid ${c}` : "none",
                    outlineOffset: "2px",
                  }}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="flex-1 px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || !key.trim() || createProject.isPending}
              className="flex-1 px-4 py-2 text-sm bg-foreground text-background rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {createProject.isPending ? "Creating..." : "Create project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
