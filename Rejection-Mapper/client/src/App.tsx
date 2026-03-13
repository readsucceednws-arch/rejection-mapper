import { useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useUser } from "@/hooks/use-auth";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";

import { Layout } from "@/components/layout";
import Dashboard from "@/pages/dashboard";
import LogEntry from "@/pages/log-entry";
import ManageParts from "@/pages/manage-parts";
import ManageReasons from "@/pages/manage-rejection-types";
import ManageReworkTypes from "@/pages/manage-rework-types";
import RecentEntries from "@/pages/recent-entries";
import TeamPage from "@/pages/team";
import ImportData from "@/pages/import-data";
import ManageZones from "@/pages/manage-zones";

function AuthenticatedApp() {
  const { data: user, isLoading } = useUser();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("new_invite") && user) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (params.get("signin") && user) {
      fetch("/api/logout", { method: "POST", credentials: "include" }).then(() => {
        window.location.replace("/");
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
  if (!user || params.get("signin")) {
    return <LoginPage />;
  }

  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/log" component={LogEntry} />
        <Route path="/parts" component={ManageParts} />
        <Route path="/reasons" component={ManageReasons} />
        <Route path="/rework-types" component={ManageReworkTypes} />
        <Route path="/entries" component={RecentEntries} />
        <Route path="/team" component={TeamPage} />
        <Route path="/import" component={ImportData} />
        <Route path="/zones" component={ManageZones} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
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
