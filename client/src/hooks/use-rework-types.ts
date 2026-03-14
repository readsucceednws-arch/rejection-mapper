import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ReworkType, InsertReworkType } from "@shared/schema";

export function useReworkTypes() {
  return useQuery<ReworkType[]>({
    queryKey: ["/api/rework-types"],
    queryFn: async () => {
      const res = await fetch("/api/rework-types", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch rework types");
      return res.json();
    },
  });
}

export function useCreateReworkType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertReworkType) => {
      const res = await fetch("/api/rework-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to create rework type");
      }
      return res.json() as Promise<ReworkType>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rework-types"] });
    },
  });
}

export function useUpdateReworkType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<InsertReworkType> }) => {
      const res = await fetch(`/api/rework-types/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to update rework type");
      }
      return res.json() as Promise<ReworkType>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rework-types"] });
    },
  });
}

export function useDeleteReworkType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/rework-types/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete rework type");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rework-types"] });
    },
  });
}

export function useBulkDeleteReworkTypes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await fetch("/api/rework-types/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message || "Failed to delete rework types");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rework-types"] });
    },
  });
}
