import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { UserPlus, Trash2, Users, KeyRound, Eye, EyeOff } from "lucide-react";

interface Member {
  id: number;
  email: string;
  role: string;
  organizationId: number;
  createdAt: string;
}

export default function TeamPage() {
  const { data: currentUser } = useUser();
  const [, setLocation] = useLocation();
  useEffect(() => {
    if (currentUser && currentUser.role !== "admin") setLocation("/");
  }, [currentUser, setLocation]);
  const { toast } = useToast();
  const qc = useQueryClient();

  const [addOpen, setAddOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null);
  const [setPasswordTarget, setSetPasswordTarget] = useState<Member | null>(null);
  const [newMemberPassword, setNewMemberPassword] = useState("");
  const [showNewMemberPassword, setShowNewMemberPassword] = useState(false);

  const { data: members = [], isLoading } = useQuery<Member[]>({
    queryKey: ["/api/members"],
  });

  const addMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/members", { email, username, password }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/members"] });
      toast({ title: "Member added", description: `Credentials sent to ${email}.` });
      setEmail("");
      setUsername("");
      setPassword("");
      setAddOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Failed to add member", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/members/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/members"] });
      toast({ title: "Member removed" });
      setDeleteTarget(null);
    },
    onError: (err: any) => {
      toast({ title: "Failed to remove member", description: err.message, variant: "destructive" });
    },
  });

  const setPasswordMutation = useMutation({
    mutationFn: async ({ id, password }: { id: number; password: string }) =>
      apiRequest("PATCH", `/api/members/${id}/password`, { password }),
    onSuccess: () => {
      toast({ title: "Password updated", description: `Password set for ${setPasswordTarget?.username || setPasswordTarget?.email}` });
      setNewMemberPassword("");
      setSetPasswordTarget(null);
    },
    onError: (err: any) => {
      toast({ title: "Failed to update password", description: err.message, variant: "destructive" });
    },
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !username.trim() || !password.trim()) return;
    addMutation.mutate();
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Team Members</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage who has access to your organisation.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} data-testid="button-add-member">
          <UserPlus className="w-4 h-4 mr-2" />
          Add Member
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : members.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <Users className="w-10 h-10 mb-3 opacity-30" />
          <p className="font-medium">No members yet</p>
          <p className="text-sm">Add team members so they can log entries.</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between px-4 py-3 bg-card hover:bg-muted/30 transition-colors"
              data-testid={`row-member-${member.id}`}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                  {(member.username || member.email || "?")[0].toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground" data-testid={`text-member-email-${member.id}`}>
                      {member.username ? `@${member.username}` : member.email}
                    </p>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${member.role === "admin" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`} data-testid={`badge-role-${member.id}`}>
                      {member.role}
                    </span>
                  </div>
                  {member.username && member.email && (
                    <p className="text-xs text-muted-foreground">{member.email}</p>
                  )}
                  {member.id === currentUser?.id && (
                    <p className="text-xs text-muted-foreground">You</p>
                  )}
                </div>
              </div>
              {member.id !== currentUser?.id && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={() => { setSetPasswordTarget(member); setNewMemberPassword(""); }}
                    title="Set password"
                    data-testid={`button-set-password-${member.id}`}
                  >
                    <KeyRound className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteTarget(member)}
                    title="Remove member"
                    data-testid={`button-remove-member-${member.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add a team member</DialogTitle>
            <DialogDescription>
              Set the employee's credentials. They'll receive an email with their username and password to sign in.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="member-email">Email address</Label>
              <Input
                id="member-email"
                type="email"
                placeholder="employee@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                data-testid="input-member-email"
              />
              <p className="text-xs text-muted-foreground">Credentials will be sent here.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="member-username">Username</Label>
              <Input
                id="member-username"
                type="text"
                placeholder="e.g. john_w"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                data-testid="input-member-username"
              />
              <p className="text-xs text-muted-foreground">No spaces. The employee uses this to sign in.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="member-password">Password</Label>
              <div className="relative">
                <Input
                  id="member-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Min. 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  data-testid="input-member-password"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                  onClick={() => setShowPassword((s) => !s)}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={addMutation.isPending}
              data-testid="button-submit-add-member"
            >
              {addMutation.isPending ? "Creating..." : "Create Account"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <strong>{deleteTarget?.username ? `@${deleteTarget.username}` : deleteTarget?.email}</strong> from your organisation. They will no longer be able to sign in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              data-testid="button-confirm-remove-member"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!setPasswordTarget} onOpenChange={(o) => { if (!o) { setSetPasswordTarget(null); setNewMemberPassword(""); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Set Password</DialogTitle>
            <DialogDescription>
              Set a new password for <strong>{setPasswordTarget?.username ? `@${setPasswordTarget.username}` : setPasswordTarget?.email}</strong>.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => { e.preventDefault(); setPasswordTarget && setPasswordMutation.mutate({ id: setPasswordTarget.id, password: newMemberPassword }); }}
            className="space-y-3 mt-2"
          >
            <div className="space-y-1.5">
              <Label htmlFor="set-member-password">New password</Label>
              <div className="relative">
                <Input
                  id="set-member-password"
                  type={showNewMemberPassword ? "text" : "password"}
                  placeholder="Min. 6 characters"
                  value={newMemberPassword}
                  onChange={(e) => setNewMemberPassword(e.target.value)}
                  required
                  minLength={6}
                  autoFocus
                  data-testid="input-set-member-password"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowNewMemberPassword(s => !s)}
                >
                  {showNewMemberPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={setPasswordMutation.isPending} data-testid="button-confirm-set-password">
              {setPasswordMutation.isPending ? "Saving..." : "Set Password"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
