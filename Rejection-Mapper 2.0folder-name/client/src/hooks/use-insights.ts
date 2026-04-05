import { useQuery } from "@tanstack/react-query";
import { useUser } from "./use-auth";

export interface DashboardMetrics {
  totalIssues: number;
  totalQuantity: number;
  topIssue: {
    type: string;
    count: number;
    totalQuantity: number;
    percentage: number;
    zone?: string;
  };
  mostAffectedZone: {
    zone: string;
    issueCount: number;
    totalQuantity: number;
    percentage: number;
    topIssueType: string;
  };
  mostAffectedItem: {
    partNumber: string;
    issueCount: number;
    totalQuantity: number;
    percentage: number;
    topIssueType: string;
  };
  trend: {
    period: string;
    count: number;
    quantity: number;
    changePercent?: number;
    trend: 'increasing' | 'decreasing' | 'stable';
  };
  insights: Array<{
    type: 'top_issue' | 'zone_focus' | 'item_focus' | 'trend';
    title: string;
    description: string;
    data: any;
    confidence: number;
    recommendations: string[];
    possibleCauses: string[];
    suggestedActions: string[];
  }>;
}

export interface DailyAggregation {
  date: string;
  count: number;
  quantity: number;
}

export function useDashboardMetrics() {
  const { data: user } = useUser();
  
  return useQuery<DashboardMetrics>({
    queryKey: ["/api/insights/dashboard", user?.organizationId],
    queryFn: async () => {
      if (!user?.organizationId) throw new Error("No organization ID");
      
      const response = await fetch(`/api/insights/dashboard/${user.organizationId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch dashboard metrics");
      }
      return response.json();
    },
    enabled: !!user?.organizationId,
  });
}

export function useTopIssues(limit: number = 10) {
  const { data: user } = useUser();
  
  return useQuery({
    queryKey: ["/api/insights/top-issues", user?.organizationId, limit],
    queryFn: async () => {
      if (!user?.organizationId) throw new Error("No organization ID");
      
      const response = await fetch(`/api/insights/top-issues/${user.organizationId}?limit=${limit}`);
      if (!response.ok) {
        throw new Error("Failed to fetch top issues");
      }
      return response.json();
    },
    enabled: !!user?.organizationId,
  });
}

export function useZoneAnalysis(limit: number = 10) {
  const { data: user } = useUser();
  
  return useQuery({
    queryKey: ["/api/insights/zone-analysis", user?.organizationId, limit],
    queryFn: async () => {
      if (!user?.organizationId) throw new Error("No organization ID");
      
      const response = await fetch(`/api/insights/zone-analysis/${user.organizationId}?limit=${limit}`);
      if (!response.ok) {
        throw new Error("Failed to fetch zone analysis");
      }
      return response.json();
    },
    enabled: !!user?.organizationId,
  });
}

export function useItemAnalysis(limit: number = 10) {
  const { data: user } = useUser();
  
  return useQuery({
    queryKey: ["/api/insights/item-analysis", user?.organizationId, limit],
    queryFn: async () => {
      if (!user?.organizationId) throw new Error("No organization ID");
      
      const response = await fetch(`/api/insights/item-analysis/${user.organizationId}?limit=${limit}`);
      if (!response.ok) {
        throw new Error("Failed to fetch item analysis");
      }
      return response.json();
    },
    enabled: !!user?.organizationId,
  });
}

export function useTrendData() {
  const { data: user } = useUser();
  
  return useQuery({
    queryKey: ["/api/insights/trends", user?.organizationId],
    queryFn: async () => {
      if (!user?.organizationId) throw new Error("No organization ID");
      
      const response = await fetch(`/api/insights/trends/${user.organizationId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch trend data");
      }
      return response.json();
    },
    enabled: !!user?.organizationId,
  });
}

export function useDailyAggregation(days: number = 30) {
  const { data: user } = useUser();
  
  return useQuery<DailyAggregation[]>({
    queryKey: ["/api/insights/daily-aggregation", user?.organizationId, days],
    queryFn: async () => {
      if (!user?.organizationId) throw new Error("No organization ID");
      
      const response = await fetch(`/api/insights/daily-aggregation/${user.organizationId}?days=${days}`);
      if (!response.ok) {
        throw new Error("Failed to fetch daily aggregation");
      }
      return response.json();
    },
    enabled: !!user?.organizationId,
  });
}
