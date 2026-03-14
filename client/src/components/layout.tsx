import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "4rem",
  } as React.CSSProperties;

  return (
    <SidebarProvider style={style}>
      <div className="flex h-screen w-full bg-background overflow-hidden">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="h-16 flex items-center px-4 md:px-6 bg-card border-b border-border/50 sticky top-0 z-10 shrink-0 shadow-sm shadow-black/5">
            <SidebarTrigger className="hover-elevate mr-4" />
            <div className="ml-auto flex items-center space-x-4">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm border border-primary/20">
                RM
              </div>
            </div>
          </header>
          <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto h-full">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
