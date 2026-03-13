import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ReworkEntryResponse, InsertReworkEntry } from "@shared/schema";
import { api } from "@shared/routes";

interface ReworkFilters {
  startDate?: string;
  endDate?: string;
  partId?: number;
  reworkTypeId?: number;
}

export function useReworkEntries(filters?: ReworkFilters) {
  return useQuery<ReworkEntryResponse[]>({
    queryKey: ["/api/rework-entries", filters],
    queryFn: async () => {
      const url = new URL("/api/rework-entries", window.location.origin);
      if (filters?.startDate) url.searchParams.set("startDate", filters.startDate);
      if (filters?.endDate) url.searchParams.set("endDate", filters.endDate);
      if (filters?.partId) url.searchParams.set("partId", filters.partId.toString());
      if (filters?.reworkTypeId) url.searchParams.set("reworkTypeId", filters.reworkTypeId.toString());
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch rework entries");
      return res.json();
    },
  });
}

export function useBulkDeleteReworkEntries() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await fetch("/api/rework-entries/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to delete entries");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rework-entries"] });
      queryClient.invalidateQueries({ queryKey: [api.reports.summary.path] });
    },
  });
}

export function useCreateReworkEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Omit<InsertReworkEntry, "date">) => {
      const res = await fetch("/api/rework-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to create rework entry");
      }
      return res.json() as Promise<ReworkEntryResponse>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rework-entries"] });
    },
  });
}
