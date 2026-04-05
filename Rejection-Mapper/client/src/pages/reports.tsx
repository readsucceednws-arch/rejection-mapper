import { useState } from "react";
import { useUser } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, Download, Calendar, TrendingUp, TrendingDown,
  Minus, Package, MapPin, AlertTriangle, BarChart3, RefreshCw
} from "lucide-react";

function TrendBadge({ trend }: { trend: string }) {
  if (trend === "increasing") return (
    <Badge variant="destructive" className="gap-1">
      <TrendingUp className="h-3 w-3" /> Increasing
    </Badge>
  );
  if (trend === "decreasing") return (
    <Badge className="gap-1 bg-green-100 text-green-800 border-green-200">
      <TrendingDown className="h-3 w-3" /> Decreasing
    </Badge>
  );
  return (
    <Badge variant="secondary" className="gap-1">
      <Minus className="h-3 w-3" /> Stable
    </Badge>
  );
}

export default function ReportsPage() {
  const { data: user } = useUser();
  const { toast } = useToast();
  const [downloading, setDownloading] = useState<string | null>(null);

  const orgId = user?.organizationId;

  const { data: weekly, isLoading: weeklyLoading, refetch: refetchWeekly } = useQuery({
    queryKey: ["/api/reporting/weekly", orgId],
    queryFn: async () => {
      const res = await fetch(`/api/reporting/weekly/${orgId}`);
      if (!res.ok) throw new Error("Failed to fetch weekly report");
      return res.json();
    },
    enabled: !!orgId,
  });

  const { data: monthly, isLoading: monthlyLoading, refetch: refetchMonthly } = useQuery({
    queryKey: ["/api/reporting/monthly", orgId],
    queryFn: async () => {
      const res = await fetch(`/api/reporting/monthly/${orgId}`);
      if (!res.ok) throw new Error("Failed to fetch monthly report");
      return res.json();
    },
    enabled: !!orgId,
  });

  async function downloadCSV(type: "weekly" | "monthly") {
    setDownloading(type);
    try {
      const res = await fetch(`/api/reporting/${type}/${orgId}/csv`);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${type}-report-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Downloaded!", description: `${type} report CSV saved.` });
    } catch {
      toast({ title: "Download failed", variant: "destructive" });
    } finally {
      setDownloading(null);
    }
  }

  function SummaryCard({ data, type, loading }: { data: any; type: "weekly" | "monthly"; loading: boolean }) {
    if (loading) return (
      <Card className="animate-pulse">
        <CardHeader><div className="h-5 bg-muted rounded w-1/2" /></CardHeader>
        <CardContent><div className="h-20 bg-muted rounded" /></CardContent>
      </Card>
    );

    if (!data) return null;

    const { summary, trends, topCategories, topItems, topIssueTypes, insights } = data;
    const trendKey = type === "weekly" ? "last7Days" : "last30Days";
    const trend = trends?.[trendKey];

    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              {type === "weekly" ? "Weekly Report" : "Monthly Report"}
            </CardTitle>
            <CardDescription>
              {data.metadata?.period} · Generated {new Date(data.metadata?.generatedAt).toLocaleString()}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => type === "weekly" ? refetchWeekly() : refetchMonthly()}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              onClick={() => downloadCSV(type)}
              disabled={downloading === type}
            >
              <Download className="h-4 w-4 mr-1" />
              {downloading === type ? "Downloading..." : "Export CSV"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Total Issues</p>
              <p className="text-2xl font-bold">{summary?.totalIssues ?? 0}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Total Quantity</p>
              <p className="text-2xl font-bold">{summary?.totalQuantity ?? 0}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Trend</p>
              {trend ? <TrendBadge trend={trend.trend} /> : <span className="text-muted-foreground text-sm">No data</span>}
              {trend && (
                <p className="text-xs text-muted-foreground mt-1">
                  {trend.changePercent?.count > 0 ? "+" : ""}{trend.changePercent?.count?.toFixed(1)}% vs previous
                </p>
              )}
            </div>
          </div>

          {/* Top Issue Types */}
          {topIssueTypes?.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" /> Top Issue Types
              </h3>
              <div className="space-y-2">
                {topIssueTypes.slice(0, 5).map((item: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{item.name || "Unknown"}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-24 bg-muted rounded-full h-2">
                        <div
                          className="bg-primary h-2 rounded-full"
                          style={{ width: `${Math.min(item.percentage, 100)}%` }}
                        />
                      </div>
                      <span className="font-medium w-12 text-right">{item.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Zones */}
          {topCategories?.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-blue-500" /> Top Zones
              </h3>
              <div className="space-y-2">
                {topCategories.slice(0, 5).map((cat: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{cat.name || "Unknown"}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-24 bg-muted rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full"
                          style={{ width: `${Math.min(cat.percentage, 100)}%` }}
                        />
                      </div>
                      <span className="font-medium w-12 text-right">{cat.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Parts */}
          {topItems?.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Package className="h-4 w-4 text-green-500" /> Top Parts
              </h3>
              <div className="space-y-2">
                {topItems.slice(0, 5).map((item: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{item.name || "Unknown"}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-24 bg-muted rounded-full h-2">
                        <div
                          className="bg-green-500 h-2 rounded-full"
                          style={{ width: `${Math.min(item.percentage, 100)}%` }}
                        />
                      </div>
                      <span className="font-medium w-12 text-right">{item.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Insights */}
          {insights?.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-purple-500" /> Key Insights
              </h3>
              <div className="space-y-2">
                {insights.slice(0, 3).map((insight: any, i: number) => (
                  <div key={i} className="bg-muted/50 rounded-lg p-3 text-sm">
                    <p className="font-medium">{insight.title}</p>
                    <p className="text-muted-foreground">{insight.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-muted-foreground">Weekly and monthly quality reports with CSV export</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="h-4 w-4" />
          {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SummaryCard data={weekly} type="weekly" loading={weeklyLoading} />
        <SummaryCard data={monthly} type="monthly" loading={monthlyLoading} />
      </div>
    </div>
  );
}
