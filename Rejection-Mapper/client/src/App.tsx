import { useEffect, useState } from "react";
import { Switch, Route, useRoute } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useUser } from "@/hooks/use-auth";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";

// Existing pages
import { Layout } from "@/components/layout";
import Dashboard from "@/pages/dashboard";
import AnalyticsDashboard from "@/pages/analytics-dashboard";
import LogEntry from "@/pages/log-entry";
import ManageParts from "@/pages/manage-parts";
import ManageReasons from "@/pages/manage-rejection-types";
import ManageReworkTypes from "@/pages/manage-rework-types";
import RecentEntries from "@/pages/recent-entries";
import TeamPage from "@/pages/team";
import ImportData from "@/pages/import-data";
import ManageZones from "@/pages/manage-zones";
import ReportsPage from "@/pages/reports";
import AlertsPage from "@/pages/alerts";

// Jira pages
import BoardPage from "@/pages/board";
import BacklogPage from "@/pages/backlog";
import IssuesPage from "@/pages/issues";
import CreateProjectPage from "@/pages/create-project";
import { JiraSidebar } from "@/components/jira-sidebar";

// Workspace ID — replace with real workspace lookup
const WORKSPACE_ID = 1;
const WORKSPACE_NAME = "My Workspace";

function JiraLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <JiraSidebar workspaceId={WORKSPACE_ID} workspaceName={WORKSPACE_NAME} />
      <main className="flex-1 overflow-hidden flex flex-col">
        {children}
      </main>
    </div>
  );
}

function JiraProjectRoute({ component: Component }: { component: React.ComponentType<{ projectId: number }> }) {
  const [, params] = useRoute("/projects/:id/:view*");
  const projectId = parseInt((params as any)?.id ?? "0");
  if (!projectId) return <NotFound />;
  return (
    <JiraLayout>
      <Component projectId={projectId} />
    </JiraLayout>
  );
}

function AuthenticatedApp() {
  const { data: user, isLoading } = useUser();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("new_invite") && user) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    if ((params.get("signin") || params.get("join")) && user) {
      fetch("/api/logout", { method: "POST", credentials: "include" }).then(() => {
        const nextQuery = params.get("join") ? "?join=1" : "";
        window.location.replace(`/${nextQuery}`);
      });
    }
  }, [user]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const params = new URLSearchParams(window.location.search);
  if (!user || params.get("signin") || params.get("join")) {
    return <LoginPage />;
  }

  return (
    <Switch>
      {/* ── Jira routes ── */}
      <Route path="/projects/new">
        <JiraLayout>
          <CreateProjectPage workspaceId={WORKSPACE_ID} />
        </JiraLayout>
      </Route>
      <Route path="/projects/:id/board">
        <JiraProjectRoute component={BoardPage} />
      </Route>
      <Route path="/projects/:id/backlog">
        <JiraProjectRoute component={BacklogPage} />
      </Route>
      <Route path="/projects/:id/issues">
        <JiraProjectRoute component={IssuesPage} />
      </Route>

      {/* ── Existing routes ── */}
      <Route path="/">
        <Layout><Dashboard /></Layout>
      </Route>
      <Route path="/analytics">
        <Layout><AnalyticsDashboard /></Layout>
      </Route>
      <Route path="/reports">
        <Layout><ReportsPage /></Layout>
      </Route>
      <Route path="/alerts">
        <Layout><AlertsPage /></Layout>
      </Route>
      <Route path="/log">
        <Layout><LogEntry /></Layout>
      </Route>
      <Route path="/parts">
        <Layout><ManageParts /></Layout>
      </Route>
      <Route path="/reasons">
        <Layout><ManageReasons /></Layout>
      </Route>
      <Route path="/rework-types">
        <Layout><ManageReworkTypes /></Layout>
      </Route>
      <Route path="/entries">
        <Layout><RecentEntries /></Layout>
      </Route>
      <Route path="/team">
        <Layout><TeamPage /></Layout>
      </Route>
      <Route path="/import">
        <Layout><ImportData /></Layout>
      </Route>
      <Route path="/zones">
        <Layout><ManageZones /></Layout>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthenticatedApp />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
