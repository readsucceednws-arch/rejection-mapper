import { useState } from "react";
import { 
  useAnalyticsOverview, 
  useFieldLabels,
  useAnalyticsInsights,
  AnalyticsFilters 
} from "@/hooks/use-analytics";
import { exportWeeklyReportCSV, exportMonthlyReportCSV } from "@/hooks/use-reports";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  PieChart,
  Pie,
  Cell,
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
  ArrowUp,
  ArrowDown,
  Download,
  Calendar,
  FileText,
} from "lucide-react";

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

export default function AnalyticsDashboard() {
  const [filters, setFilters] = useState<AnalyticsFilters>({});
  const { data: analytics, isLoading, error } = useAnalyticsOverview(filters);
  const { data: fieldLabels } = useFieldLabels();
  const { data: insights } = useAnalyticsInsights(filters);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="space-y-2">
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-8 bg-gray-200 rounded w-1/2"></div>
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
          <div className="flex items-center space-x-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            <span>Failed to load analytics data</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const labels = fieldLabels || {
    zone: 'Zone',
    partNumber: 'Part Number',
    type: 'Issue Type',
    quantity: 'Quantity'
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'increasing':
        return <TrendingUp className="h-4 w-4 text-red-500" />;
      case 'decreasing':
        return <TrendingDown className="h-4 w-4 text-green-500" />;
      default:
        return <Minus className="h-4 w-4 text-gray-500" />;
    }
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'increasing':
        return 'text-red-600';
      case 'decreasing':
        return 'text-green-600';
      default:
        return 'text-gray-600';
    }
  };

  const getChangeIcon = (change?: number) => {
    if (!change) return <Minus className="h-3 w-3" />;
    if (change > 0) return <ArrowUp className="h-3 w-3 text-red-500" />;
    return <ArrowDown className="h-3 w-3 text-green-500" />;
  };

  // Prepare chart data
  const categoryChartData = analytics.topCategories.slice(0, 5).map(cat => ({
    name: cat.name,
    issues: cat.count,
    percentage: cat.percentage
  }));

  const issueTypeChartData = analytics.topIssueTypes.slice(0, 5).map(type => ({
    name: type.name,
    count: type.count,
    percentage: type.percentage
  }));

  const itemChartData = analytics.topItems.slice(0, 5).map(item => ({
    name: item.name,
    issues: item.count,
    percentage: item.percentage
  }));

  return (
    <div className="space-y-6">
      
      {/* Header with Export */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
          <p className="text-muted-foreground">
            Track and analyze your quality metrics
          </p>
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" onClick={() => exportWeeklyReportCSV()}>
            <Download className="h-4 w-4 mr-2" />
            Weekly Report
          </Button>
          <Button variant="outline" onClick={() => exportMonthlyReportCSV()}>
            <FileText className="h-4 w-4 mr-2" />
            Monthly Report
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Issues</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.overview.totalIssues.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {analytics.overview.totalQuantity.toLocaleString()} total {labels.quantity.toLowerCase()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Issue Type</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.topIssueTypes[0]?.name || 'N/A'}</div>
            <p className="text-xs text-muted-foreground">
              {analytics.topIssueTypes[0]?.count || 0} occurrences 
              ({analytics.topIssueTypes[0]?.percentage.toFixed(1) || 0}%)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Most Affected {labels.zone}</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.topCategories[0]?.name || 'N/A'}</div>
            <p className="text-xs text-muted-foreground">
              {analytics.topCategories[0]?.count || 0} issues 
              ({analytics.topCategories[0]?.percentage.toFixed(1) || 0}%)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">7-Day Trend</CardTitle>
            {getTrendIcon(analytics.trends.last7Days.trend)}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.trends.last7Days.current.count}</div>
            <p className={`text-xs flex items-center space-x-1 ${getTrendColor(analytics.trends.last7Days.trend)}`}>
              {getChangeIcon(analytics.trends.last7Days.changePercent.count)}
              <span>
                {analytics.trends.last7Days.changePercent.count ? 
                  `${analytics.trends.last7Days.changePercent.count.toFixed(1)}%` : 
                  'No change'
                }
              </span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Trend Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Calendar className="h-5 w-5" />
              <span>Daily Issue Trend</span>
            </CardTitle>
            <CardDescription>Last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={analytics.dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip 
                  labelFormatter={(value) => new Date(value).toLocaleDateString()}
                  formatter={(value: any) => [value, 'Issues']}
                />
                <Line 
                  type="monotone" 
                  dataKey="count" 
                  stroke="#8884d8" 
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Categories Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Top {labels.zone}s</CardTitle>
            <CardDescription>Issues by {labels.zone.toLowerCase()}</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={categoryChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value: any) => [value, 'Issues']} />
                <Bar dataKey="issues" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Issue Types Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Top {labels.type}s</CardTitle>
            <CardDescription>Most frequent issue types</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={issueTypeChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value: any) => [value, 'Issues']} />
                <Bar dataKey="count" fill="#00C49F" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Items Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Top {labels.partNumber}s</CardTitle>
            <CardDescription>Most affected {labels.partNumber.toLowerCase()}s</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={itemChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value: any) => [value, 'Issues']} />
                <Bar dataKey="issues" fill="#FFBB28" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Key Insights */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Lightbulb className="h-5 w-5" />
            <span>Key Insights</span>
          </CardTitle>
          <CardDescription>Top rejection reasons, rework types, and trends based on your data</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {(insights || []).map((insight, index) => {
              const isRejection = insight.title === 'Top Rejection Reason';
              const isRework = insight.title === 'Top Rework Type';
              const isTrend = insight.type === 'trend_change';
              const borderColor = isRejection
                ? 'border-l-red-500'
                : isRework
                ? 'border-l-blue-500'
                : isTrend
                ? (insight.change === '↑' ? 'border-l-orange-500' : 'border-l-green-500')
                : 'border-l-yellow-500';
              const icon = isRejection
                ? <AlertTriangle className="h-4 w-4 text-red-500" />
                : isRework
                ? <Target className="h-4 w-4 text-blue-500" />
                : isTrend
                ? (insight.change === '↑' ? <TrendingUp className="h-4 w-4 text-orange-500" /> : <TrendingDown className="h-4 w-4 text-green-500" />)
                : <MapPin className="h-4 w-4 text-yellow-500" />;
              return (
                <Card key={index} className={`border-l-4 ${borderColor}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      {icon}
                      {insight.title}
                    </CardTitle>
                    <CardDescription className="text-xs">{insight.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-bold truncate" title={insight.value}>
                          {insight.value}
                        </span>
                        {insight.change && (
                          <span className={`text-sm font-bold ${getTrendColor(
                            insight.change === '↑' ? 'increasing' : 'decreasing'
                          )}`}>
                            {insight.change}
                          </span>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {(insight.confidence * 100).toFixed(0)}% confidence
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {(!insights || insights.length === 0) && (
              <div className="col-span-4 text-center py-8 text-muted-foreground text-sm">
                No insights available yet. Add more entries to see patterns.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
