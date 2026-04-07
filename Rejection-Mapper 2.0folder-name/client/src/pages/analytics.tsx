import { useIssues } from "@/hooks/use-jira";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

const STATUS_COLORS: Record<string, string> = {
  backlog: "#B4B2A9",
  todo: "#378ADD",
  in_progress: "#EF9F27",
  in_review: "#7F77DD",
  done: "#639922",
  cancelled: "#E24B4A",
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#E24B4A",
  high: "#EF9F27",
  medium: "#378ADD",
  low: "#B4B2A9",
};

interface AnalyticsPageProps {
  projectId: number;
}

export default function AnalyticsPage({ projectId }: AnalyticsPageProps) {
  const { data: issues = [], isLoading } = useIssues(projectId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Loading analytics...
      </div>
    );
  }

  // Status breakdown
  const statusData = Object.entries(
    issues.reduce((acc, issue) => {
      acc[issue.status] = (acc[issue.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  ).map(([status, count]) => ({
    name: status.replace("_", " "),
    value: count,
    color: STATUS_COLORS[status] ?? "#B4B2A9",
  }));

  // Priority breakdown
  const priorityData = Object.entries(
    issues.reduce((acc, issue) => {
      acc[issue.priority] = (acc[issue.priority] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  ).map(([priority, count]) => ({
    name: priority,
    count,
    color: PRIORITY_COLORS[priority] ?? "#B4B2A9",
  }));

  // Type breakdown
  const typeData = Object.entries(
    issues.reduce((acc, issue) => {
      acc[issue.type] = (acc[issue.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  ).map(([type, count]) => ({ name: type, count }));

  const total = issues.length;
  const done = issues.filter((i) => i.status === "done").length;
  const inProgress = issues.filter((i) => i.status === "in_progress").length;
  const completion = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-background">
        <h1 className="text-sm font-medium">Analytics</h1>
      </div>

      <div className="p-5 space-y-5">
        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard label="Total issues" value={total} />
          <MetricCard label="Completed" value={done} />
          <MetricCard label="In progress" value={inProgress} />
          <MetricCard label="Completion" value={`${completion}%`} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Status pie chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Issues by status</CardTitle>
            </CardHeader>
            <CardContent>
              {statusData.length === 0 ? (
                <EmptyState />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      dataKey="value"
                      paddingAngle={2}
                    >
                      {statusData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => [`${v} issues`]} />
                    <Legend
                      formatter={(value) => (
                        <span className="text-xs capitalize">{value}</span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Priority bar chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Issues by priority</CardTitle>
            </CardHeader>
            <CardContent>
              {priorityData.length === 0 ? (
                <EmptyState />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={priorityData} barSize={32}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border-tertiary)" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v) => [`${v} issues`]} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {priorityData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Type breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Issues by type</CardTitle>
          </CardHeader>
          <CardContent>
            {typeData.length === 0 ? (
              <EmptyState />
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={typeData} barSize={40}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border-tertiary)" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v) => [`${v} issues`]} />
                  <Bar dataKey="count" fill="#378ADD" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-muted/40 rounded-lg p-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-2xl font-medium">{value}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
      No data yet
    </div>
  );
}
