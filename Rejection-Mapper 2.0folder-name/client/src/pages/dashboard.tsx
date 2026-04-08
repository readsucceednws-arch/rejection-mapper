import React, { useState, useMemo, useEffect } from "react";
import { useReportSummary } from "@/hooks/use-reports";
import { usePartWiseAnalytics, useMonthWiseAnalytics, useCostAnalytics, useZoneWiseAnalytics } from "@/hooks/use-analytics";
import { useRejectionEntries } from "@/hooks/use-rejection-entries";
import { useReworkEntries } from "@/hooks/use-rework-entries";
import { useParts } from "@/hooks/use-parts";
import { useRejectionTypes } from "@/hooks/use-rejection-types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
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
  LabelList,
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
  BarChart2,
  TrendingUp,
  LayoutDashboard,
  IndianRupee,
  MapPin,
  CalendarRange,
  X,
  RefreshCw,
} from "lucide-react";

const COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#06b6d4"];
const REJECTION_COLOR = "#ef4444";
const REWORK_COLOR = "#3b82f6";

interface DateRange {
  startDate?: string;
  endDate?: string;
}

interface TabFilters {
  type?: string;
}

type ZoneTimePreset = "all" | "7d" | "30d" | "90d";
type ZoneChartMode = "bar" | "line" | "both";

function toISODate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function getPresetDateRange(preset: ZoneTimePreset): DateRange {
  if (preset === "all") return {};
  const end = new Date();
  const start = new Date(end);
  const days = preset === "7d" ? 6 : preset === "30d" ? 29 : 89;
  start.setDate(end.getDate() - days);
  return { startDate: toISODate(start), endDate: toISODate(end) };
}

function GlobalDateBar({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (d: DateRange) => void;
}) {
  const [local, setLocal] = useState<DateRange>(value);
  const isActive = !!(value.startDate || value.endDate);

  const apply = () => onChange(local);
  const clear = () => {
    const cleared: DateRange = {};
    setLocal(cleared);
    onChange(cleared);
  };

  return (
    <Card className="p-3 flex flex-wrap items-end gap-3 border-border/50 bg-card shadow-sm">
      <div className="flex items-center gap-2 mr-1">
        <CalendarRange className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">Date Range</span>
        {isActive && (
          <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5 bg-primary/10 text-primary border-primary/20">
            Active
          </Badge>
        )}
      </div>
      <div className="grid gap-1">
        <Label className="text-xs text-muted-foreground">Start Date</Label>
        <Input
          type="date"
          className="h-8 text-xs w-[130px]"
          value={local.startDate || ""}
          onChange={(e) => setLocal((p) => ({ ...p, startDate: e.target.value || undefined }))}
          data-testid="input-global-start-date"
        />
      </div>
      <div className="grid gap-1">
        <Label className="text-xs text-muted-foreground">End Date</Label>
        <Input
          type="date"
          className="h-8 text-xs w-[130px]"
          value={local.endDate || ""}
          onChange={(e) => setLocal((p) => ({ ...p, endDate: e.target.value || undefined }))}
          data-testid="input-global-end-date"
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={apply} className="h-8" data-testid="button-apply-date-filter">
          <Filter className="w-3 h-3 mr-1" />
          Apply to All
        </Button>
        {isActive && (
          <Button
            size="sm"
            variant="outline"
            onClick={clear}
            className="h-8 text-destructive border-destructive/20 hover:bg-destructive/10"
            data-testid="button-clear-date-filter"
          >
            <X className="w-3 h-3 mr-1" />
            Clear
          </Button>
        )}
      </div>
      {isActive && (
        <p className="text-xs text-muted-foreground self-end pb-0.5">
          Applies to: Overview · Part Analysis · Monthly Trends · Cost Analysis · Zone Analysis
        </p>
      )}
    </Card>
  );
}

function TabFilterBar({
  filters,
  onApply,
  showTypeFilter = true,
  extraChildren,
}: {
  filters: TabFilters;
  onApply: (f: TabFilters) => void;
  showTypeFilter?: boolean;
  extraChildren?: React.ReactNode;
}) {
  const [local, setLocal] = useState<TabFilters>(filters);
  useEffect(() => {
    setLocal(filters);
  }, [filters]);
  if (!showTypeFilter && !extraChildren) return null;

  const apply = () => onApply(local);
  const clear = () => {
    const cleared: TabFilters = {};
    setLocal(cleared);
    onApply(cleared);
  };

  return (
    <Card className="p-3 flex flex-wrap items-end gap-3 border-border/50 bg-muted/20 shadow-sm">
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
        {(filters.type) && (
          <Button size="sm" variant="outline" onClick={clear} className="h-8 text-destructive border-destructive/20 hover:bg-destructive/10">
            Clear
          </Button>
        )}
      </div>
    </Card>
  );
}

// Reusable angled tick for XAxis labels — properly anchors rotation at the label start
function CustomXAxisTick({ x, y, payload, maxLen = 16 }: { x?: number; y?: number; payload?: { value: string }; maxLen?: number }) {
  const label = payload?.value ?? "";
  const display = label.length > maxLen ? label.slice(0, maxLen) + "…" : label;
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={8}
        textAnchor="end"
        fill="hsl(var(--muted-foreground))"
        fontSize={10}
        transform="rotate(-40)"
      >
        {display}
      </text>
    </g>
  );
}

export default function Dashboard() {
  const [globalDates, setGlobalDates] = useState<DateRange>({});
  const [overviewTabFilters] = useState<TabFilters>({});
  const [partTabFilters, setPartTabFilters] = useState<TabFilters>({});
  const [monthTabFilters, setMonthTabFilters] = useState<TabFilters>({});
  const [selectedPartNumbers, setSelectedPartNumbers] = useState<string[]>([]);
  const [selectedCostPart, setSelectedCostPart] = useState<string>("all");
  const [rejectionSearch, setRejectionSearch] = useState("");
  const [zoneTimePreset, setZoneTimePreset] = useState<ZoneTimePreset>("all");
  const [zoneChartMode, setZoneChartMode] = useState<ZoneChartMode>("both");
  
  // Part Wise Filters
  const [partWiseTopN, setPartWiseTopN] = useState<number>(10);
  const [partWiseSortOrder, setPartWiseSortOrder] = useState<"asc" | "desc">("desc");
  
  // Rejection Wise Filters
  const [rejectionWiseTopN, setRejectionWiseTopN] = useState<number>(10);
  const [rejectionWiseSortOrder, setRejectionWiseSortOrder] = useState<"asc" | "desc">("desc");

  // Cost Wise Filters
  const [costWiseTopN, setCostWiseTopN] = useState<number>(10);
  const [costWiseSortOrder, setCostWiseSortOrder] = useState<"asc" | "desc">("desc");

  // Part Summary drill-down
  const [selectedSummaryPart, setSelectedSummaryPart] = useState<string | null>(null);

  const overviewFilters = useMemo(() => ({ ...globalDates }), [globalDates]);
  const partFilters = useMemo(() => ({ ...globalDates, ...partTabFilters }), [globalDates, partTabFilters]);
  const monthFilters = useMemo(() => ({ ...globalDates, ...monthTabFilters }), [globalDates, monthTabFilters]);
  const costFilters = useMemo(() => ({ ...globalDates }), [globalDates]);
  const zoneFilters = useMemo(() => ({ ...getPresetDateRange(zoneTimePreset), ...globalDates }), [globalDates, zoneTimePreset]);

  const { data: summary, isLoading: isLoadingSummary } = useReportSummary(overviewFilters);
  const { data: overviewPartData, isLoading: isLoadingOverviewParts } = usePartWiseAnalytics(overviewFilters);

  const weekFilters = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 6);
    const fmt = (d: Date) => d.toISOString().split("T")[0];
    return { startDate: fmt(start), endDate: fmt(end) };
  }, []);
  const { data: weekSummary, isLoading: isLoadingWeek } = useReportSummary(weekFilters);
  const top5Week = useMemo(() => (weekSummary ?? []).slice(0, 5), [weekSummary]);
  const weekMax = top5Week[0]?.totalQuantity ?? 1;
  const { data: partData, isLoading: isLoadingParts } = usePartWiseAnalytics(partFilters);
  const { data: monthData, isLoading: isLoadingMonths } = useMonthWiseAnalytics(monthFilters);
  const { data: costData, isLoading: isLoadingCost } = useCostAnalytics(costFilters);
  const { data: zoneData, isLoading: isLoadingZone } = useZoneWiseAnalytics(zoneFilters);
  const { data: analyticsRejectionEntries, isLoading: isLoadingAnalyticsRejections } = useRejectionEntries(overviewFilters);
  const { data: analyticsReworkEntries, isLoading: isLoadingAnalyticsReworks } = useReworkEntries(overviewFilters);
  const { data: zoneRejectionEntries, isLoading: isLoadingZoneRejections } = useRejectionEntries(zoneFilters);
  const { data: zoneReworkEntries, isLoading: isLoadingZoneReworks } = useReworkEntries(zoneFilters);
  const { data: allParts } = useParts();
  const { data: rejectionTypes } = useRejectionTypes();

  const fallbackOverviewRejected = analyticsRejectionEntries?.reduce((sum, entry) => sum + entry.quantity, 0) ?? 0;
  const fallbackOverviewRework = analyticsReworkEntries?.reduce((sum, entry) => sum + entry.quantity, 0) ?? 0;

  const fallbackPartData = useMemo(() => {
    const map = new Map<string, { partNumber: string; description: string | null; totalQuantity: number; rejections: number; reworks: number }>();

    if (!partTabFilters.type || partTabFilters.type === "rejection") {
      for (const entry of analyticsRejectionEntries ?? []) {
        const key = entry.part.partNumber;
        const existing = map.get(key) || { partNumber: entry.part.partNumber, description: entry.part.description, totalQuantity: 0, rejections: 0, reworks: 0 };
        existing.rejections += entry.quantity;
        existing.totalQuantity += entry.quantity;
        map.set(key, existing);
      }
    }

    if (!partTabFilters.type || partTabFilters.type === "rework") {
      for (const entry of analyticsReworkEntries ?? []) {
        const key = entry.part.partNumber;
        const existing = map.get(key) || { partNumber: entry.part.partNumber, description: entry.part.description, totalQuantity: 0, rejections: 0, reworks: 0 };
        existing.reworks += entry.quantity;
        existing.totalQuantity += entry.quantity;
        map.set(key, existing);
      }
    }

    return Array.from(map.values()).sort((a, b) => b.totalQuantity - a.totalQuantity);
  }, [analyticsRejectionEntries, analyticsReworkEntries, partTabFilters.type]);

  const fallbackMonthData = useMemo(() => {
    const map = new Map<string, { month: string; totalQuantity: number; rejections: number; reworks: number }>();
    const addMonth = (dateValue: string | Date, quantity: number, isRework: boolean) => {
      const date = new Date(dateValue);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const label = date.toLocaleString("default", { month: "short", year: "numeric" });
      const existing = map.get(key) || { month: label, totalQuantity: 0, rejections: 0, reworks: 0 };
      existing.totalQuantity += quantity;
      if (isRework) existing.reworks += quantity;
      else existing.rejections += quantity;
      map.set(key, existing);
    };

    if (!monthTabFilters.type || monthTabFilters.type === "rejection") {
      for (const entry of analyticsRejectionEntries ?? []) addMonth(entry.date, entry.quantity, false);
    }
    if (!monthTabFilters.type || monthTabFilters.type === "rework") {
      for (const entry of analyticsReworkEntries ?? []) addMonth(entry.date, entry.quantity, true);
    }

    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value);
  }, [analyticsRejectionEntries, analyticsReworkEntries, monthTabFilters.type]);

  const fallbackCostData = useMemo(() => {
    const map = new Map<string, { partNumber: string; description: string | null; price: number; rejectionQty: number; reworkQty: number; rejectionCost: number; reworkCost: number; totalCost: number }>();

    for (const entry of analyticsRejectionEntries ?? []) {
      const key = entry.part.partNumber;
      const price = Number(entry.part.price) || 0;
      const existing = map.get(key) || { partNumber: entry.part.partNumber, description: entry.part.description, price, rejectionQty: 0, reworkQty: 0, rejectionCost: 0, reworkCost: 0, totalCost: 0 };
      existing.rejectionQty += entry.quantity;
      existing.rejectionCost += entry.quantity * price;
      existing.totalCost = existing.rejectionCost + existing.reworkCost;
      map.set(key, existing);
    }

    for (const entry of analyticsReworkEntries ?? []) {
      const key = entry.part.partNumber;
      const price = Number(entry.part.price) || 0;
      const existing = map.get(key) || { partNumber: entry.part.partNumber, description: entry.part.description, price, rejectionQty: 0, reworkQty: 0, rejectionCost: 0, reworkCost: 0, totalCost: 0 };
      existing.reworkQty += entry.quantity;
      existing.reworkCost += entry.quantity * price;
      existing.totalCost = existing.rejectionCost + existing.reworkCost;
      map.set(key, existing);
    }

    return Array.from(map.values()).sort((a, b) => b.totalCost - a.totalCost);
  }, [analyticsRejectionEntries, analyticsReworkEntries]);

  const mergedCostData = useMemo(() => {
    const map = new Map<string, { partNumber: string; description: string | null; price: number; rejectionQty: number; reworkQty: number; rejectionCost: number; reworkCost: number; totalCost: number }>();

    const mergeRows = (rows: typeof fallbackCostData) => {
      for (const row of rows) {
        const existing = map.get(row.partNumber) || {
          partNumber: row.partNumber,
          description: row.description,
          price: 0,
          rejectionQty: 0,
          reworkQty: 0,
          rejectionCost: 0,
          reworkCost: 0,
          totalCost: 0,
        };

        existing.description = existing.description || row.description;
        existing.price = existing.price || Number(row.price) || 0;
        existing.rejectionQty = Math.max(existing.rejectionQty, Number(row.rejectionQty) || 0);
        existing.reworkQty = Math.max(existing.reworkQty, Number(row.reworkQty) || 0);
        existing.rejectionCost = Math.max(existing.rejectionCost, Number(row.rejectionCost) || 0);
        existing.reworkCost = Math.max(existing.reworkCost, Number(row.reworkCost) || 0);
        existing.totalCost = existing.rejectionCost + existing.reworkCost;
        map.set(row.partNumber, existing);
      }
    };

    if (costData?.length) mergeRows(costData);
    if (fallbackCostData.length) mergeRows(fallbackCostData);

    return Array.from(map.values()).sort((a, b) => b.totalCost - a.totalCost);
  }, [costData, fallbackCostData]);

  const fallbackZoneData = useMemo(() => {
    const map = new Map<string, { zone: string; totalQuantity: number; rejections: number; reworks: number }>();
    const addZone = (zoneName: string, quantity: number, isRework: boolean) => {
      const existing = map.get(zoneName) || { zone: zoneName, totalQuantity: 0, rejections: 0, reworks: 0 };
      existing.totalQuantity += quantity;
      if (isRework) existing.reworks += quantity;
      else existing.rejections += quantity;
      map.set(zoneName, existing);
    };

    for (const entry of zoneRejectionEntries ?? []) {
      addZone(entry.zone?.name || "General", entry.quantity, false);
    }
    for (const entry of zoneReworkEntries ?? []) {
      addZone(entry.zone?.name || "General", entry.quantity, true);
    }

    return Array.from(map.values()).sort((a, b) => b.totalQuantity - a.totalQuantity);
  }, [zoneRejectionEntries, zoneReworkEntries]);

  const effectivePartData = partData && partData.length > 0 ? partData : fallbackPartData;
  const effectiveMonthData = monthData && monthData.length > 0 ? monthData : fallbackMonthData;
  const effectiveCostData = mergedCostData;
  const effectiveZoneData = zoneData && zoneData.length > 0 ? zoneData : fallbackZoneData;

  const isLoadingDashboardEntries = isLoadingAnalyticsRejections || isLoadingAnalyticsReworks;
  const isLoadingZoneEntries = isLoadingZoneRejections || isLoadingZoneReworks;

  const overviewRejectedFromParts = overviewPartData?.reduce((s, r) => s + r.rejections, 0) ?? 0;
  const overviewReworkFromParts = overviewPartData?.reduce((s, r) => s + r.reworks, 0) ?? 0;
  const overviewRejectedFromSummary = summary?.reduce((s, r) => s + r.totalQuantity, 0) ?? 0;
  const overviewReworkFromMonth = monthData?.reduce((s, r) => s + r.reworks, 0) ?? 0;
  const overviewTotalRejected = overviewRejectedFromParts > 0 ? overviewRejectedFromParts : (fallbackOverviewRejected > 0 ? fallbackOverviewRejected : overviewRejectedFromSummary);
  const overviewTotalRework = overviewReworkFromParts > 0 ? overviewReworkFromParts : (fallbackOverviewRework > 0 ? fallbackOverviewRework : overviewReworkFromMonth);

  const rejectionWiseData = useMemo(() => {
    if (!summary) return [];
    const totalQty = summary.reduce((s, r) => s + r.totalQuantity, 0) || 1;
    const data = summary.map((row) => {
      const rt = rejectionTypes?.find((t) => t.id === row.rejectionTypeId);
      return {
        rejectionTypeId: row.rejectionTypeId,
        code: rt?.rejectionCode ?? "—",
        reason: row.reason,
        count: row.count,
        totalQuantity: row.totalQuantity,
        pct: Math.round((row.totalQuantity / totalQty) * 100),
      };
    });
    
    // Sort the data
    const sorted = [...data].sort((a, b) => {
      if (rejectionWiseSortOrder === "desc") {
        return b.totalQuantity - a.totalQuantity;
      } else {
        return a.totalQuantity - b.totalQuantity;
      }
    });
    
    return sorted;
  }, [summary, rejectionTypes, rejectionWiseSortOrder]);

  const filteredRejectionWiseData = useMemo(() => {
    let data = rejectionWiseData;
    
    // Apply search filter
    if (rejectionSearch.trim()) {
      const q = rejectionSearch.toLowerCase();
      data = data.filter(
        (r) => r.code.toLowerCase().includes(q) || r.reason.toLowerCase().includes(q)
      );
    }
    
    // Apply top N filter
    if (rejectionWiseTopN > 0 && rejectionWiseTopN !== -1) {
      data = data.slice(0, rejectionWiseTopN);
    }
    
    return data;
  }, [rejectionWiseData, rejectionSearch, rejectionWiseTopN]);

  // Compute rejection & rework causes breakdown per part
  const partCausesData = useMemo(() => {
    const map = new Map<string, { rejectionCauses: Map<string, number>; reworkCauses: Map<string, number> }>();

    for (const entry of analyticsRejectionEntries ?? []) {
      const pn = entry.part.partNumber;
      if (!map.has(pn)) map.set(pn, { rejectionCauses: new Map(), reworkCauses: new Map() });
      const reason = entry.rejectionType?.reason ?? "Unknown";
      const existing = map.get(pn)!.rejectionCauses.get(reason) ?? 0;
      map.get(pn)!.rejectionCauses.set(reason, existing + entry.quantity);
    }

    for (const entry of analyticsReworkEntries ?? []) {
      const pn = entry.part.partNumber;
      if (!map.has(pn)) map.set(pn, { rejectionCauses: new Map(), reworkCauses: new Map() });
      const reason = (entry as any).reworkType?.reason ?? (entry as any).reworkType?.name ?? "Unknown";
      const existing = map.get(pn)!.reworkCauses.get(reason) ?? 0;
      map.get(pn)!.reworkCauses.set(reason, existing + entry.quantity);
    }

    return map;
  }, [analyticsRejectionEntries, analyticsReworkEntries]);

  const filteredPartData = useMemo(() => {
    
    let data = effectivePartData;
    
    // Apply part number filter
    if (selectedPartNumbers.length > 0) {
      data = data.filter((p) => selectedPartNumbers.includes(p.partNumber));
    }
    
    // Sort the data
    const sorted = [...data].sort((a, b) => {
      const totalA = a.rejections + a.reworks;
      const totalB = b.rejections + b.reworks;
      if (partWiseSortOrder === "desc") {
        return totalB - totalA;
      } else {
        return totalA - totalB;
      }
    });
    
    // Apply top N filter
    if (partWiseTopN > 0 && partWiseTopN !== -1) {
      return sorted.slice(0, partWiseTopN);
    }
    
    return sorted;
  }, [effectivePartData, selectedPartNumbers, partWiseTopN, partWiseSortOrder]);

  const normalizedCostData = useMemo(() => {
    if (!effectiveCostData) return [];
    return effectiveCostData.map((row) => ({
      ...row,
      price: Number(row.price) || 0,
      rejectionQty: Number(row.rejectionQty) || 0,
      reworkQty: Number(row.reworkQty) || 0,
      rejectionCost: Number(row.rejectionCost) || 0,
      reworkCost: Number(row.reworkCost) || 0,
      totalCost: Number(row.totalCost) || 0,
    }));
  }, [effectiveCostData]);
  const filteredCostTableData = useMemo(() => {
    if (!normalizedCostData.length) return [];
    let data = selectedCostPart === "all" ? normalizedCostData : normalizedCostData.filter((r) => r.partNumber === selectedCostPart);
    data = [...data].sort((a, b) =>
      costWiseSortOrder === "desc" ? b.rejectionCost - a.rejectionCost : a.rejectionCost - b.rejectionCost
    );
    if (costWiseTopN > 0 && costWiseTopN !== -1) data = data.slice(0, costWiseTopN);
    return data;
  }, [normalizedCostData, selectedCostPart, costWiseTopN, costWiseSortOrder]);

  const totalRejectionCost = filteredCostTableData.reduce((s, r) => s + r.rejectionCost, 0);
  const totalReworkCost = filteredCostTableData.reduce((s, r) => s + r.reworkCost, 0);
  const grandTotalCost = totalRejectionCost;

  const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1 text-sm">Overview and analytics of manufacturing rejections & reworks</p>
      </div>

      <GlobalDateBar value={globalDates} onChange={setGlobalDates} />

      <Tabs defaultValue="overview">
        <TabsList className="mb-4 flex-wrap h-auto gap-1">
          <TabsTrigger value="overview" className="gap-1.5">
            <LayoutDashboard className="w-4 h-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="parts" className="gap-1.5">
            <BarChart2 className="w-4 h-4" />
            Part Wise
          </TabsTrigger>
          <TabsTrigger value="rejection" className="gap-1.5">
            <AlertCircle className="w-4 h-4" />
            Rejection Wise
          </TabsTrigger>
          <TabsTrigger value="monthly" className="gap-1.5">
            <TrendingUp className="w-4 h-4" />
            Monthly Trends
          </TabsTrigger>
          <TabsTrigger value="cost" className="gap-1.5">
            <IndianRupee className="w-4 h-4" />
            Cost Wise
          </TabsTrigger>
          <TabsTrigger value="zone" className="gap-1.5">
            <MapPin className="w-4 h-4" />
            Zone Wise
          </TabsTrigger>
        </TabsList>

        {/* ── TAB 1: OVERVIEW ── */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="hover-elevate border-destructive/20 bg-gradient-to-br from-destructive/5 to-transparent">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Qty Rejected</CardTitle>
                <PackageX className="w-4 h-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-display font-bold text-destructive">
                  {isLoadingOverviewParts ? "..." : overviewTotalRejected.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Units rejected in period</p>
              </CardContent>
            </Card>

            <Card className="hover-elevate border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-transparent">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Qty Rework</CardTitle>
                <RefreshCw className="w-4 h-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-display font-bold text-blue-500">
                  {isLoadingOverviewParts ? "..." : overviewTotalRework.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Units reworked in period</p>
              </CardContent>
            </Card>

            <Card className="hover-elevate border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-transparent">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Rejection Cost</CardTitle>
                <IndianRupee className="w-4 h-4 text-amber-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-display font-bold text-amber-600">
                  {isLoadingCost && isLoadingDashboardEntries ? "..." : fmt(totalRejectionCost)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Total cost of rejected parts</p>
              </CardContent>
            </Card>
          </div>

          {/* ── Top 5 Rejection Reasons — Last 7 Days ── */}
          <Card className="shadow-sm border-border/50 hover-elevate" data-testid="card-top5-week">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-destructive" />
                    Top 5 Rejection Reasons
                  </CardTitle>
                  <CardDescription className="mt-0.5">
                    Last 7 days — {weekFilters.startDate} to {weekFilters.endDate}
                  </CardDescription>
                </div>
                <span className="text-xs font-medium px-2 py-1 rounded-full bg-destructive/10 text-destructive border border-destructive/20">
                  This week
                </span>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingWeek ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center gap-3 animate-pulse">
                      <div className="w-7 h-7 rounded-full bg-muted shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 bg-muted rounded w-1/2" />
                        <div className="h-2 bg-muted rounded w-full" />
                      </div>
                      <div className="w-10 h-4 bg-muted rounded" />
                    </div>
                  ))}
                </div>
              ) : top5Week.length === 0 ? (
                <div className="py-8 flex flex-col items-center gap-2 text-muted-foreground">
                  <AlertCircle className="w-8 h-8 opacity-30" />
                  <p className="text-sm">No entries logged in the last 7 days.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {top5Week.map((item, idx) => {
                    const pct = Math.round((item.totalQuantity / weekMax) * 100);
                    const color = COLORS[idx % COLORS.length];
                    const rankBg = idx === 0 ? "bg-amber-500" : idx === 1 ? "bg-slate-400" : idx === 2 ? "bg-orange-400" : "bg-muted-foreground/40";
                    return (
                      <div key={item.rejectionTypeId} className="flex items-center gap-3" data-testid={`top5-row-${idx + 1}`}>
                        <div className={`w-7 h-7 rounded-full ${rankBg} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="text-sm font-medium truncate">{item.reason}</div>
                          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${pct}%`, backgroundColor: color }}
                            />
                          </div>
                        </div>
                        <div className="text-sm font-bold tabular-nums text-right shrink-0 min-w-[2.5rem]">
                          {item.totalQuantity.toLocaleString()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

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
                      <BarChart data={summary} margin={{ top: 10, right: 10, left: -20, bottom: 70 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="reason" axisLine={false} tickLine={false} height={80} interval={0} tick={<CustomXAxisTick maxLen={20} />} />
                        <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                        <Tooltip cursor={{ fill: "hsl(var(--muted)/0.5)" }} contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))" }} />
                        <Bar dataKey="totalQuantity" name="Quantity" radius={[4, 4, 0, 0]}>
                          {summary.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                          <LabelList dataKey="totalQuantity" position="top" className="fill-muted-foreground" fontSize={10} />
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
          <TabFilterBar
            filters={partTabFilters}
            onApply={(f) => { setPartTabFilters(f); setSelectedPartNumbers([]); }}
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
          
          {/* Part Wise Filters */}
          <Card className="p-3 flex flex-wrap items-end gap-3 border-border/50 bg-card shadow-sm">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Display Options:</span>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Show Top</Label>
              <Select value={partWiseTopN.toString()} onValueChange={(v) => setPartWiseTopN(parseInt(v))}>
                <SelectTrigger className="h-8 text-xs w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">Top 5</SelectItem>
                  <SelectItem value="10">Top 10</SelectItem>
                  <SelectItem value="15">Top 15</SelectItem>
                  <SelectItem value="20">Top 20</SelectItem>
                  <SelectItem value="-1">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Sort Order</Label>
              <Select value={partWiseSortOrder} onValueChange={(v) => setPartWiseSortOrder(v as "asc" | "desc")}>
                <SelectTrigger className="h-8 text-xs w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">Highest First (↓)</SelectItem>
                  <SelectItem value="asc">Lowest First (↑)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Card>

          <Card className="shadow-sm border-border/50">
            <CardHeader>
              <CardTitle>Quantity by Part Number</CardTitle>
              <CardDescription>Stacked bar — rejections (red) and reworks (blue) per part</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[420px] w-full">
                {isLoadingParts && isLoadingDashboardEntries ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground">Loading chart...</div>
                ) : filteredPartData && filteredPartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={filteredPartData} margin={{ top: 24, right: 20, left: -10, bottom: 80 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="partNumber"
                        axisLine={false}
                        tickLine={false}
                        height={90}
                        interval={0}
                        tick={<CustomXAxisTick maxLen={18} />}
                      />
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
                      <Bar dataKey="rejections" name="rejections" stackId="a" fill={REJECTION_COLOR}
                        label={(props: any) => {
                          const { x, y, width, index } = props;
                          const row = filteredPartData[index];
                          if (!row || row.reworks > 0) return null; // only render here when reworks=0 (this is the top bar)
                          const total = row.rejections ?? 0;
                          if (!total) return null;
                          return (
                            <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={9} fill="hsl(var(--muted-foreground))">
                              {total}
                            </text>
                          );
                        }}
                      />
                      <Bar dataKey="reworks" name="reworks" stackId="a" fill={REWORK_COLOR} radius={[4, 4, 0, 0]}
                        label={(props: any) => {
                          const { x, y, width, index } = props;
                          const row = filteredPartData[index];
                          if (!row || row.reworks === 0) return null; // only render here when reworks>0 (this is the top bar)
                          const total = (row.rejections ?? 0) + (row.reworks ?? 0);
                          if (!total) return null;
                          return (
                            <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={9} fill="hsl(var(--muted-foreground))">
                              {total}
                            </text>
                          );
                        }}
                      />
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
              <CardHeader>
                <CardTitle>Part Summary Table</CardTitle>
                <CardDescription>Click a part number to view rejection &amp; rework causes</CardDescription>
              </CardHeader>
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
                      {filteredPartData.map((row, i) => {
                        const isSelected = selectedSummaryPart === row.partNumber;
                        const causes = partCausesData.get(row.partNumber);
                        const rejCauses = causes ? Array.from(causes.rejectionCauses.entries()).sort((a, b) => b[1] - a[1]) : [];
                        const rwCauses = causes ? Array.from(causes.reworkCauses.entries()).sort((a, b) => b[1] - a[1]) : [];
                        const totalRej = rejCauses.reduce((s, [, q]) => s + q, 0);
                        const totalRw = rwCauses.reduce((s, [, q]) => s + q, 0);
                        return (
                          <React.Fragment key={row.partNumber}>
                            <tr
                              className={`border-b border-border/30 transition-colors cursor-pointer ${isSelected ? "bg-muted/50" : "hover:bg-muted/30"}`}
                              onClick={() => setSelectedSummaryPart(isSelected ? null : row.partNumber)}
                            >
                              <td className="py-2 pr-4 font-medium">
                                <span className="text-primary underline underline-offset-2 decoration-dotted hover:decoration-solid transition-all">
                                  {row.partNumber}
                                </span>
                                <span className="ml-2 text-muted-foreground text-xs">{isSelected ? "▲" : "▼"}</span>
                              </td>
                              <td className="py-2 pr-4 text-muted-foreground">{row.description || "—"}</td>
                              <td className="py-2 pr-4 text-right text-destructive font-medium">{row.rejections}</td>
                              <td className="py-2 pr-4 text-right text-blue-500 font-medium">{row.reworks}</td>
                              <td className="py-2 text-right font-bold">{row.totalQuantity}</td>
                            </tr>
                            {isSelected && (
                              <tr className="border-b border-border/30 bg-muted/20">
                                <td colSpan={5} className="py-3 px-4">
                                  <div className="flex flex-wrap gap-6">
                                    {/* Rejection causes */}
                                    <div className="flex-1 min-w-[200px]">
                                      <div className="text-xs font-semibold text-destructive mb-2 flex items-center gap-1">
                                        <span className="inline-block w-2 h-2 rounded-full bg-destructive"></span>
                                        Rejection Causes
                                      </div>
                                      {rejCauses.length === 0 ? (
                                        <p className="text-xs text-muted-foreground italic">No rejections recorded</p>
                                      ) : (
                                        <div className="space-y-1.5">
                                          {rejCauses.map(([reason, qty]) => {
                                            const pct = totalRej > 0 ? Math.round((qty / totalRej) * 100) : 0;
                                            return (
                                              <div key={reason} className="flex items-center gap-2">
                                                <div className="flex-1 text-xs truncate text-foreground">{reason}</div>
                                                <div className="w-24 h-1.5 bg-border rounded-full overflow-hidden">
                                                  <div className="h-full bg-destructive rounded-full" style={{ width: `${pct}%` }} />
                                                </div>
                                                <div className="text-xs font-medium w-12 text-right text-destructive">{qty}</div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                    {/* Rework causes */}
                                    <div className="flex-1 min-w-[200px]">
                                      <div className="text-xs font-semibold text-blue-500 mb-2 flex items-center gap-1">
                                        <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span>
                                        Rework Causes
                                      </div>
                                      {rwCauses.length === 0 ? (
                                        <p className="text-xs text-muted-foreground italic">No reworks recorded</p>
                                      ) : (
                                        <div className="space-y-1.5">
                                          {rwCauses.map(([reason, qty]) => {
                                            const pct = totalRw > 0 ? Math.round((qty / totalRw) * 100) : 0;
                                            return (
                                              <div key={reason} className="flex items-center gap-2">
                                                <div className="flex-1 text-xs truncate text-foreground">{reason}</div>
                                                <div className="w-24 h-1.5 bg-border rounded-full overflow-hidden">
                                                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                                                </div>
                                                <div className="text-xs font-medium w-12 text-right text-blue-500">{qty}</div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── TAB 3: REJECTION WISE ── */}
        <TabsContent value="rejection" className="space-y-6">
          <Card className="p-3 flex flex-wrap items-end gap-3 border-border/50 bg-card shadow-sm">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by code or reason..."
                value={rejectionSearch}
                onChange={(e) => setRejectionSearch(e.target.value)}
                className="w-full h-8 pl-3 pr-3 text-xs rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                data-testid="input-rejection-search"
              />
              {rejectionSearch && (
                <Button size="sm" variant="ghost" onClick={() => setRejectionSearch("")} className="h-8 text-xs text-muted-foreground">
                  <X className="w-3 h-3" />
                </Button>
              )}
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Show Top</Label>
              <Select value={rejectionWiseTopN.toString()} onValueChange={(v) => setRejectionWiseTopN(parseInt(v))}>
                <SelectTrigger className="h-8 text-xs w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">Top 5</SelectItem>
                  <SelectItem value="10">Top 10</SelectItem>
                  <SelectItem value="15">Top 15</SelectItem>
                  <SelectItem value="20">Top 20</SelectItem>
                  <SelectItem value="-1">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Sort Order</Label>
              <Select value={rejectionWiseSortOrder} onValueChange={(v) => setRejectionWiseSortOrder(v as "asc" | "desc")}>
                <SelectTrigger className="h-8 text-xs w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">Highest First (↓)</SelectItem>
                  <SelectItem value="asc">Lowest First (↑)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Card>

          <Card className="shadow-sm border-border/50">
            <CardHeader>
              <CardTitle>Quantity by Rejection Reason</CardTitle>
              <CardDescription>Top reasons by total quantity logged in period</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[380px] w-full">
                {isLoadingSummary ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground">Loading chart...</div>
                ) : filteredRejectionWiseData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={filteredRejectionWiseData}
                      layout="vertical"
                      margin={{ top: 5, right: 60, left: 10, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                      <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                      <YAxis
                        type="category"
                        dataKey="code"
                        width={70}
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))", fontFamily: "monospace" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: "hsl(var(--muted)/0.4)" }}
                        contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))" }}
                        formatter={(value, _, props) => [value, props.payload.reason]}
                        labelFormatter={(label) => {
                          const row = rejectionWiseData.find((r) => r.code === label);
                          return `${label}${row?.reason ? ` — ${row.reason}` : ""}`;
                        }}
                      />
                      <Bar dataKey="totalQuantity" name="Quantity" radius={[0, 4, 4, 0]}>
                        {filteredRejectionWiseData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                        <LabelList dataKey="totalQuantity" position="right" className="fill-muted-foreground" fontSize={10} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">No data available for selected filters</div>
                )}
              </div>
            </CardContent>
          </Card>

          {rejectionWiseData.length > 0 && (
            <Card className="shadow-sm border-border/50">
              <CardHeader>
                <CardTitle>Rejection Reason Breakdown</CardTitle>
                <CardDescription>
                  {filteredRejectionWiseData.length} of {rejectionWiseData.length} reasons
                  {rejectionSearch ? " (filtered)" : ""}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-left py-2 pr-4 font-medium text-muted-foreground w-[90px]">Code</th>
                        <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Reason</th>
                        <th className="text-right py-2 pr-4 font-medium text-muted-foreground">Entries</th>
                        <th className="text-right py-2 pr-4 font-medium text-muted-foreground">Total Qty</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRejectionWiseData.map((row, i) => (
                        <tr key={i} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                          <td className="py-2 pr-4 font-mono font-medium text-primary">{row.code}</td>
                          <td className="py-2 pr-4">{row.reason}</td>
                          <td className="py-2 pr-4 text-right text-muted-foreground">{row.count}</td>
                          <td className="py-2 pr-4 text-right font-bold">{row.totalQuantity.toLocaleString()}</td>
                          <td className="py-2 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-primary"
                                  style={{ width: `${row.pct}%` }}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">{row.pct}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/20">
                        <td colSpan={3} className="py-2 pr-4 font-bold">Total</td>
                        <td className="py-2 pr-4 text-right font-bold text-primary">
                          {filteredRejectionWiseData.reduce((s, r) => s + r.totalQuantity, 0).toLocaleString()}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── TAB 4: MONTHLY TRENDS ── */}
        <TabsContent value="monthly" className="space-y-6">
          <TabFilterBar filters={monthTabFilters} onApply={setMonthTabFilters} showTypeFilter={true} />

          <Card className="shadow-sm border-border/50">
            <CardHeader>
              <CardTitle>Monthly Trends</CardTitle>
              <CardDescription>Quantity of rejections and reworks recorded per month over time</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[420px] w-full">
                {isLoadingMonths && isLoadingDashboardEntries ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground">Loading chart...</div>
                ) : effectiveMonthData && effectiveMonthData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={effectiveMonthData} margin={{ top: 10, right: 20, left: -10, bottom: 10 }}>
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

          {effectiveMonthData && effectiveMonthData.length > 0 && (
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
                      {[...effectiveMonthData].reverse().map((row, i) => (
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

          {/* Cost Wise Display Options */}
          <Card className="p-3 flex flex-wrap items-end gap-3 border-border/50 bg-card shadow-sm">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Display Options:</span>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Show Top</Label>
              <Select value={costWiseTopN.toString()} onValueChange={(v) => setCostWiseTopN(parseInt(v))}>
                <SelectTrigger className="h-8 text-xs w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">Top 10</SelectItem>
                  <SelectItem value="20">Top 20</SelectItem>
                  <SelectItem value="50">Top 50</SelectItem>
                  <SelectItem value="-1">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Sort Order</Label>
              <Select value={costWiseSortOrder} onValueChange={(v) => setCostWiseSortOrder(v as "asc" | "desc")}>
                <SelectTrigger className="h-8 text-xs w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">Highest First (↓)</SelectItem>
                  <SelectItem value="asc">Lowest First (↑)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Card>

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

            <Card className="hover-elevate border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Cost</CardTitle>
                <IndianRupee className="w-4 h-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-display font-bold text-foreground">
                  {isLoadingCost ? "..." : fmt(grandTotalCost)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Total cost of rejected parts</p>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-sm border-border/50">
            <CardHeader>
              <CardTitle>Cost by Part</CardTitle>
              <CardDescription>Rejection cost per part for current selection</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[420px] w-full">
                {isLoadingCost ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground">Loading chart...</div>
                ) : filteredCostTableData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={filteredCostTableData} margin={{ top: 24, right: 20, left: 10, bottom: 80 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="partNumber" axisLine={false} tickLine={false} height={90} interval={0} tick={<CustomXAxisTick maxLen={18} />} />
                      <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${v.toLocaleString("en-IN")}`} />
                      <Tooltip
                        cursor={{ fill: "hsl(var(--muted)/0.4)" }}
                        contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))" }}
                        formatter={(value: number) => [fmt(value), "Rejection Cost"]}
                        labelFormatter={(label) => {
                          const part = filteredCostTableData.find((p) => p.partNumber === label);
                          return `${label}${part?.description ? ` — ${part.description}` : ""} (₹${part?.price}/unit)`;
                        }}
                      />
                      <Bar dataKey="rejectionCost" name="rejectionCost" fill={REJECTION_COLOR} radius={[4, 4, 0, 0]}
                        label={(props: any) => {
                          const { x, y, width, value } = props;
                          if (!value) return null;
                          const formatted = `₹${Math.round(Number(value) || 0).toLocaleString("en-IN")}`;
                          return (
                            <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={9} fill="hsl(var(--muted-foreground))">
                              {formatted}
                            </text>
                          );
                        }}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">No cost data — make sure parts have a price set in Manage Parts</div>
                )}
              </div>
            </CardContent>
          </Card>

          {effectiveCostData && effectiveCostData.length > 0 && (
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
                          <td className="py-2 text-right font-bold">{fmt(row.rejectionCost)}</td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-muted-foreground">No data for selected part</td>
                        </tr>
                      )}
                      <tr className="border-t-2 border-border bg-muted/20">
                        <td colSpan={4} className="py-2 pr-4 font-bold">Total</td>
                        <td className="py-2 pr-4 text-right text-destructive font-bold">{fmt(totalRejectionCost)}</td>
                        <td className="py-2 text-right font-bold text-primary">{fmt(totalRejectionCost)}</td>
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
          <Card className="p-3 flex flex-wrap items-end gap-3 border-border/50 bg-muted/20 shadow-sm">
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Time Window</Label>
              <Select value={zoneTimePreset} onValueChange={(v: ZoneTimePreset) => setZoneTimePreset(v)}>
                <SelectTrigger className="h-8 text-xs w-[160px]">
                  <SelectValue placeholder="All Time" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="7d">Last 7 Days</SelectItem>
                  <SelectItem value="30d">Last 30 Days</SelectItem>
                  <SelectItem value="90d">Last 90 Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Graph Type</Label>
              <Select value={zoneChartMode} onValueChange={(v: ZoneChartMode) => setZoneChartMode(v)}>
                <SelectTrigger className="h-8 text-xs w-[160px]">
                  <SelectValue placeholder="Both" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Bar + Line</SelectItem>
                  <SelectItem value="bar">Bar Only</SelectItem>
                  <SelectItem value="line">Line Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Card>

          {(zoneChartMode === "bar" || zoneChartMode === "both") && (
          <Card className="shadow-sm border-border/50">
            <CardHeader>
              <CardTitle>Zone Analysis (Bar)</CardTitle>
              <CardDescription>Total rejections and reworks grouped by zone</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[380px] w-full">
                {isLoadingZone && isLoadingZoneEntries ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground">Loading chart...</div>
                ) : effectiveZoneData && effectiveZoneData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={effectiveZoneData} margin={{ top: 24, right: 20, left: -10, bottom: 70 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="zone" axisLine={false} tickLine={false} height={80} interval={0} tick={<CustomXAxisTick maxLen={20} />} />
                      <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                      <Tooltip
                        cursor={{ fill: "hsl(var(--muted)/0.4)" }}
                        contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))" }}
                        formatter={(value, name) => [value, name === "rejections" ? "Rejections" : "Reworks"]}
                      />
                      <Legend formatter={(value) => <span className="text-xs capitalize">{value === "rejections" ? "Rejections" : "Reworks"}</span>} />
                      <Bar dataKey="rejections" name="rejections" stackId="a" fill={REJECTION_COLOR}
                        label={(props: any) => {
                          const { x, y, width, index } = props;
                          const row = effectiveZoneData[index];
                          if (!row || row.reworks > 0) return null;
                          const total = row.rejections ?? 0;
                          if (!total) return null;
                          return (
                            <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={9} fill="hsl(var(--muted-foreground))">
                              {total}
                            </text>
                          );
                        }}
                      />
                      <Bar dataKey="reworks" name="reworks" stackId="a" fill={REWORK_COLOR} radius={[4, 4, 0, 0]}
                        label={(props: any) => {
                          const { x, y, width, index } = props;
                          const row = effectiveZoneData[index];
                          if (!row || row.reworks === 0) return null;
                          const total = (row.rejections ?? 0) + (row.reworks ?? 0);
                          if (!total) return null;
                          return (
                            <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={9} fill="hsl(var(--muted-foreground))">
                              {total}
                            </text>
                          );
                        }}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">No data available for selected filters</div>
                )}
              </div>
            </CardContent>
          </Card>
          )}

          {(zoneChartMode === "line" || zoneChartMode === "both") && (
          <Card className="shadow-sm border-border/50">
            <CardHeader>
              
              <CardTitle>Zone Analysis (Line)</CardTitle>
              <CardDescription>Line view of rejections and reworks by zone</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[380px] w-full">
                {isLoadingZone && isLoadingZoneEntries ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground">Loading chart...</div>
                ) : effectiveZoneData && effectiveZoneData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={effectiveZoneData} margin={{ top: 10, right: 20, left: -10, bottom: 70 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="zone" axisLine={false} tickLine={false} height={80} interval={0} tick={<CustomXAxisTick maxLen={20} />} />
                      <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))" }}
                        formatter={(value, name) => [value, name === "rejections" ? "Rejections" : "Reworks"]}
                      />
                      <Legend formatter={(value) => <span className="text-xs capitalize">{value === "rejections" ? "Rejections" : "Reworks"}</span>} />
                      <Line type="monotone" dataKey="rejections" name="rejections" stroke={REJECTION_COLOR} strokeWidth={2} dot={{ r: 4, fill: REJECTION_COLOR }} />
                      <Line type="monotone" dataKey="reworks" name="reworks" stroke={REWORK_COLOR} strokeWidth={2} dot={{ r: 4, fill: REWORK_COLOR }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">No data available for selected filters</div>
                )}
              </div>
            </CardContent>
          </Card>
          )}

          {effectiveZoneData && effectiveZoneData.length > 0 && (
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
                      {effectiveZoneData.map((row, i) => (
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
                        <td className="py-2 pr-4 text-right text-destructive font-bold">{effectiveZoneData.reduce((s, r) => s + r.rejections, 0)}</td>
                        <td className="py-2 pr-4 text-right text-blue-500 font-bold">{effectiveZoneData.reduce((s, r) => s + r.reworks, 0)}</td>
                        <td className="py-2 text-right font-bold text-primary">{effectiveZoneData.reduce((s, r) => s + r.totalQuantity, 0)}</td>
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
