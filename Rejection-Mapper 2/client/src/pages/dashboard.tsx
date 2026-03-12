import { useState, useMemo } from "react";
import { useReportSummary } from "@/hooks/use-reports";
import { usePartWiseAnalytics, useMonthWiseAnalytics, useCostAnalytics, useZoneWiseAnalytics } from "@/hooks/use-analytics";
import { useParts } from "@/hooks/use-parts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";
import {
  AlertCircle,
  Filter,
  PackageX,
  Settings,
  BarChart2,
  TrendingUp,
  LayoutDashboard,
  DollarSign,
  IndianRupee,
  MapPin,
} from "lucide-react";

const COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#06b6d4"];
const REJECTION_COLOR = "#ef4444";
const REWORK_COLOR = "#3b82f6";

interface Filters {
  startDate?: string;
  endDate?: string;
  type?: string;
}

function FilterBar({
  filters,
  onApply,
  showTypeFilter = true,
  extraChildren,
}: {
  filters: Filters;
  onApply: (f: Filters) => void;
  showTypeFilter?: boolean;
  extraChildren?: React.ReactNode;
}) {
  const [local, setLocal] = useState<Filters>(filters);

  const apply = () => onApply(local);
  const clear = () => {
    const cleared = {};
    setLocal(cleared);
    onApply(cleared);
  };

  return (
    <Card className="p-3 flex flex-wrap items-end gap-3 border-border/50 bg-card shadow-sm">
      <div className="grid gap-1">
        <Label className="text-xs text-muted-foreground">Start Date</Label>
        <Input
          type="date"
          className="h-8 text-xs w-[130px]"
          value={local.startDate || ""}
          onChange={(e) => setLocal((p) => ({ ...p, startDate: e.target.value || undefined }))}
        />
      </div>
      <div className="grid gap-1">
        <Label className="text-xs text-muted-foreground">End Date</Label>
        <Input
          type="date"
          className="h-8 text-xs w-[130px]"
          value={local.endDate || ""}
          onChange={(e) => setLocal((p) => ({ ...p, endDate: e.target.value || undefined }))}
        />
      </div>
      {showTypeFilter && (
        <div className="grid gap-1">
          <Label className="text-xs text-muted-foreground">Purpose</Label>
          <Select
            value={local.type || "all"}
            onValueChange={(v) => setLocal((p) => ({ ...p, type: v === "all" ? undefined : v }))}
          >
            <SelectTrigger className="h-8 text-xs w-[120px]">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="rejection">Rejection</SelectItem>
              <SelectItem value="rework">Rework</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      {extraChildren}
      <div className="flex gap-2">
        <Button size="sm" onClick={apply} className="h-8">
          <Filter className="w-3 h-3 mr-1" />
          Apply
        </Button>
        {(filters.startDate || filters.endDate || filters.type) && (
          <Button size="sm" variant="outline" onClick={clear} className="h-8 text-destructive border-destructive/20 hover:bg-destructive/10">
            Clear
          </Button>
        )}
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const [overviewFilters, setOverviewFilters] = useState<Filters>({});
  const [partFilters, setPartFilters] = useState<Filters>({});
  const [monthFilters, setMonthFilters] = useState<Filters>({});
  const [costFilters, setCostFilters] = useState<Filters>({});
  const [zoneFilters, setZoneFilters] = useState<{ startDate?: string; endDate?: string }>({});
  const [selectedPartNumbers, setSelectedPartNumbers] = useState<string[]>([]);
  const [selectedCostPart, setSelectedCostPart] = useState<string>("all");

  const { data: summary, isLoading: isLoadingSummary } = useReportSummary(overviewFilters);
  const { data: partData, isLoading: isLoadingParts } = usePartWiseAnalytics(partFilters);
  const { data: monthData, isLoading: isLoadingMonths } = useMonthWiseAnalytics(monthFilters);
  const { data: costData, isLoading: isLoadingCost } = useCostAnalytics(costFilters);
  const { data: zoneData, isLoading: isLoadingZone } = useZoneWiseAnalytics(zoneFilters);
  const { data: allParts } = useParts();

  const totalRejections = summary?.reduce((acc, curr) => acc + curr.totalQuantity, 0) || 0;
  const uniqueReasons = summary?.length || 0;

  const filteredPartData = useMemo(() => {
    if (!partData) return [];
    if (selectedPartNumbers.length === 0) return partData;
    return partData.filter((p) => selectedPartNumbers.includes(p.partNumber));
  }, [partData, selectedPartNumbers]);

  const filteredCostTableData = useMemo(() => {
    if (!costData) return [];
    if (selectedCostPart === "all") return costData;
    return costData.filter((r) => r.partNumber === selectedCostPart);
  }, [costData, selectedCostPart]);

  const totalRejectionCost = filteredCostTableData.reduce((s, r) => s + r.rejectionCost, 0);
  const totalReworkCost = filteredCostTableData.reduce((s, r) => s + r.reworkCost, 0);
  const grandTotalCost = totalRejectionCost + totalReworkCost;

  const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1 text-sm">Overview and analytics of manufacturing rejections & reworks</p>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="mb-4 flex-wrap h-auto gap-1">
          <TabsTrigger value="overview" className="gap-1.5">
            <LayoutDashboard className="w-4 h-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="parts" className="gap-1.5">
            <BarChart2 className="w-4 h-4" />
            Part Analysis
          </TabsTrigger>
          <TabsTrigger value="monthly" className="gap-1.5">
            <TrendingUp className="w-4 h-4" />
            Monthly Trends
          </TabsTrigger>
          <TabsTrigger value="cost" className="gap-1.5">
            <IndianRupee className="w-4 h-4" />
            Cost Analysis
          </TabsTrigger>
          <TabsTrigger value="zone" className="gap-1.5">
            <MapPin className="w-4 h-4" />
            Zone Analysis
          </TabsTrigger>
        </TabsList>

        {/* ── TAB 1: OVERVIEW ── */}
        <TabsContent value="overview" className="space-y-6">
          <FilterBar filters={overviewFilters} onApply={setOverviewFilters} showTypeFilter={false} />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="hover-elevate border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Quantity</CardTitle>
                <PackageX className="w-4 h-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-display font-bold text-foreground">
                  {isLoadingSummary ? "..." : totalRejections.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Units rejected/reworked in period</p>
              </CardContent>
            </Card>

            <Card className="hover-elevate border-border/50 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Top Reason</CardTitle>
                <AlertCircle className="w-4 h-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-display font-bold text-foreground truncate">
                  {isLoadingSummary ? "..." : (summary?.[0]?.reason || "N/A")}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Highest frequency reason</p>
              </CardContent>
            </Card>

            <Card className="hover-elevate border-border/50 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Unique Reasons</CardTitle>
                <Settings className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-display font-bold text-foreground">
                  {isLoadingSummary ? "..." : uniqueReasons}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Categories logged in period</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="shadow-sm border-border/50 hover-elevate">
              <CardHeader>
                <CardTitle>By Reason</CardTitle>
                <CardDescription>Quantity categorized by reason code</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full">
                  {isLoadingSummary ? (
                    <div className="h-full flex items-center justify-center text-muted-foreground">Loading chart...</div>
                  ) : summary && summary.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={summary} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="reason" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} angle={-40} textAnchor="end" height={60} />
                        <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                        <Tooltip cursor={{ fill: "hsl(var(--muted)/0.5)" }} contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))" }} />
                        <Bar dataKey="totalQuantity" name="Quantity" radius={[4, 4, 0, 0]}>
                          {summary.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground">No data available</div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-border/50 hover-elevate">
              <CardHeader>
                <CardTitle>Distribution</CardTitle>
                <CardDescription>Proportional breakdown of rejection/rework reasons</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full">
                  {isLoadingSummary ? (
                    <div className="h-full flex items-center justify-center text-muted-foreground">Loading chart...</div>
                  ) : summary && summary.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={summary} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="totalQuantity" nameKey="reason">
                          {summary.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))" }} formatter={(value, name, props) => [value, props.payload.reason]} />
                        <Legend formatter={(value, entry: any) => <span className="text-xs">{entry.payload.reason?.substring(0, 20)}</span>} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground">No data available</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── TAB 2: PART ANALYSIS ── */}
        <TabsContent value="parts" className="space-y-6">
          <FilterBar
            filters={partFilters}
            onApply={(f) => { setPartFilters(f); setSelectedPartNumbers([]); }}
            showTypeFilter={true}
            extraChildren={
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground">Filter by Part</Label>
                <Select
                  value={selectedPartNumbers[0] || "all"}
                  onValueChange={(v) => setSelectedPartNumbers(v === "all" ? [] : [v])}
                >
                  <SelectTrigger className="h-8 text-xs w-[160px]">
                    <SelectValue placeholder="All Parts" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Parts</SelectItem>
                    {allParts?.map((p) => (
                      <SelectItem key={p.id} value={p.partNumber}>
                        {p.partNumber}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            }
          />

          <Card className="shadow-sm border-border/50">
            <CardHeader>
              <CardTitle>Quantity by Part Number</CardTitle>
              <CardDescription>Stacked bar — rejections (red) and reworks (blue) per part</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[420px] w-full">
                {isLoadingParts ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground">Loading chart...</div>
                ) : filteredPartData && filteredPartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={filteredPartData} margin={{ top: 10, right: 20, left: -10, bottom: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="partNumber" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} angle={-40} textAnchor="end" height={70} />
                      <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                      <Tooltip
                        cursor={{ fill: "hsl(var(--muted)/0.4)" }}
                        contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))" }}
                        formatter={(value, name) => [value, name === "rejections" ? "Rejections" : "Reworks"]}
                        labelFormatter={(label) => {
                          const part = filteredPartData.find((p) => p.partNumber === label);
                          return `${label}${part?.description ? ` — ${part.description}` : ""}`;
                        }}
                      />
                      <Legend formatter={(value) => <span className="text-xs capitalize">{value === "rejections" ? "Rejections" : "Reworks"}</span>} />
                      <Bar dataKey="rejections" name="rejections" stackId="a" fill={REJECTION_COLOR} />
                      <Bar dataKey="reworks" name="reworks" stackId="a" fill={REWORK_COLOR} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">No data available for selected filters</div>
                )}
              </div>
            </CardContent>
          </Card>

          {filteredPartData && filteredPartData.length > 0 && (
            <Card className="shadow-sm border-border/50">
              <CardHeader><CardTitle>Part Summary Table</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Part Number</th>
                        <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Description</th>
                        <th className="text-right py-2 pr-4 font-medium text-destructive">Rejections</th>
                        <th className="text-right py-2 pr-4 font-medium text-blue-500">Reworks</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPartData.map((row, i) => (
                        <tr key={i} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                          <td className="py-2 pr-4 font-medium">{row.partNumber}</td>
                          <td className="py-2 pr-4 text-muted-foreground">{row.description || "—"}</td>
                          <td className="py-2 pr-4 text-right text-destructive font-medium">{row.rejections}</td>
                          <td className="py-2 pr-4 text-right text-blue-500 font-medium">{row.reworks}</td>
                          <td className="py-2 text-right font-bold">{row.totalQuantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── TAB 3: MONTHLY TRENDS ── */}
        <TabsContent value="monthly" className="space-y-6">
          <FilterBar filters={monthFilters} onApply={setMonthFilters} showTypeFilter={true} />

          <Card className="shadow-sm border-border/50">
            <CardHeader>
              <CardTitle>Monthly Trends</CardTitle>
              <CardDescription>Quantity of rejections and reworks recorded per month over time</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[420px] w-full">
                {isLoadingMonths ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground">Loading chart...</div>
                ) : monthData && monthData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={monthData} margin={{ top: 10, right: 20, left: -10, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))" }} />
                      <Legend formatter={(value) => <span className="text-xs">{value === "rejections" ? "Rejections" : value === "reworks" ? "Reworks" : "Total"}</span>} />
                      <Line type="monotone" dataKey="totalQuantity" name="Total" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4, fill: "#8b5cf6" }} activeDot={{ r: 6 }} />
                      <Line type="monotone" dataKey="rejections" name="rejections" stroke={REJECTION_COLOR} strokeWidth={2} strokeDasharray="4 2" dot={{ r: 3, fill: REJECTION_COLOR }} activeDot={{ r: 5 }} />
                      <Line type="monotone" dataKey="reworks" name="reworks" stroke={REWORK_COLOR} strokeWidth={2} strokeDasharray="4 2" dot={{ r: 3, fill: REWORK_COLOR }} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">No data available for selected filters</div>
                )}
              </div>
            </CardContent>
          </Card>

          {monthData && monthData.length > 0 && (
            <Card className="shadow-sm border-border/50">
              <CardHeader><CardTitle>Monthly Summary Table</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Month</th>
                        <th className="text-right py-2 pr-4 font-medium text-destructive">Rejections</th>
                        <th className="text-right py-2 pr-4 font-medium text-blue-500">Reworks</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...monthData].reverse().map((row, i) => (
                        <tr key={i} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                          <td className="py-2 pr-4 font-medium">{row.month}</td>
                          <td className="py-2 pr-4 text-right text-destructive font-medium">{row.rejections}</td>
                          <td className="py-2 pr-4 text-right text-blue-500 font-medium">{row.reworks}</td>
                          <td className="py-2 text-right font-bold">{row.totalQuantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── TAB 4: COST ANALYSIS ── */}
        <TabsContent value="cost" className="space-y-6">
          <FilterBar filters={costFilters} onApply={setCostFilters} showTypeFilter={false} />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="hover-elevate border-destructive/20 bg-gradient-to-br from-destructive/5 to-transparent">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Rejection Cost</CardTitle>
                <IndianRupee className="w-4 h-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-display font-bold text-destructive">
                  {isLoadingCost ? "..." : fmt(totalRejectionCost)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Total cost of rejected parts</p>
              </CardContent>
            </Card>

            <Card className="hover-elevate border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-transparent">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Rework Cost</CardTitle>
                <IndianRupee className="w-4 h-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-display font-bold text-blue-500">
                  {isLoadingCost ? "..." : fmt(totalReworkCost)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Total cost of reworked parts</p>
              </CardContent>
            </Card>

            <Card className="hover-elevate border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Cost</CardTitle>
                <IndianRupee className="w-4 h-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-display font-bold text-foreground">
                  {isLoadingCost ? "..." : fmt(grandTotalCost)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Combined rejection + rework cost</p>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-sm border-border/50">
            <CardHeader>
              <CardTitle>Cost by Part</CardTitle>
              <CardDescription>Stacked bars showing rejection cost (red) vs rework cost (blue) per part</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[420px] w-full">
                {isLoadingCost ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground">Loading chart...</div>
                ) : costData && costData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={costData} margin={{ top: 10, right: 20, left: 10, bottom: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="partNumber" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} angle={-40} textAnchor="end" height={70} />
                      <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${v.toLocaleString("en-IN")}`} />
                      <Tooltip
                        cursor={{ fill: "hsl(var(--muted)/0.4)" }}
                        contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))" }}
                        formatter={(value: number, name) => [fmt(value), name === "rejectionCost" ? "Rejection Cost" : "Rework Cost"]}
                        labelFormatter={(label) => {
                          const part = costData.find((p) => p.partNumber === label);
                          return `${label}${part?.description ? ` — ${part.description}` : ""} (₹${part?.price}/unit)`;
                        }}
                      />
                      <Legend formatter={(value) => <span className="text-xs">{value === "rejectionCost" ? "Rejection Cost" : "Rework Cost"}</span>} />
                      <Bar dataKey="rejectionCost" name="rejectionCost" stackId="a" fill={REJECTION_COLOR} />
                      <Bar dataKey="reworkCost" name="reworkCost" stackId="a" fill={REWORK_COLOR} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">No cost data — make sure parts have a price set in Manage Parts</div>
                )}
              </div>
            </CardContent>
          </Card>

          {costData && costData.length > 0 && (
            <Card className="shadow-sm border-border/50">
              <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-3">
                <CardTitle>Cost Breakdown Table</CardTitle>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Filter by Part</Label>
                  <Select value={selectedCostPart} onValueChange={setSelectedCostPart}>
                    <SelectTrigger className="h-8 text-xs w-[180px]">
                      <SelectValue placeholder="All Parts" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Parts</SelectItem>
                      {(allParts ?? []).map((p) => (
                        <SelectItem key={p.partNumber} value={p.partNumber}>
                          {p.partNumber}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Part</th>
                        <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Description</th>
                        <th className="text-right py-2 pr-4 font-medium text-muted-foreground">Price/Unit</th>
                        <th className="text-right py-2 pr-4 font-medium text-destructive">Rej Qty</th>
                        <th className="text-right py-2 pr-4 font-medium text-destructive">Rej Cost</th>
                        <th className="text-right py-2 pr-4 font-medium text-blue-500">Rework Qty</th>
                        <th className="text-right py-2 pr-4 font-medium text-blue-500">Rework Cost</th>
                        <th className="text-right py-2 font-bold">Total Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCostTableData.length > 0 ? filteredCostTableData.map((row, i) => (
                        <tr key={i} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                          <td className="py-2 pr-4 font-medium">{row.partNumber}</td>
                          <td className="py-2 pr-4 text-muted-foreground">{row.description || "—"}</td>
                          <td className="py-2 pr-4 text-right text-muted-foreground">{fmt(row.price)}</td>
                          <td className="py-2 pr-4 text-right text-destructive">{row.rejectionQty}</td>
                          <td className="py-2 pr-4 text-right text-destructive font-medium">{fmt(row.rejectionCost)}</td>
                          <td className="py-2 pr-4 text-right text-blue-500">{row.reworkQty}</td>
                          <td className="py-2 pr-4 text-right text-blue-500 font-medium">{fmt(row.reworkCost)}</td>
                          <td className="py-2 text-right font-bold">{fmt(row.totalCost)}</td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-muted-foreground">No data for selected part</td>
                        </tr>
                      )}
                      <tr className="border-t-2 border-border bg-muted/20">
                        <td colSpan={4} className="py-2 pr-4 font-bold">Total</td>
                        <td className="py-2 pr-4 text-right text-destructive font-bold">{fmt(totalRejectionCost)}</td>
                        <td className="py-2 pr-4"></td>
                        <td className="py-2 pr-4 text-right text-blue-500 font-bold">{fmt(totalReworkCost)}</td>
                        <td className="py-2 text-right font-bold text-primary">{fmt(grandTotalCost)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── TAB 5: ZONE ANALYSIS ── */}
        <TabsContent value="zone" className="space-y-6">
          <FilterBar filters={zoneFilters} onApply={setZoneFilters} showTypeFilter={false} />

          <Card className="shadow-sm border-border/50">
            <CardHeader>
              <CardTitle>Quantity by Zone</CardTitle>
              <CardDescription>Total rejections and reworks grouped by zone</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[380px] w-full">
                {isLoadingZone ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground">Loading chart...</div>
                ) : zoneData && zoneData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={zoneData} margin={{ top: 10, right: 20, left: -10, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="zone" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} angle={-30} textAnchor="end" height={55} />
                      <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                      <Tooltip
                        cursor={{ fill: "hsl(var(--muted)/0.4)" }}
                        contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))" }}
                        formatter={(value, name) => [value, name === "rejections" ? "Rejections" : "Reworks"]}
                      />
                      <Legend formatter={(value) => <span className="text-xs capitalize">{value === "rejections" ? "Rejections" : "Reworks"}</span>} />
                      <Bar dataKey="rejections" name="rejections" stackId="a" fill={REJECTION_COLOR} />
                      <Bar dataKey="reworks" name="reworks" stackId="a" fill={REWORK_COLOR} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">No data available for selected filters</div>
                )}
              </div>
            </CardContent>
          </Card>

          {zoneData && zoneData.length > 0 && (
            <Card className="shadow-sm border-border/50">
              <CardHeader><CardTitle>Zone Summary Table</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Zone</th>
                        <th className="text-right py-2 pr-4 font-medium text-destructive">Rejections</th>
                        <th className="text-right py-2 pr-4 font-medium text-blue-500">Reworks</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {zoneData.map((row, i) => (
                        <tr key={i} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                          <td className="py-2 pr-4 font-medium">{row.zone}</td>
                          <td className="py-2 pr-4 text-right text-destructive font-medium">{row.rejections}</td>
                          <td className="py-2 pr-4 text-right text-blue-500 font-medium">{row.reworks}</td>
                          <td className="py-2 text-right font-bold">{row.totalQuantity}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border/50 bg-muted/20">
                        <td className="py-2 pr-4 font-bold">Total</td>
                        <td className="py-2 pr-4 text-right text-destructive font-bold">{zoneData.reduce((s, r) => s + r.rejections, 0)}</td>
                        <td className="py-2 pr-4 text-right text-blue-500 font-bold">{zoneData.reduce((s, r) => s + r.reworks, 0)}</td>
                        <td className="py-2 text-right font-bold text-primary">{zoneData.reduce((s, r) => s + r.totalQuantity, 0)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
