import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLogin, useCreateOrg, useJoinOrg, useGoogleAuthEnabled, AuthUser } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { BarChart3, LogIn, Building2, UserPlus, Users, Eye, EyeOff, Copy, Check, ArrowRight, User, ChevronRight } from "lucide-react";
import { SiGoogle } from "react-icons/si";

type Mode = "login" | "register" | "choose-path" | "create-org" | "join-org" | "forgot-password" | "reset-password" | "accept-invite";

const loginSchema = z.object({
  identifier: z.string().min(1, "Enter your email or username"),
  password: z.string().min(1, "Enter your password"),
});

const createOrgSchema = z.object({
  orgName: z.string().min(2, "Organization name must be at least 2 characters"),
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const registerSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const joinOrgSchema = z.object({
  inviteCode: z.string().min(1, "Enter the invite code"),
  email: z.string().email("Enter a valid email address"),
  username: z.string().min(1, "Enter the username assigned to you"),
  password: z.string().min(1, "Enter the password assigned to you"),
});

const forgotPasswordSchema = z.object({
  email: z.string().email("Enter a valid email address"),
});

const resetPasswordSchema = z.object({
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string().min(6, "Please confirm your password"),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [createdInviteCode, setCreatedInviteCode] = useState<string | null>(null);
  const [pendingUser, setPendingUser] = useState<AuthUser | null>(null);
  const [pendingCredentials, setPendingCredentials] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [forgotEmailSent, setForgotEmailSent] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteInfo, setInviteInfo] = useState<{ username: string; email: string; orgName: string } | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);

  const queryClient = useQueryClient();
  const loginMutation = useLogin();
  const createOrgMutation = useCreateOrg();
  const joinOrgMutation = useJoinOrg();
  const { data: googleAuth } = useGoogleAuthEnabled();
  const googleEnabled = googleAuth?.enabled ?? false;
  const { toast } = useToast();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth_error") === "google") {
      toast({ title: "Google sign-in failed", description: "Please try again or use email/password.", variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname);
    }
    const resetTok = params.get("reset_token");
    if (resetTok) {
      setResetToken(resetTok);
      setMode("reset-password");
      window.history.replaceState({}, "", window.location.pathname);
    }
    const inviteTok = params.get("invite_token");
    if (inviteTok) {
      setInviteToken(inviteTok);
      setMode("accept-invite");
      window.history.replaceState({}, "", window.location.pathname);
      fetch(`/api/invite/${inviteTok}`)
        .then(async (r) => {
          if (!r.ok) {
            const err = await r.json();
            setInviteError(err.message ?? "This invite link is invalid or has expired.");
          } else {
            const info = await r.json();
            setInviteInfo(info);
          }
        })
        .catch(() => setInviteError("Could not validate invite link. Please try again."));
    }
  }, []);

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: "", password: "" },
  });

  const createOrgForm = useForm<z.infer<typeof createOrgSchema>>({
    resolver: zodResolver(createOrgSchema),
    defaultValues: { orgName: "", email: "", password: "" },
  });

  const registerForm = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "" },
  });

  const joinOrgForm = useForm<z.infer<typeof joinOrgSchema>>({
    resolver: zodResolver(joinOrgSchema),
    defaultValues: { inviteCode: "", email: "", username: "", password: "" },
  });

  const forgotPasswordForm = useForm<z.infer<typeof forgotPasswordSchema>>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const resetPasswordForm = useForm<z.infer<typeof resetPasswordSchema>>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const switchMode = (m: Mode) => {
    setMode(m);
    setShowPassword(false);
    setShowConfirmPassword(false);
    setCreatedInviteCode(null);
    setPendingUser(null);
    if (m !== "choose-path" && m !== "create-org" && m !== "join-org") {
      setPendingCredentials(null);
    }
    setForgotEmailSent(false);
    setResetSuccess(false);
    loginForm.reset();
    registerForm.reset();
    createOrgForm.reset();
    joinOrgForm.reset();
    forgotPasswordForm.reset();
    resetPasswordForm.reset();
  };

  const copyInviteCode = () => {
    if (createdInviteCode) {
      navigator.clipboard.writeText(createdInviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const continueToDashboard = () => {
    if (pendingUser) {
      queryClient.setQueryData(["/api/me"], pendingUser);
    }
  };

  const isPending = loginMutation.isPending || createOrgMutation.isPending || joinOrgMutation.isPending;

  if (createdInviteCode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center shadow-lg">
              <BarChart3 className="w-7 h-7 text-primary-foreground" />
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-bold tracking-tight">RejectMap</h1>
              <p className="text-sm text-muted-foreground mt-1">Manufacturing parts rejection tracker</p>
            </div>
          </div>
          <Card className="shadow-md border-border/50">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Check className="w-4 h-4 text-green-600" />
                </div>
                <CardTitle className="text-lg text-green-600">Organization created!</CardTitle>
              </div>
              <CardDescription>
                Share this invite code with your teammates so they can join your organization.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2 bg-muted rounded-lg px-4 py-3 border border-border">
                <span className="font-mono text-2xl font-bold tracking-widest flex-1 text-center" data-testid="text-invite-code">
                  {createdInviteCode}
                </span>
                <Button variant="ghost" size="icon" onClick={copyInviteCode} data-testid="button-copy-invite">
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                You can always find this code in the sidebar after signing in.
              </p>
              <Button className="w-full" onClick={continueToDashboard} data-testid="button-continue-dashboard">
                <ArrowRight className="w-4 h-4 mr-2" />
                Continue to Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center shadow-lg">
            <BarChart3 className="w-7 h-7 text-primary-foreground" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">RejectMap</h1>
            <p className="text-sm text-muted-foreground mt-1">Manufacturing parts rejection tracker</p>
          </div>
        </div>

        <Card className="shadow-md border-border/50">
          {(mode === "login" || mode === "register") && (
            <div className="flex border-b border-border">
              <button
                onClick={() => switchMode("login")}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${mode === "login" ? "text-primary border-b-2 border-primary -mb-px" : "text-muted-foreground hover:text-foreground"}`}
                data-testid="tab-signin"
              >
                Sign In
              </button>
              <button
                onClick={() => switchMode("register")}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${mode === "register" ? "text-primary border-b-2 border-primary -mb-px" : "text-muted-foreground hover:text-foreground"}`}
                data-testid="tab-register"
              >
                Register
              </button>
            </div>
          )}

          {mode === "login" && (
            <>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Welcome back</CardTitle>
                <CardDescription>Enter your credentials to continue</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...loginForm}>
                  <form onSubmit={loginForm.handleSubmit((data) => {
                    loginMutation.mutate(data, {
                      onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
                    });
                  })} className="space-y-4">
                    <FormField control={loginForm.control} name="identifier" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email or username</FormLabel>
                        <FormControl>
                          <Input type="text" placeholder="you@example.com or username" autoComplete="username" {...field} data-testid="input-identifier" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={loginForm.control} name="password" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showPassword ? "text" : "password"}
                              placeholder="••••••••"
                              autoComplete="current-password"
                              {...field}
                              data-testid="input-password"
                              className="pr-10"
                            />
                            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <Button type="submit" className="w-full" disabled={isPending} data-testid="button-submit-auth">
                      {isPending ? <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : <><LogIn className="w-4 h-4 mr-2" />Sign In</>}
                    </Button>
                    <div className="text-right">
                      <button type="button" onClick={() => switchMode("forgot-password")} className="text-sm text-muted-foreground hover:text-primary underline-offset-4 hover:underline transition-colors" data-testid="link-forgot-password">
                        Forgot password?
                      </button>
                    </div>
                  </form>
                </Form>
                {googleEnabled && (
                  <>
                    <div className="relative my-4">
                      <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                      <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">or</span></div>
                    </div>
                    <a href="/api/auth/google" data-testid="button-google-signin">
                      <Button variant="outline" className="w-full" type="button">
                        <SiGoogle className="w-4 h-4 mr-2" />
                        Continue with Google
                      </Button>
                    </a>
                  </>
                )}
              </CardContent>
            </>
          )}

          {mode === "register" && (
            <>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Create your account</CardTitle>
                <CardDescription>Set up your account to get started</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...registerForm}>
                  <form onSubmit={registerForm.handleSubmit((data) => {
                    setPendingCredentials({ email: data.email, password: data.password });
                    setMode("choose-path");
                  })} className="space-y-4">
                    <FormField control={registerForm.control} name="email" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="you@example.com" autoComplete="email" {...field} data-testid="input-email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={registerForm.control} name="password" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showPassword ? "text" : "password"}
                              placeholder="••••••••"
                              autoComplete="new-password"
                              {...field}
                              data-testid="input-password"
                              className="pr-10"
                            />
                            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <Button type="submit" className="w-full" disabled={isPending} data-testid="button-submit-auth">
                      {isPending ? <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : <><UserPlus className="w-4 h-4 mr-2" />Create Account</>}
                    </Button>
                  </form>
                </Form>
                {googleEnabled && (
                  <>
                    <div className="relative my-4">
                      <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                      <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">or</span></div>
                    </div>
                    <a href="/api/auth/google" data-testid="button-google-register">
                      <Button variant="outline" className="w-full" type="button">
                        <SiGoogle className="w-4 h-4 mr-2" />
                        Continue with Google
                      </Button>
                    </a>
                  </>
                )}
                <div className="mt-4 space-y-1 text-center text-sm text-muted-foreground border-t border-border pt-4">
                  <p>
                    Have an invite code?{" "}
                    <button onClick={() => switchMode("join-org")} className="text-primary underline-offset-4 hover:underline font-medium" data-testid="link-join-org-from-register">
                      Join an existing org
                    </button>
                  </p>
                  <p>
                    Setting up a team?{" "}
                    <button onClick={() => switchMode("create-org")} className="text-primary underline-offset-4 hover:underline font-medium" data-testid="link-create-org-from-register">
                      Create organization
                    </button>
                  </p>
                </div>
              </CardContent>
            </>
          )}

          {mode === "choose-path" && (
            <>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">How will you use RejectMap?</CardTitle>
                <CardDescription>Choose how you'd like to set up your account</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pb-5">
                <button
                  data-testid="button-path-individual"
                  onClick={() => {
                    if (!pendingCredentials) return;
                    const orgName = pendingCredentials.email.split("@")[0].replace(/[^a-zA-Z0-9 ]/g, " ").trim() || "My Organization";
                    createOrgMutation.mutate(
                      { orgName, email: pendingCredentials.email, password: pendingCredentials.password },
                      {
                        onSuccess: (user) => { queryClient.setQueryData(["/api/me"], user); },
                        onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
                      }
                    );
                  }}
                  disabled={createOrgMutation.isPending}
                  className="w-full text-left flex items-center gap-4 p-4 rounded-xl border border-border hover:border-primary/50 hover:bg-muted/40 transition-all group"
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground">Use Individually</p>
                    <p className="text-sm text-muted-foreground">Just me — track my own rejections</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>

                <button
                  data-testid="button-path-create-org"
                  onClick={() => {
                    if (!pendingCredentials) return;
                    createOrgForm.reset({
                      orgName: "",
                      email: pendingCredentials.email,
                      password: pendingCredentials.password,
                    });
                    setMode("create-org");
                  }}
                  className="w-full text-left flex items-center gap-4 p-4 rounded-xl border border-border hover:border-primary/50 hover:bg-muted/40 transition-all group"
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                    <Building2 className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground">Create an Organization</p>
                    <p className="text-sm text-muted-foreground">Set up a named workspace, invite teammates</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>

                <button
                  data-testid="button-path-join-org"
                  onClick={() => switchMode("join-org")}
                  className="w-full text-left flex items-center gap-4 p-4 rounded-xl border border-border hover:border-primary/50 hover:bg-muted/40 transition-all group"
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                    <Users className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground">Join an Organization</p>
                    <p className="text-sm text-muted-foreground">I have an invite code from my team</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>

                <p className="text-center text-sm text-muted-foreground pt-1">
                  <button onClick={() => switchMode("register")} className="text-primary underline-offset-4 hover:underline font-medium">← Back</button>
                </p>
              </CardContent>
            </>
          )}

          {mode === "create-org" && (
            <>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Create organization</CardTitle>
                <CardDescription>Set up a named workspace for your team</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...createOrgForm}>
                  <form onSubmit={createOrgForm.handleSubmit((data) => {
                    createOrgMutation.mutate(data, {
                      onSuccess: (user) => {
                        setPendingUser(user);
                        if (user.inviteCode) setCreatedInviteCode(user.inviteCode);
                      },
                      onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
                    });
                  })} className="space-y-4">
                    <FormField control={createOrgForm.control} name="orgName" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Organization name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Acme Manufacturing" {...field} data-testid="input-org-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    {!pendingCredentials && (
                      <>
                        <FormField control={createOrgForm.control} name="email" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Your email</FormLabel>
                            <FormControl>
                              <Input type="email" placeholder="you@example.com" autoComplete="email" {...field} data-testid="input-email" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={createOrgForm.control} name="password" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Password</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Input
                                  type={showPassword ? "text" : "password"}
                                  placeholder="••••••••"
                                  autoComplete="new-password"
                                  {...field}
                                  data-testid="input-password"
                                  className="pr-10"
                                />
                                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </>
                    )}
                    {pendingCredentials && (
                      <p className="text-sm text-muted-foreground">
                        Account: <span className="font-medium text-foreground">{pendingCredentials.email}</span>
                      </p>
                    )}
                    <Button type="submit" className="w-full" disabled={isPending} data-testid="button-submit-auth">
                      {isPending ? <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : <><Building2 className="w-4 h-4 mr-2" />Create Organization</>}
                    </Button>
                  </form>
                </Form>
                <p className="text-center text-sm text-muted-foreground mt-4">
                  <button
                    onClick={() => pendingCredentials ? setMode("choose-path") : switchMode("login")}
                    className="text-primary underline-offset-4 hover:underline font-medium"
                  >
                    {pendingCredentials ? "← Back" : "← Back to sign in"}
                  </button>
                </p>
              </CardContent>
            </>
          )}

          {mode === "forgot-password" && (
            <>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Reset password</CardTitle>
                <CardDescription>Enter your email and we'll send you a reset link</CardDescription>
              </CardHeader>
              <CardContent>
                {forgotEmailSent ? (
                  <div className="space-y-4">
                    <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                      <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-green-800 dark:text-green-200">
                        If an account with that email exists, a reset link has been sent. Check your inbox.
                      </p>
                    </div>
                    <Button variant="outline" className="w-full" onClick={() => switchMode("login")} data-testid="button-back-to-login">
                      Back to Sign In
                    </Button>
                  </div>
                ) : (
                  <Form {...forgotPasswordForm}>
                    <form onSubmit={forgotPasswordForm.handleSubmit(async (data) => {
                      try {
                        const res = await fetch("/api/forgot-password", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify(data),
                        });
                        if (!res.ok) {
                          const err = await res.json();
                          throw new Error(err.message);
                        }
                        setForgotEmailSent(true);
                      } catch (err: any) {
                        toast({ title: "Error", description: err.message, variant: "destructive" });
                      }
                    })} className="space-y-4">
                      <FormField control={forgotPasswordForm.control} name="email" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="you@example.com" autoComplete="email" {...field} data-testid="input-email-forgot" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <Button type="submit" className="w-full" disabled={forgotPasswordForm.formState.isSubmitting} data-testid="button-send-reset">
                        {forgotPasswordForm.formState.isSubmitting ? <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : "Send Reset Link"}
                      </Button>
                    </form>
                  </Form>
                )}
                {!forgotEmailSent && (
                  <p className="text-center text-sm text-muted-foreground mt-4">
                    Remembered it?{" "}
                    <button onClick={() => switchMode("login")} className="text-primary underline-offset-4 hover:underline font-medium">Sign in</button>
                  </p>
                )}
              </CardContent>
            </>
          )}

          {mode === "reset-password" && (
            <>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Choose a new password</CardTitle>
                <CardDescription>Enter and confirm your new password below</CardDescription>
              </CardHeader>
              <CardContent>
                {resetSuccess ? (
                  <div className="space-y-4">
                    <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                      <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-green-800 dark:text-green-200">
                        Your password has been updated. You can now sign in with your new password.
                      </p>
                    </div>
                    <Button className="w-full" onClick={() => switchMode("login")} data-testid="button-goto-login">
                      <LogIn className="w-4 h-4 mr-2" />
                      Sign In
                    </Button>
                  </div>
                ) : (
                  <Form {...resetPasswordForm}>
                    <form onSubmit={resetPasswordForm.handleSubmit(async (data) => {
                      if (!resetToken) {
                        toast({ title: "Error", description: "Invalid reset link. Please request a new one.", variant: "destructive" });
                        return;
                      }
                      try {
                        const res = await fetch("/api/reset-password", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ token: resetToken, password: data.password }),
                        });
                        if (!res.ok) {
                          const err = await res.json();
                          throw new Error(err.message);
                        }
                        setResetSuccess(true);
                      } catch (err: any) {
                        toast({ title: "Error", description: err.message, variant: "destructive" });
                      }
                    })} className="space-y-4">
                      <FormField control={resetPasswordForm.control} name="password" render={({ field }) => (
                        <FormItem>
                          <FormLabel>New password</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                type={showPassword ? "text" : "password"}
                                placeholder="••••••••"
                                autoComplete="new-password"
                                {...field}
                                data-testid="input-new-password"
                                className="pr-10"
                              />
                              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={resetPasswordForm.control} name="confirmPassword" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Confirm new password</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                type={showConfirmPassword ? "text" : "password"}
                                placeholder="••••••••"
                                autoComplete="new-password"
                                {...field}
                                data-testid="input-confirm-password"
                                className="pr-10"
                              />
                              <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <Button type="submit" className="w-full" disabled={resetPasswordForm.formState.isSubmitting} data-testid="button-set-password">
                        {resetPasswordForm.formState.isSubmitting ? <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : "Set New Password"}
                      </Button>
                    </form>
                  </Form>
                )}
              </CardContent>
            </>
          )}

          {mode === "accept-invite" && (
            <>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Activate your account</CardTitle>
                <CardDescription>
                  {inviteInfo
                    ? `Welcome, @${inviteInfo.username}! Set a password to join ${inviteInfo.orgName}.`
                    : "Set a password to activate your account."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {inviteError ? (
                  <div className="space-y-4">
                    <div className="flex items-start gap-3 p-4 bg-destructive/10 rounded-lg border border-destructive/30">
                      <p className="text-sm text-destructive">{inviteError}</p>
                    </div>
                    <Button variant="outline" className="w-full" onClick={() => switchMode("login")} data-testid="button-back-to-login-invite">
                      Back to Sign In
                    </Button>
                  </div>
                ) : inviteSuccess ? (
                  <div className="space-y-4">
                    <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                      <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-green-800 dark:text-green-200">
                        Account activated! Signing you in…
                      </p>
                    </div>
                  </div>
                ) : !inviteInfo ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      const pw = (form.elements.namedItem("invite-password") as HTMLInputElement).value;
                      const cpw = (form.elements.namedItem("invite-confirm-password") as HTMLInputElement).value;
                      if (pw !== cpw) {
                        toast({ title: "Passwords do not match", variant: "destructive" });
                        return;
                      }
                      if (pw.length < 6) {
                        toast({ title: "Password must be at least 6 characters", variant: "destructive" });
                        return;
                      }
                      try {
                        const res = await fetch("/api/activate", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          credentials: "include",
                          body: JSON.stringify({ token: inviteToken, password: pw }),
                        });
                        if (!res.ok) {
                          const err = await res.json();
                          throw new Error(err.message);
                        }
                        const user = await res.json();
                        setInviteSuccess(true);
                        setTimeout(() => {
                          queryClient.setQueryData(["/api/me"], user);
                        }, 800);
                      } catch (err: any) {
                        toast({ title: "Activation failed", description: err.message, variant: "destructive" });
                      }
                    }}
                    className="space-y-4"
                  >
                    <div className="rounded-lg bg-muted/50 border border-border px-3 py-2.5 text-sm text-muted-foreground">
                      Signing in as <span className="font-semibold text-foreground">@{inviteInfo.username}</span> at <span className="font-semibold text-foreground">{inviteInfo.orgName}</span>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="invite-password">Set a password</Label>
                      <div className="relative">
                        <Input
                          id="invite-password"
                          name="invite-password"
                          type={showPassword ? "text" : "password"}
                          placeholder="Min. 6 characters"
                          autoComplete="new-password"
                          required
                          minLength={6}
                          autoFocus
                          className="pr-10"
                          data-testid="input-invite-password"
                        />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="invite-confirm-password">Confirm password</Label>
                      <div className="relative">
                        <Input
                          id="invite-confirm-password"
                          name="invite-confirm-password"
                          type={showConfirmPassword ? "text" : "password"}
                          placeholder="Re-enter your password"
                          autoComplete="new-password"
                          required
                          className="pr-10"
                          data-testid="input-invite-confirm-password"
                        />
                        <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                          {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <Button type="submit" className="w-full" data-testid="button-activate-account">
                      <LogIn className="w-4 h-4 mr-2" />
                      Activate &amp; Sign In
                    </Button>
                  </form>
                )}
              </CardContent>
            </>
          )}

          {mode === "join-org" && (
            <>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Join organization</CardTitle>
                <CardDescription>Enter the invite code and the credentials your org admin assigned you</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...joinOrgForm}>
                  <form onSubmit={joinOrgForm.handleSubmit((data) => {
                    joinOrgMutation.mutate(data, {
                      onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
                    });
                  })} className="space-y-4">
                    <FormField control={joinOrgForm.control} name="inviteCode" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Invite code</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g. A1B2C3D4"
                            autoComplete="off"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                            className="font-mono tracking-widest"
                            data-testid="input-invite-code"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={joinOrgForm.control} name="email" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Your personal email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="you@example.com" autoComplete="email" {...field} data-testid="input-email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={joinOrgForm.control} name="username" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Username (assigned by your admin)</FormLabel>
                        <FormControl>
                          <Input type="text" placeholder="e.g. john_w" autoComplete="off" {...field} data-testid="input-username" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={joinOrgForm.control} name="password" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password (assigned by your admin)</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showPassword ? "text" : "password"}
                              placeholder="••••••••"
                              autoComplete="current-password"
                              {...field}
                              data-testid="input-password"
                              className="pr-10"
                            />
                            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <Button type="submit" className="w-full" disabled={isPending} data-testid="button-submit-auth">
                      {isPending ? <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : <><Users className="w-4 h-4 mr-2" />Join Organization</>}
                    </Button>
                  </form>
                </Form>
                <p className="text-center text-sm text-muted-foreground mt-4">
                  <button onClick={() => switchMode("login")} className="text-primary underline-offset-4 hover:underline font-medium">← Back to sign in</button>
                </p>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
