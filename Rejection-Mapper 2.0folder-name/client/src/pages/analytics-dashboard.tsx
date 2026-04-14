import { useState, useMemo } from "react";
import { 
  useAnalyticsOverview, 
  useFieldLabels,
  useAnalyticsInsights,
  AnalyticsFilters 
} from "@/hooks/use-analytics";
import { useRejectionEntries } from "@/hooks/use-rejection-entries";
import { useReworkEntries } from "@/hooks/use-rework-entries";
import { exportWeeklyReportCSV, exportMonthlyReportCSV } from "@/hooks/use-reports";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import TemplateSelectorFunctional from "@/components/template-selector-functional";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Target,
  MapPin,
  Package,
  Lightbulb,
  Download,
  Calendar,
  FileText,
  BarChart2,
  Activity,
} from "lucide-react";

const ZONE_COLORS  = ["#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe", "#ede9fe"];
const TYPE_COLORS  = ["#10b981", "#34d399", "#6ee7b7", "#a7f3d0", "#d1fae5", "#ecfdf5"];
const PART_COLORS  = ["#f59e0b", "#fbbf24", "#fcd34d", "#fde68a", "#fef3c7", "#fffbeb"];

function AngledTick({ x, y, payload, maxLen = 22 }: any) {
  const label: string = payload?.value ?? "";
  const display = label.length > maxLen ? label.slice(0, maxLen) + "…" : label;
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={8} textAnchor="end"
        fill="hsl(var(--muted-foreground))" fontSize={10} transform="rotate(-38)">
        {display}
      </text>
    </g>
  );
}

function BarTooltipContent({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-foreground mb-1 max-w-[200px] break-words">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.fill ?? p.color }}>
          {p.name}: <span className="font-bold">{Number(p.value)?.toLocaleString()}</span>
          {p.payload?.percentage != null && (
            <span className="text-muted-foreground ml-1">({Number(p.payload.percentage).toFixed(1)}%)</span>
          )}
        </p>
      ))}
    </div>
  );
}

export default function AnalyticsDashboard() {
  const [filters] = useState<AnalyticsFilters>({});
  const { data: analytics, isLoading, error } = useAnalyticsOverview(filters);
  const { data: fieldLabels } = useFieldLabels();
  const { data: insights } = useAnalyticsInsights(filters);
  const { data: rejectionEntries } = useRejectionEntries();
  const { data: reworkEntries } = useReworkEntries();

  // Compute actual top rejection reasons from raw entries
  const topRejectionReasons = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of rejectionEntries ?? []) {
      const reason = e.rejectionType?.reason
        ?? (e as any).rejectionReason
        ?? e.rejectionType?.rejectionCode
        ?? (e as any).rejectionReasonCode
        ?? "Unknown";
      map.set(reason, (map.get(reason) ?? 0) + e.quantity);
    }
    const total = Array.from(map.values()).reduce((s, v) => s + v, 0) || 1;
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, qty]) => ({ name, count: qty, percentage: (qty / total) * 100 }));
  }, [rejectionEntries]);

  // Compute actual top rework types from raw entries
  const topReworkTypes = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of reworkEntries ?? []) {
      const reason = (e as any).reworkType?.reason
        ?? (e as any).reworkType?.name
        ?? (e as any).reworkType?.reworkCode
        ?? "Unknown";
      map.set(reason, (map.get(reason) ?? 0) + e.quantity);
    }
    const total = Array.from(map.values()).reduce((s, v) => s + v, 0) || 1;
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, qty]) => ({ name, count: qty, percentage: (qty / total) * 100 }));
  }, [reworkEntries]);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="space-y-2">
                <div className="h-4 bg-muted rounded w-3/4"></div>
                <div className="h-8 bg-muted rounded w-1/2"></div>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center space-x-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <span>Failed to load analytics data</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const labels = fieldLabels || { zone: "Zone", partNumber: "Part Number", type: "Issue Type", quantity: "Quantity" };

  const getTrendIcon = (trend: string) => {
    if (trend === "increasing") return <TrendingUp className="h-4 w-4 text-destructive" />;
    if (trend === "decreasing") return <TrendingDown className="h-4 w-4 text-green-500" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  const getTrendColor = (trend: string) => {
    if (trend === "increasing") return "text-destructive";
    if (trend === "decreasing") return "text-green-600";
    return "text-muted-foreground";
  };

  const categoryChartData = analytics.topCategories.slice(0, 6).map((cat, i) => ({
    name: cat.name, issues: cat.count, percentage: cat.percentage, fill: ZONE_COLORS[i % ZONE_COLORS.length],
  }));
  const issueTypeChartData = analytics.topIssueTypes.slice(0, 6).map((t, i) => ({
    name: t.name, count: t.count, percentage: t.percentage, fill: TYPE_COLORS[i % TYPE_COLORS.length],
  }));
  const itemChartData = analytics.topItems.slice(0, 6).map((item, i) => ({
    name: item.name, issues: item.count, percentage: item.percentage, fill: PART_COLORS[i % PART_COLORS.length],
  }));

  const dailyData = analytics.dailyTrend.map((d: any, i: number, arr: any[]) => {
    const window = arr.slice(Math.max(0, i - 6), i + 1);
    const avg = Math.round(window.reduce((s: number, x: any) => s + (x.count ?? 0), 0) / window.length);
    return { ...d, movingAvg: avg };
  });
  const avgCount = dailyData.length
    ? Math.round(dailyData.reduce((s: number, d: any) => s + (d.count ?? 0), 0) / dailyData.length)
    : 0;

  return (
    <div className="space-y-6">
      <TemplateSelectorFunctional />

      {/* Header */}
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Analytics Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track and analyse your quality metrics</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportWeeklyReportCSV()}>
            <Download className="h-4 w-4 mr-1.5" />Weekly CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportMonthlyReportCSV()}>
            <FileText className="h-4 w-4 mr-1.5" />Monthly CSV
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-indigo-500 bg-gradient-to-br from-indigo-50/50 to-transparent dark:from-indigo-950/20">
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Issues</CardTitle>
            <BarChart2 className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-3xl font-bold">{analytics.overview.totalIssues.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">{analytics.overview.totalQuantity.toLocaleString()} total {labels.quantity.toLowerCase()}</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-destructive bg-gradient-to-br from-red-50/50 to-transparent dark:from-red-950/20">
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Top Issue Type</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-base font-bold truncate" title={analytics.topIssueTypes[0]?.name}>
              {analytics.topIssueTypes[0]?.name || "N/A"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {analytics.topIssueTypes[0]?.count || 0} occurrences ({(analytics.topIssueTypes[0]?.percentage ?? 0).toFixed(1)}%)
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500 bg-gradient-to-br from-amber-50/50 to-transparent dark:from-amber-950/20">
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Most Affected {labels.zone}</CardTitle>
            <MapPin className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-base font-bold truncate" title={analytics.topCategories[0]?.name}>
              {analytics.topCategories[0]?.name || "N/A"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {analytics.topCategories[0]?.count || 0} issues ({(analytics.topCategories[0]?.percentage ?? 0).toFixed(1)}%)
            </p>
          </CardContent>
        </Card>

        <Card className={`border-l-4 ${analytics.trends.last7Days.trend === "increasing" ? "border-l-destructive" : "border-l-green-500"}`}>
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">7-Day Trend</CardTitle>
            {getTrendIcon(analytics.trends.last7Days.trend)}
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-3xl font-bold">{analytics.trends.last7Days.current.count}</div>
            <p className={`text-xs mt-1 ${getTrendColor(analytics.trends.last7Days.trend)}`}>
              {analytics.trends.last7Days.changePercent.count != null
                ? `${analytics.trends.last7Days.changePercent.count > 0 ? "+" : ""}${analytics.trends.last7Days.changePercent.count.toFixed(1)}% vs prev period`
                : "No change"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Daily Trend + Top Zones */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-indigo-500" />Daily Issue Trend
            </CardTitle>
            <CardDescription>Last 30 days with 7-day moving average</CardDescription>
          </CardHeader>
          <CardContent>
            {dailyData.length === 0 ? (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">No data</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={dailyData} margin={{ top: 10, right: 16, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false} tickLine={false}
                      tickFormatter={(v) => { const d = new Date(v); return `${d.getDate()} ${d.toLocaleString("default", { month: "short" })}`; }}
                      interval="preserveStartEnd"
                    />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                      labelFormatter={(v) => new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      formatter={(value: any, name: string) => [value, name === "count" ? "Issues" : "7-day avg"]}
                    />
                    <ReferenceLine y={avgCount} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 2" strokeOpacity={0.4}
                      label={{ value: `avg ${avgCount}`, position: "insideTopRight", fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                    />
                    <Line type="monotone" dataKey="count" name="count" stroke="#6366f1" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                    <Line type="monotone" dataKey="movingAvg" name="movingAvg" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 2" dot={false} activeDot={false} />
                  </LineChart>
                </ResponsiveContainer>
                <div className="flex items-center gap-4 mt-1 justify-center">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="inline-block w-5 h-0.5 bg-indigo-500 rounded" /> Daily count
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="inline-block w-5 h-0 border-t-2 border-dashed border-amber-500" /> 7-day avg
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4 text-indigo-500" />Top {labels.zone}s
            </CardTitle>
            <CardDescription>Issues by {labels.zone.toLowerCase()}</CardDescription>
          </CardHeader>
          <CardContent>
            {categoryChartData.length === 0 ? (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={categoryChartData} margin={{ top: 24, right: 16, left: -10, bottom: 80 }} barCategoryGap="28%">
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} height={90} interval={0} tick={<AngledTick maxLen={22} />} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <Tooltip content={<BarTooltipContent />} />
                  <Bar dataKey="issues" name="Issues" radius={[4, 4, 0, 0]}
                    label={(props: any) => {
                      const { x, y, width, value } = props;
                      if (!value) return null;
                      return <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={9} fill="hsl(var(--muted-foreground))">{value}</text>;
                    }}
                  >
                    {categoryChartData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Rejection Reasons + Top Rework Types */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-destructive" />Top Rejection Reasons
            </CardTitle>
            <CardDescription>Most frequent rejection causes by quantity</CardDescription>
          </CardHeader>
          <CardContent>
            {topRejectionReasons.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No rejection data</p>
            ) : (
              <div className="space-y-3 mt-1">
                {topRejectionReasons.map((row, i) => {
                  const pct = Math.round((row.count / (topRejectionReasons[0]?.count || 1)) * 100);
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="truncate text-foreground font-medium max-w-[65%]" title={row.name}>{row.name}</span>
                        <span className="font-bold tabular-nums text-destructive">{row.count.toLocaleString()} <span className="text-muted-foreground font-normal">({row.percentage.toFixed(1)}%)</span></span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-destructive" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4 text-blue-500" />Top Rework Types
            </CardTitle>
            <CardDescription>Most frequent rework causes by quantity</CardDescription>
          </CardHeader>
          <CardContent>
            {topReworkTypes.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No rework data</p>
            ) : (
              <div className="space-y-3 mt-1">
                {topReworkTypes.map((row, i) => {
                  const pct = Math.round((row.count / (topReworkTypes[0]?.count || 1)) * 100);
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="truncate text-foreground font-medium max-w-[65%]" title={row.name}>{row.name}</span>
                        <span className="font-bold tabular-nums text-blue-500">{row.count.toLocaleString()} <span className="text-muted-foreground font-normal">({row.percentage.toFixed(1)}%)</span></span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Part Numbers */}
      <Card className="shadow-sm border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="h-4 w-4 text-amber-500" />Top {labels.partNumber}s
          </CardTitle>
          <CardDescription>Most affected {labels.partNumber.toLowerCase()}s by issue count</CardDescription>
        </CardHeader>
        <CardContent>
          {itemChartData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No data</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 mt-1">
              {itemChartData.map((row, i) => {
                const pct = Math.round((row.issues / (itemChartData[0]?.issues || 1)) * 100);
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="truncate font-mono text-foreground font-medium max-w-[65%]" title={row.name}>{row.name}</span>
                      <span className="font-bold tabular-nums" style={{ color: row.fill }}>{row.issues.toLocaleString()} <span className="text-muted-foreground font-normal">({row.percentage.toFixed(1)}%)</span></span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: row.fill }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="shadow-sm border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Lightbulb className="h-4 w-4 text-amber-500" />Key Insights
          </CardTitle>
          <CardDescription>Top rejection reasons, rework types, and trends based on your data</CardDescription>
        </CardHeader>
        <CardContent>
          {(!insights || insights.length === 0) ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No insights available yet. Add more entries to see patterns.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {insights.map((insight, index) => {
                const isRejection = insight.title === "Top Rejection Reason";
                const isRework = insight.title === "Top Rework Type";
                const isTrend = insight.type === "trend_change";
                const isUp = insight.change === "↑";
                const borderColor = isRejection ? "border-l-destructive" : isRework ? "border-l-blue-500" : isTrend ? (isUp ? "border-l-orange-500" : "border-l-green-500") : "border-l-amber-500";
                const icon = isRejection
                  ? <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                  : isRework
                  ? <Target className="h-3.5 w-3.5 text-blue-500" />
                  : isTrend
                  ? (isUp ? <TrendingUp className="h-3.5 w-3.5 text-orange-500" /> : <TrendingDown className="h-3.5 w-3.5 text-green-500" />)
                  : <MapPin className="h-3.5 w-3.5 text-amber-500" />;
                return (
                  <Card key={index} className={`border-l-4 ${borderColor} shadow-none`}>
                    <CardHeader className="pb-1 pt-3 px-3">
                      <CardTitle className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide">
                        {icon}{insight.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-3 pb-3">
                      <div className="text-sm font-bold text-foreground break-words" title={insight.value}>
                        {insight.value}
                        {insight.change && (
                          <span className={`ml-1.5 ${isTrend && isUp ? "text-destructive" : "text-green-600"}`}>{insight.change}</span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{insight.description}</p>
                      <Badge variant="outline" className="text-[10px] mt-1.5 h-5 px-1.5">
                        {(insight.confidence * 100).toFixed(0)}% confidence
                      </Badge>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
