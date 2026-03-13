import { useState } from "react";
import { Link, useLocation } from "wouter";
import { 
  BarChart3, 
  ClipboardList, 
  Settings, 
  Package, 
  ListOrdered,
  Wrench,
  LogOut,
  Building2,
  Copy,
  Check,
  UserPlus,
  Send,
  Users,
  User,
  KeyRound,
  Eye,
  EyeOff,
  FolderUp,
  MapPin,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useUser, useLogout } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

const mainItems = [
  { title: "Dashboard", url: "/", icon: BarChart3 },
  { title: "Log Entry", url: "/log", icon: ClipboardList },
  { title: "Recent Entries", url: "/entries", icon: ListOrdered },
];

const dataItems = [
  { title: "Manage Parts", url: "/parts", icon: Package },
  { title: "Rejection Reasons", url: "/reasons", icon: Settings },
  { title: "Rework Types", url: "/rework-types", icon: Wrench },
  { title: "Manage Zones", url: "/zones", icon: MapPin },
  { title: "Import Data", url: "/import", icon: FolderUp },
];

const adminItems = [
  { title: "Team Members", url: "/team", icon: Users },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { data: user } = useUser();
  const logoutMutation = useLogout();
  const { toast } = useToast();

  const [copied, setCopied] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onError: () => toast({ title: "Error", description: "Failed to log out", variant: "destructive" }),
    });
  };

  const copyInviteCode = () => {
    if (user?.inviteCode) {
      navigator.clipboard.writeText(user.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Copied!", description: `Invite code ${user.inviteCode} copied to clipboard` });
    }
  };

  const inviteMutation = useMutation({
    mutationFn: async (email: string) => {
      await apiRequest("POST", "/api/invite", { email });
    },
    onSuccess: () => {
      toast({ title: "Invite sent!", description: `An invite email was sent to ${inviteEmail}.` });
      setInviteEmail("");
      setInviteOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Failed to send invite", description: err.message || "Something went wrong", variant: "destructive" });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async () => apiRequest("PATCH", "/api/profile/password", { currentPassword, newPassword }),
    onSuccess: () => {
      toast({ title: "Password changed", description: "Your password has been updated." });
      setCurrentPassword("");
      setNewPassword("");
      setProfileOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Failed to change password", description: err.message, variant: "destructive" });
    },
  });

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inviteEmail.trim()) inviteMutation.mutate(inviteEmail.trim());
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    changePasswordMutation.mutate();
  };

  return (
    <>
      <Sidebar className="border-r border-border/50 bg-sidebar">
        <SidebarHeader className="h-16 flex items-center justify-center border-b border-border/50 px-6">
          <div className="flex items-center gap-2 w-full font-display font-bold text-lg text-primary">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
              <BarChart3 className="w-5 h-5" />
            </div>
            <span>RejectMap</span>
          </div>
        </SidebarHeader>
        <SidebarContent className="py-4">
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Overview
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {mainItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton 
                      asChild 
                      isActive={location === item.url}
                      className="font-medium"
                    >
                      <Link href={item.url} className="flex items-center gap-3">
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup className="mt-6">
            <SidebarGroupLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Data Management
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {dataItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={location === item.url}
                      className="font-medium"
                    >
                      <Link href={item.url} className="flex items-center gap-3">
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {user?.role === "admin" && (
            <SidebarGroup className="mt-4">
              <SidebarGroupLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Configuration
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {adminItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={location === item.url}
                        className="font-medium"
                      >
                        <Link href={item.url} className="flex items-center gap-3">
                          <item.icon className="w-4 h-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>

        <SidebarFooter className="border-t border-border/50 px-4 py-3 space-y-2">
          {user?.organizationName && (
            <div className="flex items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <Building2 className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                <p className="text-xs text-muted-foreground truncate" data-testid="text-org-name">
                  {user.organizationName}
                </p>
              </div>
              {user.role === "admin" && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setInviteOpen(true)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    title="Invite a teammate by email"
                    data-testid="button-invite-member"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                  </button>
                  {user.inviteCode && (
                    <button
                      onClick={copyInviteCode}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      title={`Invite code: ${user.inviteCode} — click to copy`}
                      data-testid="button-copy-invite-code"
                    >
                      {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                      <span className="font-mono">{user.inviteCode}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <button
              className="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
              onClick={() => setProfileOpen(true)}
              title="View profile & change password"
              data-testid="button-open-profile"
            >
              <p className="text-xs font-medium truncate text-foreground" data-testid="text-user-email">
                {user?.email || (user?.username ? `@${user.username}` : "")}
              </p>
              <p className="text-xs text-muted-foreground">View profile</p>
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={handleLogout}
              disabled={logoutMutation.isPending}
              title="Sign out"
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </SidebarFooter>
      </Sidebar>

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Invite a teammate</DialogTitle>
            <DialogDescription>
              Enter their email address and they'll receive an invite with your organisation's join code.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInviteSubmit} className="space-y-3 mt-2">
            <Input
              type="email"
              placeholder="colleague@company.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
              autoFocus
              data-testid="input-invite-email"
            />
            <Button
              type="submit"
              className="w-full"
              disabled={inviteMutation.isPending}
              data-testid="button-send-invite"
            >
              {inviteMutation.isPending ? (
                "Sending..."
              ) : (
                <><Send className="w-4 h-4 mr-2" />Send Invite</>
              )}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Profile dialog */}
      <Dialog open={profileOpen} onOpenChange={(o) => { setProfileOpen(o); if (!o) { setCurrentPassword(""); setNewPassword(""); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="w-4 h-4" /> My Profile
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Email (username)</Label>
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
                <p className="text-sm font-medium" data-testid="text-profile-email">
                  {user?.email || (user?.username ? `@${user.username}` : "")}
                </p>
              </div>
            </div>

            {user?.organizationName && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Organisation</Label>
                <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2">
                  <p className="text-sm font-medium">{user.organizationName}</p>
                  {user.inviteCode && (
                    <span className="font-mono text-xs text-muted-foreground">{user.inviteCode}</span>
                  )}
                </div>
              </div>
            )}

            <Separator />

            <form onSubmit={handlePasswordSubmit} className="space-y-3">
              <p className="text-sm font-medium flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5" /> Change Password
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="current-password" className="text-xs">Current password</Label>
                <div className="relative">
                  <Input
                    id="current-password"
                    type={showCurrent ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    required
                    data-testid="input-current-password"
                  />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowCurrent(s => !s)}>
                    {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-password" className="text-xs">New password</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showNew ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min. 6 characters"
                    required
                    minLength={6}
                    data-testid="input-new-password"
                  />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowNew(s => !s)}>
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={changePasswordMutation.isPending} data-testid="button-change-password">
                {changePasswordMutation.isPending ? "Saving..." : "Update Password"}
              </Button>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
