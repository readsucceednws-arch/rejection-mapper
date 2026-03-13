import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

export type AuthUser = {
  id: number;
  email: string | null;
  username: string | null;
  role: string;
  organizationId: number | null;
  organizationName?: string;
  inviteCode?: string;
  createdAt: string;
};

export function useUser() {
  return useQuery<AuthUser | null>({
    queryKey: ["/api/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ identifier, password }: { identifier: string; password: string }) => {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Login failed");
      }
      return res.json() as Promise<AuthUser>;
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["/api/me"], user);
    },
  });
}

export function useCreateOrg() {
  return useMutation({
    mutationFn: async ({ orgName, email, password }: { orgName: string; email: string; password: string }) => {
      const res = await fetch("/api/create-org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgName, email, password }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to create organization");
      }
      return res.json() as Promise<AuthUser>;
    },
  });
}

export function useJoinOrg() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ inviteCode, email, username, password }: { inviteCode: string; email: string; username: string; password: string }) => {
      const res = await fetch("/api/join-org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode, email, username, password }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to join organization");
      }
      return res.json() as Promise<AuthUser>;
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["/api/me"], user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/logout", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Logout failed");
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/me"], null);
      queryClient.clear();
    },
  });
}

export function useHasUsers() {
  return useQuery<{ hasUsers: boolean }>({
    queryKey: ["/api/has-users"],
    queryFn: async () => {
      const res = await fetch("/api/has-users", { credentials: "include" });
      return res.json();
    },
    staleTime: Infinity,
  });
}

export function useGoogleAuthEnabled() {
  return useQuery<{ enabled: boolean }>({
    queryKey: ["/api/auth/google/enabled"],
    queryFn: async () => {
      const res = await fetch("/api/auth/google/enabled", { credentials: "include" });
      return res.json();
    },
    staleTime: Infinity,
  });
}
