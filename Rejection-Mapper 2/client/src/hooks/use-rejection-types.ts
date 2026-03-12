import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { z } from "zod";

export function useRejectionTypes() {
  return useQuery({
    queryKey: [api.rejectionTypes.list.path],
    queryFn: async () => {
      const res = await fetch(api.rejectionTypes.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch rejection types");
      const json = await res.json();
      return api.rejectionTypes.list.responses[200].parse(json);
    },
  });
}

export function useCreateRejectionType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: z.infer<typeof api.rejectionTypes.create.input>) => {
      const validated = api.rejectionTypes.create.input.parse(data);
      const res = await fetch(api.rejectionTypes.create.path, {
        method: api.rejectionTypes.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to create rejection type");
      }
      return api.rejectionTypes.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.rejectionTypes.list.path] });
    },
  });
}

export function useUpdateRejectionType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<z.infer<typeof api.rejectionTypes.create.input>> }) => {
      const res = await fetch(`/api/rejection-types/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to update rejection type");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.rejectionTypes.list.path] });
    },
  });
}

export function useDeleteRejectionType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/rejection-types/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete rejection type");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.rejectionTypes.list.path] });
    },
  });
}
