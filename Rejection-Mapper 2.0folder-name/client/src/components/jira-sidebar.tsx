import { Link, useRoute } from "wouter";
import { useState } from "react";
import {
  LayoutGrid, List, Clock, AlertCircle, Settings, Users,
  ChevronDown, Plus, Kanban, BarChart2, Inbox,
} from "lucide-react";
import { useProjects } from "@/hooks/use-jira";
import { cn } from "@/lib/utils";

const PROJECT_COLORS = [
  "#378ADD", "#D4537E", "#639922", "#EF9F27",
  "#7F77DD", "#1D9E75", "#D85A30", "#B7B2A9",
];

interface JiraSidebarProps {
  workspaceId: number;
  workspaceName: string;
}

export function JiraSidebar({ workspaceId, workspaceName }: JiraSidebarProps) {
  const { data: projects = [] } = useProjects(workspaceId);
  const [expandedProject, setExpandedProject] = useState<number | null>(
    projects[0]?.id ?? null
  );

  return (
    <aside className="w-[220px] flex-shrink-0 bg-background border-r border-border flex flex-col h-full overflow-y-auto">
      {/* Workspace header */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <div className="w-7 h-7 rounded-md bg-[#4A1B0C] flex items-center justify-center text-[11px] font-medium text-[#F5C4B3]">
          {workspaceName.slice(0, 2).toUpperCase()}
        </div>
        <span className="text-sm font-medium truncate">{workspaceName}</span>
      </div>

      {/* Top nav */}
      <div className="px-2 py-2 border-b border-border">
        <NavItem href="/board" icon={<Inbox size={14} />} label="My issues" />
        <NavItem href="/board" icon={<BarChart2 size={14} />} label="Analytics" />
      </div>

      {/* Projects */}
      <div className="flex-1 px-2 py-2">
        <div className="flex items-center justify-between px-2 mb-1">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
            Projects
          </span>
          <Link href="/projects/new">
            <Plus size={13} className="text-muted-foreground hover:text-foreground cursor-pointer" />
          </Link>
        </div>

        {projects.map((project, i) => (
          <div key={project.id}>
            <button
              onClick={() => setExpandedProject(expandedProject === project.id ? null : project.id)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <div
                className="w-2 h-2 rounded-sm flex-shrink-0"
                style={{ background: project.color ?? PROJECT_COLORS[i % PROJECT_COLORS.length] }}
              />
              <span className="truncate text-left flex-1">{project.name}</span>
              <ChevronDown
                size={12}
                className={cn("transition-transform", expandedProject === project.id && "rotate-180")}
              />
            </button>

            {expandedProject === project.id && (
              <div className="ml-4 mt-0.5 flex flex-col gap-0.5">
                <ProjectNavItem href={`/projects/${project.id}/board`} icon={<Kanban size={13} />} label="Board" />
                <ProjectNavItem href={`/projects/${project.id}/backlog`} icon={<List size={13} />} label="Backlog" />
                <ProjectNavItem href={`/projects/${project.id}/issues`} icon={<AlertCircle size={13} />} label="Issues" />
                <ProjectNavItem href={`/projects/${project.id}/timeline`} icon={<Clock size={13} />} label="Timeline" />
                <ProjectNavItem href={`/projects/${project.id}/analytics`} icon={<BarChart2 size={13} />} label="Analytics" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Bottom nav */}
      <div className="px-2 py-2 border-t border-border">
        <NavItem href="/team" icon={<Users size={14} />} label="Team" />
        <NavItem href="/settings" icon={<Settings size={14} />} label="Settings" />
      </div>
    </aside>
  );
}

function NavItem({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  const [match] = useRoute(href);
  return (
    <Link href={href}>
      <div
        className={cn(
          "flex items-center gap-2 px-2 py-1.5 rounded-md text-sm cursor-pointer transition-colors",
          match
            ? "bg-muted text-foreground font-medium"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <span className="opacity-70">{icon}</span>
        {label}
      </div>
    </Link>
  );
}

function ProjectNavItem({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  const [match] = useRoute(href);
  return (
    <Link href={href}>
      <div
        className={cn(
          "flex items-center gap-2 px-2 py-1 rounded-md text-[12px] cursor-pointer transition-colors",
          match
            ? "bg-muted text-foreground font-medium"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <span className="opacity-60">{icon}</span>
        {label}
      </div>
    </Link>
  );
}
