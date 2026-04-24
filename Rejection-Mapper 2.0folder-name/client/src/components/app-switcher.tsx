/**
 * AppSwitcher.tsx
 * Drop this into: client/src/components/app-switcher.tsx
 * Then add <AppSwitcher /> to the bottom of AppSidebar (above the logout button)
 */

import { useState } from "react";
import { LayoutGrid, ExternalLink } from "lucide-react";
import { useUser } from "@/hooks/use-auth";

const APPS = [
  {
    id: "rejection",
    name: "Rejection Mapper",
    description: "Parts rejection tracker",
    url: "https://aicreator.co.in",
    icon: "🔴",
    current: true,
  },
  {
    id: "attendance",
    name: "Attendance Mapper",
    description: "Employee attendance & payroll",
    url: "https://attendance.aicreator.co.in",
    icon: "🟢",
    current: false,
  },
];

export function AppSwitcher() {
  const [open, setOpen] = useState(false);
  const { data: user } = useUser();
  const isAdmin = user?.role === "admin";

  // Only admins can see the switcher at all
  if (!isAdmin) return null;

  return (
    <div className="relative px-2 pb-2">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        <LayoutGrid className="w-4 h-4 shrink-0" />
        <span className="flex-1 text-left font-medium">Switch App</span>
        <span className="text-xs opacity-50">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-1 rounded-xl border border-border bg-card shadow-lg overflow-hidden">
          {APPS.map((app) => (
            <a
              key={app.id}
              href={app.current ? undefined : app.url}
              onClick={app.current ? (e) => e.preventDefault() : undefined}
              className={`flex items-center gap-3 px-3 py-3 transition-colors ${
                app.current
                  ? "opacity-60 cursor-default bg-muted/40"
                  : "hover:bg-muted cursor-pointer"
              }`}
            >
              <span className="text-xl">{app.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{app.name}</p>
                <p className="text-xs text-muted-foreground truncate">{app.description}</p>
              </div>
              {app.current ? (
                <span className="text-xs bg-primary/15 text-primary px-2 py-0.5 rounded-full font-medium shrink-0">
                  Active
                </span>
              ) : (
                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
