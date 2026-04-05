import { useState } from "react";
import { useUser } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle, TrendingUp, CheckCircle, Bell, Zap, Activity, RefreshCw
} from "lucide-react";

interface AlertRule {
  id: string;
  name: string;
  condition: string;
  threshold: number;
  triggered: boolean;
  value: number;
  severity: "low" | "medium" | "high";
}

function computeAlerts(weeklyData: any, monthlyData: any, thresholds: Record<string, number>): AlertRule[] {
  const alerts: AlertRule[] = [];

  if (!weeklyData?.summary) return alerts;

  const { summary, trends } = weeklyData;
  const weekTrend = trends?.last7Days;

  // Rule 1: Total issues above threshold
  if (summary.totalIssues > thresholds.maxIssues) {
    alerts.push({
      id: "total-issues",
      name: "High issue count",
      condition: `More than ${thresholds.maxIssues} issues this week`,
      threshold: thresholds.maxIssues,
      triggered: true,
      value: summary.totalIssues,
      severity: summary.totalIssues > thresholds.maxIssues * 2 ? "high" : "medium",
    });
  }

  // Rule 2: Rapid increase in defects
  if (weekTrend?.changePercent?.count > thresholds.spikePercent) {
    alerts.push({
      id: "spike",
      name: "Defect spike detected",
      condition: `>${thresholds.spikePercent}% increase vs previous week`,
      threshold: thresholds.spikePercent,
      triggered: true,
      value: Math.round(weekTrend.changePercent.count),
      severity: weekTrend.changePercent.count > 100 ? "high" : "medium",
    });
  }

  // Rule 3: Total quantity above threshold
  if (summary.totalQuantity > thresholds.maxQuantity) {
    alerts.push({
      id: "quantity",
      name: "High defect quantity",
      condition: `More than ${thresholds.maxQuantity} units rejected/reworked`,
      threshold: thresholds.maxQuantity,
      triggered: true,
      value: summary.totalQuantity,
      severity: "medium",
    });
  }

  // Rule 4: All good
  if (alerts.length === 0) {
    alerts.push({
      id: "all-good",
      name: "All metrics normal",
      condition: "No thresholds breached",
      threshold: 0,
      triggered: false,
      value: 0,
      severity: "low",
    });
  }

  return alerts;
}

const severityColor = {
  high: "destructive" as const,
  medium: "outline" as const,
  low: "secondary" as const,
};

const severityIcon = {
  high: <AlertTriangle className="h-4 w-4 text-red-500" />,
  medium: <TrendingUp className="h-4 w-4 text-amber-500" />,
  low: <CheckCircle className="h-4 w-4 text-green-500" />,
};

export default function AlertsPage() {
  const { data: user } = useUser();
  const { toast } = useToast();
  const orgId = user?.organizationId;

  const [thresholds, setThresholds] = useState({
    maxIssues: 50,
    spikePercent: 30,
    maxQuantity: 200,
  });

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(thresholds);

  const { data: weekly, isLoading, refetch } = useQuery({
    queryKey: ["/api/reporting/weekly", orgId],
    queryFn: async () => {
      const res = await fetch(`/api/reporting/weekly/${orgId}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!orgId,
  });

  const { data: monthly } = useQuery({
    queryKey: ["/api/reporting/monthly", orgId],
    queryFn: async () => {
      const res = await fetch(`/api/reporting/monthly/${orgId}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!orgId,
  });

  const alerts = computeAlerts(weekly, monthly, thresholds);
  const triggered = alerts.filter(a => a.triggered);
  const highAlerts = triggered.filter(a => a.severity === "high");

  function saveThresholds() {
    setThresholds(draft);
    setEditing(false);
    toast({ title: "Alert rules updated" });
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="h-6 w-6" /> Alerts
          </h1>
          <p className="text-muted-foreground">Rule-based quality monitoring and spike detection</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      {/* Status banner */}
      <Card className={highAlerts.length > 0 ? "border-red-300 bg-red-50 dark:bg-red-950/20" : "border-green-300 bg-green-50 dark:bg-green-950/20"}>
        <CardContent className="pt-4 flex items-center gap-3">
          {highAlerts.length > 0 ? (
            <>
              <AlertTriangle className="h-6 w-6 text-red-500 shrink-0" />
              <div>
                <p className="font-semibold text-red-700 dark:text-red-400">
                  {highAlerts.length} high-severity alert{highAlerts.length > 1 ? "s" : ""} active
                </p>
                <p className="text-sm text-red-600 dark:text-red-500">Immediate attention recommended</p>
              </div>
            </>
          ) : (
            <>
              <CheckCircle className="h-6 w-6 text-green-500 shrink-0" />
              <div>
                <p className="font-semibold text-green-700 dark:text-green-400">All systems normal</p>
                <p className="text-sm text-green-600 dark:text-green-500">No critical thresholds breached</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stats */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4" /> This week
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-12 bg-muted animate-pulse rounded" />
            ) : (
              <div className="space-y-1">
                <p className="text-2xl font-bold">{weekly?.summary?.totalIssues ?? 0}</p>
                <p className="text-sm text-muted-foreground">Total issues logged</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4" /> Alerts triggered
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{triggered.filter(a => a.id !== "all-good").length}</p>
            <p className="text-sm text-muted-foreground">of {Object.keys(thresholds).length} rules</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Weekly change
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-12 bg-muted animate-pulse rounded" />
            ) : (
              <div className="space-y-1">
                <p className="text-2xl font-bold">
                  {weekly?.trends?.last7Days?.changePercent?.count != null
                    ? `${weekly.trends.last7Days.changePercent.count > 0 ? "+" : ""}${weekly.trends.last7Days.changePercent.count.toFixed(1)}%`
                    : "—"}
                </p>
                <p className="text-sm text-muted-foreground">vs previous 7 days</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Active alerts */}
      <Card>
        <CardHeader>
          <CardTitle>Active alerts</CardTitle>
          <CardDescription>Based on your current thresholds and this week's data</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {alerts.map(alert => (
            <div
              key={alert.id}
              className={`flex items-start justify-between p-4 rounded-lg border ${
                alert.triggered && alert.id !== "all-good"
                  ? "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800"
                  : "bg-muted/30"
              }`}
            >
              <div className="flex items-start gap-3">
                {severityIcon[alert.severity]}
                <div>
                  <p className="font-medium text-sm">{alert.name}</p>
                  <p className="text-xs text-muted-foreground">{alert.condition}</p>
                  {alert.triggered && alert.id !== "all-good" && (
                    <p className="text-xs font-medium mt-1 text-amber-700 dark:text-amber-400">
                      Current value: {alert.value}
                    </p>
                  )}
                </div>
              </div>
              <Badge variant={alert.triggered && alert.id !== "all-good" ? severityColor[alert.severity] : "secondary"}>
                {alert.triggered && alert.id !== "all-good" ? "Triggered" : "OK"}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Threshold settings */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Alert thresholds</CardTitle>
            <CardDescription>Customize when alerts trigger</CardDescription>
          </div>
          {!editing ? (
            <Button variant="outline" size="sm" onClick={() => { setDraft(thresholds); setEditing(true); }}>
              Edit rules
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
              <Button size="sm" onClick={saveThresholds}>Save</Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Max issues per week</Label>
              {editing ? (
                <Input
                  type="number"
                  value={draft.maxIssues}
                  onChange={e => setDraft(d => ({ ...d, maxIssues: Number(e.target.value) }))}
                />
              ) : (
                <p className="text-sm font-medium py-2">{thresholds.maxIssues} issues</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Spike threshold (%)</Label>
              {editing ? (
                <Input
                  type="number"
                  value={draft.spikePercent}
                  onChange={e => setDraft(d => ({ ...d, spikePercent: Number(e.target.value) }))}
                />
              ) : (
                <p className="text-sm font-medium py-2">{thresholds.spikePercent}% increase</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Max quantity per week</Label>
              {editing ? (
                <Input
                  type="number"
                  value={draft.maxQuantity}
                  onChange={e => setDraft(d => ({ ...d, maxQuantity: Number(e.target.value) }))}
                />
              ) : (
                <p className="text-sm font-medium py-2">{thresholds.maxQuantity} units</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
