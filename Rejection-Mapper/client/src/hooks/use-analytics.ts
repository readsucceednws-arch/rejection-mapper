import { useQuery } from "@tanstack/react-query";
import { useUser } from "./use-auth";

// Existing interfaces for backward compatibility
export interface PartWiseData {
  partNumber: string;
  description: string | null;
  totalQuantity: number;
  rejections: number;
  reworks: number;
}

export interface MonthWiseData {
  month: string;
  totalQuantity: number;
  rejections: number;
  reworks: number;
}

export interface CostData {
  partNumber: string;
  description: string | null;
  price: number;
  rejectionQty: number;
  reworkQty: number;
  rejectionCost: number;
  reworkCost: number;
  totalCost: number;
}

// New analytics interfaces
export interface OverviewStats {
  totalIssues: number;
  totalQuantity: number;
  avgQuantityPerIssue: number;
  uniqueCategories: number;
  uniqueItems: number;
  uniqueIssueTypes: number;
}

export interface TrendData {
  period: string;
  current: {
    count: number;
    quantity: number;
  };
  previous: {
    count: number;
    quantity: number;
  };
  changePercent: {
    count: number;
    quantity: number;
  };
  trend: 'increasing' | 'decreasing' | 'stable';
}

export interface TopCategory {
  name: string;
  count: number;
  quantity: number;
  percentage: number;
  topIssueType: string;
}

export interface TopItem {
  name: string;
  count: number;
  quantity: number;
  percentage: number;
  topIssueType: string;
}

export interface TopIssueType {
  name: string;
  count: number;
  quantity: number;
  percentage: number;
  topCategory: string;
  topItem: string;
}

export interface DailyTrend {
  date: string;
  count: number;
  quantity: number;
}

export interface InsightSummary {
  type: 'top_issue' | 'problem_area' | 'trend_change';
  title: string;
  description: string;
  value: string;
  change?: string;
  confidence: number;
}

export interface AnalyticsData {
  overview: OverviewStats;
  trends: {
    last7Days: TrendData;
    last30Days: TrendData;
  };
  topCategories: TopCategory[];
  topItems: TopItem[];
  topIssueTypes: TopIssueType[];
  dailyTrend: DailyTrend[];
  insights: InsightSummary[];
}

export interface FieldLabels {
  zone: string;
  partNumber: string;
  type: string;
  quantity: string;
}

export interface AnalyticsFilters {
  startDate?: string;
  endDate?: string;
}

// New analytics hooks
export function useAnalyticsOverview(filters?: AnalyticsFilters) {
  const { data: user } = useUser();
  
  return useQuery<AnalyticsData>({
    queryKey: ["/api/analytics/overview", user?.organizationId, filters],
    queryFn: async () => {
      if (!user?.organizationId) throw new Error("No organization ID");
      
      const params = new URLSearchParams();
      if (filters?.startDate) params.append('from', filters.startDate);
      if (filters?.endDate) params.append('to', filters.endDate);
      
      const response = await fetch(`/api/analytics/overview/${user.organizationId}?${params}`, { credentials: "include" });
      if (!response.ok) {
        throw new Error("Failed to fetch analytics overview");
      }
      return response.json();
    },
    enabled: !!user?.organizationId,
  });
}

export function useAnalyticsStats(filters?: AnalyticsFilters) {
  const { data: user } = useUser();
  
  return useQuery<OverviewStats>({
    queryKey: ["/api/analytics/stats", user?.organizationId, filters],
    queryFn: async () => {
      if (!user?.organizationId) throw new Error("No organization ID");
      
      const params = new URLSearchParams();
      if (filters?.startDate) params.append('from', filters.startDate);
      if (filters?.endDate) params.append('to', filters.endDate);
      
      const response = await fetch(`/api/analytics/stats/${user.organizationId}?${params}`, { credentials: "include" });
      if (!response.ok) {
        throw new Error("Failed to fetch analytics stats");
      }
      return response.json();
    },
    enabled: !!user?.organizationId,
  });
}

export function useAnalyticsTrends() {
  const { data: user } = useUser();
  
  return useQuery({
    queryKey: ["/api/analytics/trends", user?.organizationId],
    queryFn: async () => {
      if (!user?.organizationId) throw new Error("No organization ID");
      
      const response = await fetch(`/api/analytics/trends/${user.organizationId}`, { credentials: "include" });
      if (!response.ok) {
        throw new Error("Failed to fetch trend data");
      }
      return response.json();
    },
    enabled: !!user?.organizationId,
  });
}

export function useTopCategories(limit: number = 10, filters?: AnalyticsFilters) {
  const { data: user } = useUser();
  
  return useQuery<TopCategory[]>({
    queryKey: ["/api/analytics/top-categories", user?.organizationId, limit, filters],
    queryFn: async () => {
      if (!user?.organizationId) throw new Error("No organization ID");
      
      const params = new URLSearchParams();
      params.append('limit', limit.toString());
      if (filters?.startDate) params.append('from', filters.startDate);
      if (filters?.endDate) params.append('to', filters.endDate);
      
      const response = await fetch(`/api/analytics/top-categories/${user.organizationId}?${params}`, { credentials: "include" });
      if (!response.ok) {
        throw new Error("Failed to fetch top categories");
      }
      return response.json();
    },
    enabled: !!user?.organizationId,
  });
}

export function useTopItems(limit: number = 10, filters?: AnalyticsFilters) {
  const { data: user } = useUser();
  
  return useQuery<TopItem[]>({
    queryKey: ["/api/analytics/top-items", user?.organizationId, limit, filters],
    queryFn: async () => {
      if (!user?.organizationId) throw new Error("No organization ID");
      
      const params = new URLSearchParams();
      params.append('limit', limit.toString());
      if (filters?.startDate) params.append('from', filters.startDate);
      if (filters?.endDate) params.append('to', filters.endDate);
      
      const response = await fetch(`/api/analytics/top-items/${user.organizationId}?${params}`, { credentials: "include" });
      if (!response.ok) {
        throw new Error("Failed to fetch top items");
      }
      return response.json();
    },
    enabled: !!user?.organizationId,
  });
}

export function useTopIssueTypes(limit: number = 10, filters?: AnalyticsFilters) {
  const { data: user } = useUser();
  
  return useQuery<TopIssueType[]>({
    queryKey: ["/api/analytics/top-issue-types", user?.organizationId, limit, filters],
    queryFn: async () => {
      if (!user?.organizationId) throw new Error("No organization ID");
      
      const params = new URLSearchParams();
      params.append('limit', limit.toString());
      if (filters?.startDate) params.append('from', filters.startDate);
      if (filters?.endDate) params.append('to', filters.endDate);
      
      const response = await fetch(`/api/analytics/top-issue-types/${user.organizationId}?${params}`, { credentials: "include" });
      if (!response.ok) {
        throw new Error("Failed to fetch top issue types");
      }
      return response.json();
    },
    enabled: !!user?.organizationId,
  });
}

export function useDailyTrend(filters?: AnalyticsFilters) {
  const { data: user } = useUser();
  
  return useQuery<DailyTrend[]>({
    queryKey: ["/api/analytics/daily-trend", user?.organizationId, filters],
    queryFn: async () => {
      if (!user?.organizationId) throw new Error("No organization ID");
      
      const params = new URLSearchParams();
      if (filters?.startDate) params.append('from', filters.startDate);
      if (filters?.endDate) params.append('to', filters.endDate);
      
      const response = await fetch(`/api/analytics/daily-trend/${user.organizationId}?${params}`, { credentials: "include" });
      if (!response.ok) {
        throw new Error("Failed to fetch daily trend");
      }
      return response.json();
    },
    enabled: !!user?.organizationId,
  });
}

export function useAnalyticsInsights(filters?: AnalyticsFilters) {
  const { data: user } = useUser();
  
  return useQuery<InsightSummary[]>({
    queryKey: ["/api/analytics/insights", user?.organizationId, filters],
    queryFn: async () => {
      if (!user?.organizationId) throw new Error("No organization ID");
      
      const params = new URLSearchParams();
      if (filters?.startDate) params.append('from', filters.startDate);
      if (filters?.endDate) params.append('to', filters.endDate);
      
      const response = await fetch(`/api/analytics/insights/${user.organizationId}?${params}`, { credentials: "include" });
      if (!response.ok) {
        throw new Error("Failed to fetch insights");
      }
      return response.json();
    },
    enabled: !!user?.organizationId,
  });
}

export function useFieldLabels() {
  const { data: user } = useUser();
  
  return useQuery<FieldLabels>({
    queryKey: ["/api/analytics/field-labels", user?.organizationId],
    queryFn: async () => {
      if (!user?.organizationId) throw new Error("No organization ID");
      
      const response = await fetch(`/api/analytics/field-labels/${user.organizationId}`, { credentials: "include" });
      if (!response.ok) {
        throw new Error("Failed to fetch field labels");
      }
      return response.json();
    },
    enabled: !!user?.organizationId,
  });
}

// Legacy hooks for backward compatibility
interface LegacyAnalyticsFilters {
  startDate?: string;
  endDate?: string;
  type?: string;
}

function buildQuery(filters: LegacyAnalyticsFilters) {
  const params = new URLSearchParams();
  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate) params.set("endDate", filters.endDate);
  if (filters.type && filters.type !== "all") params.set("type", filters.type);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function usePartWiseAnalytics(filters: LegacyAnalyticsFilters = {}) {
  const qs = buildQuery(filters);
  return useQuery<PartWiseData[]>({
    queryKey: ["/api/analytics/by-part", filters],
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const res = await fetch(`/api/analytics/by-part${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch part analytics");
      return res.json();
    },
  });
}

export function useMonthWiseAnalytics(filters: LegacyAnalyticsFilters = {}) {
  const qs = buildQuery(filters);
  return useQuery<MonthWiseData[]>({
    queryKey: ["/api/analytics/by-month", filters],
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const res = await fetch(`/api/analytics/by-month${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch monthly analytics");
      return res.json();
    },
  });
}

export function useCostAnalytics(filters: LegacyAnalyticsFilters = {}) {
  const qs = buildQuery(filters);
  return useQuery<CostData[]>({
    queryKey: ["/api/analytics/by-cost", filters],
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const res = await fetch(`/api/analytics/by-cost${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch cost analytics");
      return res.json();
    },
  });
}

export interface ZoneWiseData {
  zone: string;
  totalQuantity: number;
  rejections: number;
  reworks: number;
}

export function useZoneWiseAnalytics(filters: Omit<AnalyticsFilters, "type"> = {}) {
  const params = new URLSearchParams();
  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate) params.set("endDate", filters.endDate);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return useQuery<ZoneWiseData[]>({
    queryKey: ["/api/analytics/by-zone", filters],
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const res = await fetch(`/api/analytics/by-zone${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch zone analytics");
      return res.json();
    },
  });
}
