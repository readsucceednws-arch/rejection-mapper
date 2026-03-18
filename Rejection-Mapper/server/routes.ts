import type { Express } from "express";
import type { Server } from "http";
import passport from "passport";
import { storage } from "./storage";
import { isAuthenticated, hashPassword, comparePassword, isGoogleAuthEnabled } from "./auth";
import { sendInviteEmail, sendPasswordResetEmail, sendWorkerInviteEmail } from "./email";
import { api } from "@shared/routes";
import { z } from "zod";
import type { User } from "@shared/schema";

function getOrgId(req: any): number {
  const user = req.user as User;
  if (!user?.organizationId) throw new Error("No organization associated with this account");
  return user.organizationId;
}

function getParamString(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] ?? "";
  return param ?? "";
}

function getParamId(param: string | string[] | undefined): number {
  return Number.parseInt(getParamString(param), 10);
}

function isAdmin(req: any, res: any, next: any) {
  if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
  const user = req.user as User;
  if (user.role !== "admin") return res.status(403).json({ message: "Admin access required" });
  next();
}

// ─── IMPORT STATE MANAGEMENT ───
interface ImportState {
  cancelled: boolean;
  startTime: number;
  orgId: number;
}

const activeImports = new Map<string, ImportState>();

function generateImportId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

function createImportState(orgId: number): { id: string; state: ImportState } {
  const id = generateImportId();
  const state: ImportState = {
    cancelled: false,
    startTime: Date.now(),
    orgId,
  };
  activeImports.set(id, state);
  
  // Auto-cleanup after 1 hour
  setTimeout(() => {
    activeImports.delete(id);
  }, 60 * 60 * 1000);
  
  return { id, state };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // --- AUTH ROUTES (public) ---

  app.get("/api/me", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    const user = req.user as User;
    const { password, ...safeUser } = user;
    if (user.organizationId) {
      const org = await storage.getOrganizationById(user.organizationId);
      return res.json({ ...safeUser, organizationName: org?.name, inviteCode: org?.inviteCode });
    }
    res.json(safeUser);
  });

  app.get("/api/has-users", async (req, res) => {
    const count = await storage.getUserCount();
    res.json({ hasUsers: count > 0 });
  });

  app.post("/api/create-org", async (req, res, next) => {
    try {
      const { orgName, email, password } = z.object({
        orgName: z.string().min(2, "Organization name must be at least 2 characters"),
        email: z.string().email("Invalid email address"),
        password: z.string().min(6, "Password must be at least 6 characters"),
      }).parse(req.body);

      const existing = await storage.getUserByEmail(email);
      if (existing) return res.status(400).json({ message: "Email already in use" });

      const org = await storage.createOrganization(orgName);
      try {
        await storage.seedOrganizationFromDefault(org.id);
      } catch (seedErr) {
        console.error("Warning: failed to seed org data:", seedErr);
      }
      const hashed = await hashPassword(password);
      const user = await storage.createUser({ email, password: hashed, role: "admin", organizationId: org.id });

      req.login(user, (err) => {
        if (err) return next(err);
        const { password: _, ...safeUser } = user;
        res.status(201).json({ ...safeUser, organizationName: org.name, inviteCode: org.inviteCode });
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      next(err);
    }
  });

  app.post("/api/join-org", async (req, res, next) => {
    try {
      const { inviteCode, email, username, password } = z.object({
        inviteCode: z.string().min(1, "Invite code is required"),
        email: z.string().email("Your email address is required"),
        username: z.string().min(1, "Username is required"),
        password: z.string().min(1, "Password is required"),
      }).parse(req.body);

      const org = await storage.getOrganizationByInviteCode(inviteCode);
      if (!org) return res.status(400).json({ message: "Invalid invite code" });

      const user = await storage.getUserByUsernameAndOrg(username, org.id);
      if (!user) return res.status(400).json({ message: "No account found with that username in this organisation" });

      const valid = await comparePassword(password, user.password);
      if (!valid) return res.status(400).json({ message: "Incorrect password" });

      if (email) {
        const emailTaken = await storage.getUserByEmail(email);
        if (emailTaken && emailTaken.id !== user.id) return res.status(400).json({ message: "That email is already in use" });
        await storage.updateUserEmail(user.id, email);
      }

      const updatedUser = await storage.getUserById(user.id);
      req.login(updatedUser!, (err) => {
        if (err) return next(err);
        const { password: _, ...safeUser } = updatedUser!;
        res.json({ ...safeUser, organizationName: org.name, inviteCode: org.inviteCode });
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      next(err);
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message || "Invalid email or password" });
      req.login(user, async (loginErr) => {
        if (loginErr) return next(loginErr);
        const { password, ...safeUser } = user;
        if (user.organizationId) {
          const org = await storage.getOrganizationById(user.organizationId);
          return res.json({ ...safeUser, organizationName: org?.name, inviteCode: org?.inviteCode });
        }
        res.json(safeUser);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.json({ message: "Logged out" });
    });
  });

  app.post("/api/forgot-password", async (req, res, next) => {
    try {
      const { email } = z.object({ email: z.string().email() }).parse(req.body);
      const user = await storage.getUserByEmail(email);
      if (user) {
        const token = await storage.createPasswordResetToken(user.id);
        await sendPasswordResetEmail(email, token).catch((err) => {
          console.error("Failed to send reset email:", err.message);
        });
      }
      res.json({ message: "If an account with that email exists, a reset link has been sent." });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      next(err);
    }
  });

  app.post("/api/reset-password", async (req, res, next) => {
    try {
      const { token, password } = z.object({
        token: z.string().min(1),
        password: z.string().min(6, "Password must be at least 6 characters"),
      }).parse(req.body);

      const user = await storage.getUserByResetToken(token);
      if (!user) return res.status(400).json({ message: "Invalid or expired reset link. Please request a new one." });

      const hashed = await hashPassword(password);
      await storage.updateUserPassword(user.id, hashed);
      await storage.consumeResetToken(token);

      res.json({ message: "Password updated successfully. You can now sign in." });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      next(err);
    }
  });

  app.post("/api/invite", isAdmin, async (req, res, next) => {
    try {
      const { email } = z.object({ email: z.string().email("Invalid email address") }).parse(req.body);
      const inviter = req.user as User;
      const orgId = getOrgId(req);
      const org = await storage.getOrganizationById(orgId);
      if (!org) return res.status(404).json({ message: "Organisation not found" });
      await sendInviteEmail(email, org.inviteCode, org.name, inviter.email ?? "an administrator");
      res.json({ message: "Invite sent" });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      next(err);
    }
  });

  app.get("/api/auth/google/enabled", (_req, res) => {
    res.json({ enabled: isGoogleAuthEnabled() });
  });

  app.get("/api/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

  app.get("/api/auth/google/callback",
    passport.authenticate("google", { failureRedirect: "/?auth_error=google" }),
    async (req, res) => {
      const user = req.user as any;
      const inviteCode = user?.__newOrgInviteCode;
      if (inviteCode) {
        res.redirect(`/?new_invite=${inviteCode}`);
      } else {
        res.redirect("/");
      }
    }
  );

  // --- INVITE ACTIVATION (public) ---

  app.get("/api/invite/:token", async (req, res, next) => {
    try {
      const token = String(req.params.token ?? "").trim();
      const user = await storage.getUserByInviteToken(token);
      if (!user) return res.status(400).json({ message: "This invite link is invalid or has expired." });
      const org = await storage.getOrganizationById(user.organizationId!);
      res.json({ username: user.username, email: user.email, orgName: org?.name ?? "" });
    } catch (err) { next(err); }
  });

  app.post("/api/activate", async (req, res, next) => {
    try {
      const { token: rawToken, password } = z.object({
        token: z.string().min(1),
        password: z.string().min(6, "Password must be at least 6 characters"),
      }).parse(req.body);
      const token = rawToken.trim();

      const user = await storage.getUserByInviteToken(token);
      if (!user) return res.status(400).json({ message: "This invite link is invalid or has expired. Ask your admin to resend the invite." });

      const hashed = await hashPassword(password);
      await storage.updateUserPassword(user.id, hashed);
      await storage.consumeInviteToken(token);

      const updatedUser = await storage.getUserById(user.id);
      req.login(updatedUser!, (err) => {
        if (err) return next(err);
        const { password: _, ...safeUser } = updatedUser!;
        if (updatedUser!.organizationId) {
          storage.getOrganizationById(updatedUser!.organizationId).then((org) => {
            res.json({ ...safeUser, organizationName: org?.name, inviteCode: org?.inviteCode });
          }).catch(next);
        } else {
          res.json(safeUser);
        }
      });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      next(err);
    }
  });

  // --- MEMBERS ---
  app.get("/api/members", isAdmin, async (req, res, next) => {
    try {
      const orgId = getOrgId(req);
      const members = await storage.getUsersByOrganization(orgId);
      res.json(members.map(({ password: _, ...m }) => m));
    } catch (err) { next(err); }
  });

  app.post("/api/members", isAdmin, async (req, res, next) => {
    try {
      const orgId = getOrgId(req);
      const parsed = z.object({
        email: z.string().email("Enter a valid email address"),
        username: z.string().min(2, "Username must be at least 2 characters").regex(/^\S+$/, "Username cannot contain spaces"),
      }).parse(req.body);
      const email = parsed.email.trim().toLowerCase();
      const username = parsed.username.trim().toLowerCase();

      const existingEmail = await storage.getUserByEmail(email);
      if (existingEmail) {
        if (existingEmail.organizationId !== orgId) {
          return res.status(400).json({ message: "An account with that email already exists in another organisation" });
        }

        // Existing member in the same org: resend activation invite.
        const token = await storage.createInviteToken(existingEmail.id);
        const org = await storage.getOrganizationById(orgId);
        try {
          await sendWorkerInviteEmail(email, existingEmail.username ?? username, token, org?.name ?? "your organisation");
        } catch (emailErr: any) {
          console.error("[email] Failed to resend invite email:", emailErr?.message ?? emailErr);
          return res.status(500).json({ message: emailErr?.message ?? "Failed to send invite email. Check email configuration." });
        }

        const { password: _, ...safeExisting } = existingEmail;
        return res.status(200).json({ ...safeExisting, resent: true });
      }

      const existingUsername = await storage.getUserByUsername(username);
      if (existingUsername) {
        if (existingUsername.organizationId === orgId) {
          return res.status(400).json({ message: "That username is already taken in your organisation" });
        }
        return res.status(400).json({ message: "That username is already taken in another organisation" });
      }

      const { randomBytes } = await import("crypto");
      const tempPassword = await hashPassword(randomBytes(32).toString("hex"));
      const newUser = await storage.createUser({ email, username, password: tempPassword, organizationId: orgId });

      const token = await storage.createInviteToken(newUser.id);
      const org = await storage.getOrganizationById(orgId);

      try {
        await sendWorkerInviteEmail(email, username, token, org?.name ?? "your organisation");
      } catch (emailErr: any) {
        console.error("[email] Failed to send invite email:", emailErr?.message ?? emailErr);
        await storage.deleteUser(newUser.id, orgId);
        return res.status(500).json({ message: emailErr?.message ?? "Failed to send invite email. Check that RESEND_API_KEY is configured." });
      }

      const { password: _, ...safe } = newUser;
      res.status(201).json(safe);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      next(err);
    }
  });

  app.delete("/api/members/:id", isAdmin, async (req, res, next) => {
    try {
      const user = req.user as User;
      const orgId = getOrgId(req);
      const memberId = getParamId(req.params.id);
      if (memberId === user.id) return res.status(400).json({ message: "You cannot remove yourself" });
      await storage.deleteUser(memberId, orgId);
      res.json({ message: "Member removed" });
    } catch (err) { next(err); }
  });

  app.patch("/api/members/:id/password", isAdmin, async (req, res, next) => {
    try {
      const user = req.user as User;
      const memberId = getParamId(req.params.id);
      const { password } = z.object({
        password: z.string().min(6, "Password must be at least 6 characters"),
      }).parse(req.body);
      const member = await storage.getUserById(memberId);
      if (!member || member.organizationId !== user.organizationId) {
        return res.status(404).json({ message: "Member not found" });
      }
      const hashed = await hashPassword(password);
      await storage.updateUserPassword(memberId, hashed);
      res.json({ message: "Password updated" });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      next(err);
    }
  });

  app.patch("/api/profile/password", isAuthenticated, async (req, res, next) => {
    try {
      const user = req.user as User;
      const { currentPassword, newPassword } = z.object({
        currentPassword: z.string().min(1, "Current password is required"),
        newPassword: z.string().min(6, "New password must be at least 6 characters"),
      }).parse(req.body);
      const dbUser = await storage.getUserById(user.id);
      if (!dbUser) return res.status(404).json({ message: "User not found" });
      const valid = await comparePassword(currentPassword, dbUser.password);
      if (!valid) return res.status(400).json({ message: "Current password is incorrect" });
      const hashed = await hashPassword(newPassword);
      await storage.updateUserPassword(user.id, hashed);
      res.json({ message: "Password changed successfully" });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      next(err);
    }
  });

  // --- PARTS ---
  app.get(api.parts.list.path, isAuthenticated, async (req, res) => {
    const orgId = getOrgId(req);
    const items = await storage.getParts(orgId);
    res.json(items);
  });

  app.post(api.parts.create.path, isAdmin, async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const input = api.parts.create.input.parse(req.body);
      const created = await storage.createPart({ ...input, organizationId: orgId });
      res.status(201).json(created);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      throw err;
    }
  });

  app.put("/api/parts/:id", isAdmin, async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const id = getParamId(req.params.id);
      const input = api.parts.create.input.partial().parse(req.body);
      const updated = await storage.updatePart(id, orgId, input);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.delete("/api/parts/bulk", isAdmin, async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const { ids } = z.object({ ids: z.array(z.number().int().positive()) }).parse(req.body);
      await storage.bulkDeleteParts(ids, orgId);
      res.status(200).json({ deleted: ids.length });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.delete("/api/parts/:id", isAdmin, async (req, res) => {
    const orgId = getOrgId(req);
    await storage.deletePart(getParamId(req.params.id), orgId);
    res.status(204).end();
  });

  // --- REJECTION TYPES ---
  app.get(api.rejectionTypes.list.path, isAuthenticated, async (req, res) => {
    const orgId = getOrgId(req);
    const items = await storage.getRejectionTypes(orgId);
    res.json(items);
  });

  app.post(api.rejectionTypes.create.path, isAdmin, async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const input = api.rejectionTypes.create.input.parse(req.body);
      const created = await storage.createRejectionType({ ...input, organizationId: orgId });
      res.status(201).json(created);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      throw err;
    }
  });

  app.put("/api/rejection-types/:id", isAdmin, async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const id = getParamId(req.params.id);
      const input = api.rejectionTypes.create.input.partial().parse(req.body);
      const updated = await storage.updateRejectionType(id, orgId, input);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.delete("/api/rejection-types/bulk", isAdmin, async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const { ids } = z.object({ ids: z.array(z.number().int().positive()) }).parse(req.body);
      await storage.bulkDeleteRejectionTypes(ids, orgId);
      res.status(200).json({ deleted: ids.length });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.delete("/api/rejection-types/:id", isAdmin, async (req, res) => {
    const orgId = getOrgId(req);
    await storage.deleteRejectionType(getParamId(req.params.id), orgId);
    res.status(204).end();
  });

  // --- REJECTION ENTRIES ---
  app.delete("/api/rejection-entries/bulk", isAdmin, async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const { ids } = z.object({ ids: z.array(z.number().int().positive()) }).parse(req.body);
      await storage.bulkDeleteRejectionEntries(ids, orgId);
      res.status(200).json({ deleted: ids.length });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.delete("/api/rework-entries/bulk", isAdmin, async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const { ids } = z.object({ ids: z.array(z.number().int().positive()) }).parse(req.body);
      await storage.bulkDeleteReworkEntries(ids, orgId);
      res.status(200).json({ deleted: ids.length });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.get(api.rejectionEntries.list.path, isAuthenticated, async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const params = req.query;
      const filters = {
        startDate: params.startDate as string,
        endDate: params.endDate as string,
        partId: params.partId ? Number(params.partId) : undefined,
        rejectionTypeId: params.rejectionTypeId ? Number(params.rejectionTypeId) : undefined,
        type: params.type as string,
      };
      const items = await storage.getRejectionEntries(orgId, filters);
      res.json(items);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.rejectionEntries.create.path, isAuthenticated, async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const user = req.user as User;
      const input = api.rejectionEntries.create.input.parse(req.body);
      const { entryDate, ...rest } = input;
      const entryDateObj = entryDate ? new Date(entryDate) : undefined;

      const entryPayload = {
        ...rest,
        organizationId: orgId,
        createdByUsername: user.username ?? user.email ?? null,
        ...(entryDateObj ? { date: entryDateObj } : {}),
      };
      const created = await storage.createRejectionEntry(entryPayload as any);
      res.status(201).json(created);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      throw err;
    }
  });

  app.patch("/api/rejection-entries/:id", isAuthenticated, async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const id = getParamId(req.params.id);
      const data = z.object({
        rejectionTypeId: z.number().int().positive().optional(),
        quantity: z.number().int().positive().optional(),
        remarks: z.string().nullable().optional(),
      }).parse(req.body);
      const updated = await storage.updateRejectionEntry(id, orgId, data);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.patch("/api/rework-entries/:id", isAuthenticated, async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const id = getParamId(req.params.id);
      const data = z.object({
        reworkTypeId: z.number().int().positive().optional(),
        quantity: z.number().int().positive().optional(),
        remarks: z.string().nullable().optional(),
      }).parse(req.body);
      const updated = await storage.updateReworkEntry(id, orgId, data);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  // --- REWORK TYPES ---
  app.get("/api/rework-types", isAuthenticated, async (req, res) => {
    const orgId = getOrgId(req);
    const items = await storage.getReworkTypes(orgId);
    res.json(items);
  });

  app.post("/api/rework-types", isAdmin, async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const parsed = z.object({
        reworkCode: z.string().min(1, "Rework code is required"),
        zone: z.string().optional(),
      }).parse(req.body);
      const input = {
        reworkCode: parsed.reworkCode,
        reason: parsed.reworkCode,
        zone: parsed.zone,
      };
      const created = await storage.createReworkType({ ...input, organizationId: orgId });
      res.status(201).json(created);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      throw err;
    }
  });

  app.put("/api/rework-types/:id", isAdmin, async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const id = getParamId(req.params.id);
      const parsed = z.object({
        reworkCode: z.string().min(1, "Rework code is required").optional(),
        zone: z.string().optional(),
      }).parse(req.body);
      const input = {
        ...(parsed.reworkCode !== undefined ? { reworkCode: parsed.reworkCode } : {}),
        ...(parsed.reworkCode !== undefined ? { reason: parsed.reworkCode } : {}),
        ...(parsed.zone !== undefined ? { zone: parsed.zone } : {}),
      };
      const updated = await storage.updateReworkType(id, orgId, input);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.delete("/api/rework-types/bulk", isAdmin, async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const { ids } = z.object({ ids: z.array(z.number().int().positive()) }).parse(req.body);
      await storage.bulkDeleteReworkTypes(ids, orgId);
      res.status(200).json({ deleted: ids.length });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.delete("/api/rework-types/:id", isAdmin, async (req, res) => {
    const orgId = getOrgId(req);
    await storage.deleteReworkType(getParamId(req.params.id), orgId);
    res.status(204).end();
  });

  // --- REWORK ENTRIES ---
  app.get("/api/rework-entries", isAuthenticated, async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const params = req.query;
      const filters = {
        startDate: params.startDate as string | undefined,
        endDate: params.endDate as string | undefined,
        partId: params.partId ? Number(params.partId) : undefined,
        reworkTypeId: params.reworkTypeId ? Number(params.reworkTypeId) : undefined,
      };
      const items = await storage.getReworkEntries(orgId, filters);
      res.json(items);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/rework-entries", isAuthenticated, async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const user = req.user as User;
      const { insertReworkEntrySchema } = await import("@shared/schema");
      // entryDate is now part of insertReworkEntrySchema (defined in shared/schema.ts)
      // partId/reworkTypeId/quantity coercions still needed since they come from JSON
      const input = insertReworkEntrySchema.extend({
        partId: z.coerce.number(),
        reworkTypeId: z.coerce.number(),
        quantity: z.coerce.number().default(1),
      }).parse(req.body);
      const { entryDate, ...rest } = input;
      const entryDateObj = entryDate ? new Date(entryDate) : undefined;
      const created = await storage.createReworkEntry({
        ...rest,
        organizationId: orgId,
        createdByUsername: user.username ?? user.email ?? null,
        ...(entryDateObj ? { date: entryDateObj } : {}),
      } as any);
      res.status(201).json(created);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      throw err;
    }
  });

  // --- GOOGLE SHEETS PROXY ---
  app.get("/api/fetch-gsheet", isAuthenticated, async (req, res, next) => {
    try {
      const url = req.query.url as string;
      if (!url) return res.status(400).json({ message: "URL is required" });
      const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      if (!match) return res.status(400).json({ message: "Invalid Google Sheets URL" });
      const sheetId = match[1];
      const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
      const response = await fetch(exportUrl);
      if (!response.ok) return res.status(400).json({ message: "Could not fetch sheet. Make sure it is shared as 'Anyone with the link can view'." });
      const csv = await response.text();
      res.json({ csv });
    } catch (err) { next(err); }
  });

  // --- REPORTS ---
  app.get(api.reports.summary.path, isAuthenticated, async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const params = req.query;
      const filters = { startDate: params.startDate as string, endDate: params.endDate as string };
      const summary = await storage.getRejectionSummary(orgId, filters);
      res.json(summary);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // --- ANALYTICS ---
  app.get("/api/analytics/by-part", isAuthenticated, async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const params = req.query;
      const typeParam = Array.isArray(params.type) ? params.type[0] : params.type;
      const filters = {
        startDate: params.startDate as string | undefined,
        endDate: params.endDate as string | undefined,
        type: typeParam === "all" ? undefined : (typeParam as string | undefined),
      };
      const data = await storage.getPartWiseSummary(orgId, filters);
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/analytics/by-month", isAuthenticated, async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const params = req.query;
      const typeParam = Array.isArray(params.type) ? params.type[0] : params.type;
      const filters = {
        startDate: params.startDate as string | undefined,
        endDate: params.endDate as string | undefined,
        type: typeParam === "all" ? undefined : (typeParam as string | undefined),
      };
      const data = await storage.getMonthWiseSummary(orgId, filters);
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/analytics/by-cost", isAuthenticated, async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const params = req.query;
      const filters = {
        startDate: params.startDate as string | undefined,
        endDate: params.endDate as string | undefined,
      };
      const data = await storage.getCostSummary(orgId, filters);
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/analytics/by-zone", isAuthenticated, async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const params = req.query;
      const filters = {
        startDate: params.startDate as string | undefined,
        endDate: params.endDate as string | undefined,
      };
      const data = await storage.getZoneWiseSummary(orgId, filters);
      res.json(data);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // --- ZONES ---
  app.get("/api/zones", isAuthenticated, async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const items = await storage.getZones(orgId);
      res.json(items);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/zones", isAdmin, async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const { insertZoneSchema } = await import("@shared/schema");
      const input = insertZoneSchema.parse({ ...req.body, organizationId: orgId });
      const created = await storage.createZone(input);
      res.status(201).json(created);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      throw err;
    }
  });

  app.put("/api/zones/:id", isAdmin, async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const id = getParamId(req.params.id);
      const { name } = req.body;
      if (!name || typeof name !== "string") {
        return res.status(400).json({ message: "Zone name is required" });
      }
      const updated = await storage.updateZone(id, orgId, name.trim());
      res.json(updated);
    } catch (err) {
      if (err instanceof Error && err.message === "Zone not found") {
        return res.status(404).json({ message: "Zone not found" });
      }
      throw err;
    }
  });

  app.delete("/api/zones/:id", isAdmin, async (req, res) => {
    try {
      const orgId = getOrgId(req);
      await storage.deleteZone(getParamId(req.params.id), orgId);
      res.status(204).end();
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // --- ENTRIES IMPORT (Robust with fallback logic) ---
  app.post("/api/import-entries", isAdmin, async (req, res, next) => {
    const { 
      ImportLogger, 
      normalizeText, 
      normalizeCode, 
      normalizeForMatching,
      safeNumber, 
      safeDate, 
      isBlank, 
      flexibleMatch,
      getRowCell,
      createEmptySummary,
      addFailedRow,
      addWarning,
      formatRowError 
    } = await import("./import-utils");

    const logger = new ImportLogger();
    const summary = createEmptySummary();
    
    // Create import state for potential cancellation
    const orgId = getOrgId(req);
    const { id: importId, state: importState } = createImportState(orgId);

    try {
      const { rows, dryRun }: { rows: Record<string, any>[]; dryRun?: boolean } = req.body;

      if (!Array.isArray(rows) || rows.length === 0) {
        activeImports.delete(importId);
        return res.status(400).json({ 
          message: "No rows provided", 
          summary,
          importId
        });
      }

      summary.totalRows = rows.length;
      logger.info(`Starting import of ${rows.length} rows`, { dryRun: !!dryRun, importId });

      // Load existing data
      const existingParts = await storage.getParts(orgId);
      const existingRejectionTypes = await storage.getRejectionTypes(orgId);
      const existingReworkTypes = await storage.getReworkTypes(orgId);
      const existingZones = await storage.getZones(orgId);

      logger.debug(`Loaded existing data`, {
        parts: existingParts.length,
        rejectionTypes: existingRejectionTypes.length,
        reworkTypes: existingReworkTypes.length,
        zones: existingZones.length,
      });

      // Build lookup maps for efficient flexible matching
      const partMap = new Map(
        existingParts.map(p => [normalizeForMatching(p.partNumber), p])
      );
      const rejectionCodeMap = new Map(
        existingRejectionTypes.map(rt => [normalizeCode(rt.rejectionCode), rt])
      );
      const reworkCodeMap = new Map(
        existingReworkTypes.map(rw => [normalizeCode(rw.reworkCode), rw])
      );
      const zoneMap = new Map(
        existingZones.map(z => [normalizeForMatching(z.name), z])
      );

      // Process each row
      for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        // Check if import was cancelled
        if (importState.cancelled) {
          logger.warn(`Import cancelled by user at row ${rowIndex + 1}`);
          activeImports.delete(importId);
          return res.json({
            success: false,
            message: `Import cancelled at row ${rowIndex + 1}. ${summary.successfulImports} of ${summary.totalRows} rows imported before cancellation.`,
            summary,
            importId,
            cancelled: true,
            logs: logger.getLogs(),
          });
        }
        
        const row = rows[rowIndex];
        const rowNum = rowIndex + 1;

        try {
          // Extract fields with flexible column matching
          const dateStr = normalizeText(
            row.Date || row.date || row.DATE || 
            row["Entry Date"] || row["entry_date"] || ""
          );
          const partNumber = normalizeText(
            row["Part Number"] || row["part_number"] || row["Part No"] || 
            row["PN"] || row.Part || row.Item || ""
          );
          const typeField = normalizeText(
            row.Type || row.type || row.TYPE || 
            row["Entry Type"] || row.Category || ""
          );
          const code = normalizeText(
            row.Code || row.code || row.CODE || 
            row["Rejection Code"] || row["Rework Code"] || 
            row.Reason || row.reason || ""  // Also check Reason column as fallback
          );
          const purpose = normalizeText(
            row.Purpose || row.purpose || 
            row.Description || row.description || ""
          );
          const zone = normalizeText(
            row.Zone || row.zone || row.ZONE || ""
          );
          const quantityStr = normalizeText(
            row.Quantity || row.quantity || row.Qty || row.QTY || "1"
          );
          const remarks = normalizeText(
            row.Remarks || row.remarks || row.Notes || row.notes || ""
          );

          // Validate required fields
          if (isBlank(partNumber)) {
            addFailedRow(summary, rowNum, "Missing part number");
            logger.warn(formatRowError(rowNum, "Missing part number"), { row });
            continue;
          }

          if (isBlank(code)) {
            addFailedRow(summary, rowNum, "Missing rejection/rework code");
            logger.warn(formatRowError(rowNum, "Missing code"), { row });
            continue;
          }

          // Parse quantity
          const quantity = safeNumber(quantityStr) || 1;
          if (!Number.isFinite(quantity) || quantity <= 0) {
            addFailedRow(summary, rowNum, `Invalid quantity: ${quantityStr}`);
            logger.warn(formatRowError(rowNum, "Invalid quantity", quantityStr), { row });
            continue;
          }

          // Parse date (default to now if missing)
          const entryDate = safeDate(dateStr) || new Date();
          
          // Log the date parsing for debugging
          if (dateStr) {
            logger.debug(`Row ${rowNum} date parsing: Raw value="${dateStr}" → Parsed date="${entryDate.toISOString().split('T')[0]}"`);
          }

          // Determine entry type (rejection vs rework)
          const typeNorm = normalizeForMatching(typeField).toLowerCase();
          const isRework = typeNorm.includes("rework") || typeNorm.includes("rw");

          logger.debug(`Processing row ${rowNum}`, {
            partNumber,
            code,
            type: isRework ? "rework" : "rejection",
            quantity,
          });

          // Get or create part
          let part = partMap.get(normalizeForMatching(partNumber));
          if (!part) {
            logger.info(`Creating new part: ${partNumber}`);
            if (!dryRun) {
              part = await storage.createPart({
                partNumber,
                description: purpose || partNumber,
                price: 0,
                organizationId: orgId,
              });
              partMap.set(normalizeForMatching(partNumber), part);
              summary.created.parts++;
            } else {
              // In dry run, create a fake part object
              part = { 
                id: -1, 
                partNumber, 
                description: purpose || partNumber,
                price: 0,
                organizationId: orgId
              };
            }
          }

          if (!part) {
            addFailedRow(summary, rowNum, "Failed to get or create part");
            logger.error(formatRowError(rowNum, "Failed to get or create part"), { partNumber });
            continue;
          }

          // Get or create rejection/rework type
          const normalizedCode = normalizeCode(code);

          if (isRework) {
            let reworkType = reworkCodeMap.get(normalizedCode);
            if (!reworkType) {
              logger.info(`Creating new rework type: ${normalizedCode}`);
              if (!dryRun) {
                reworkType = await storage.createReworkType({
                  reworkCode: normalizedCode,
                  reason: purpose || normalizedCode,
                  zone: zone || null,
                  organizationId: orgId,
                });
                reworkCodeMap.set(normalizedCode, reworkType);
                summary.created.reworkTypes++;
              } else {
                reworkType = {
                  id: -1,
                  reworkCode: normalizedCode,
                  reason: purpose || normalizedCode,
                  zone: zone || null,
                  organizationId: orgId,
                };
              }
            }

            if (!reworkType) {
              addFailedRow(summary, rowNum, "Failed to get or create rework type");
              logger.error(formatRowError(rowNum, "Failed to get or create rework type"), { code: normalizedCode });
              continue;
            }

            // Get or create zone if specified
            let zoneId: number | null = null;
            if (!isBlank(zone)) {
              let zoneObj = zoneMap.get(normalizeForMatching(zone));
              if (!zoneObj) {
                logger.info(`Creating new zone: ${zone}`);
                if (!dryRun) {
                  zoneObj = await storage.createZone({
                    name: zone,
                    organizationId: orgId,
                  });
                  zoneMap.set(normalizeForMatching(zone), zoneObj);
                  summary.created.zones++;
                } else {
                  zoneObj = {
                    id: -1,
                    name: zone,
                    organizationId: orgId,
                    createdAt: new Date(),
                  };
                }
              }
              zoneId = zoneObj?.id || null;
            }

            // Create rework entry
            if (!dryRun) {
              await storage.createReworkEntry({
                partId: part.id,
                reworkTypeId: reworkType.id,
                quantity,
                remarks: remarks || null,
                date: entryDate,
                organizationId: orgId,
                createdByUsername: (req.user as User).username ?? (req.user as User).email ?? null,
                zoneId,
              } as any);
            }

            logger.debug(`Rework entry processed for row ${rowNum}`);
          } else {
            // Rejection type
            let rejectionType = rejectionCodeMap.get(normalizedCode);
            if (!rejectionType) {
              logger.info(`Creating new rejection type: ${normalizedCode}`);
              if (!dryRun) {
                rejectionType = await storage.createRejectionType({
                  rejectionCode: normalizedCode,
                  reason: purpose || normalizedCode,
                  type: "rejection",
                  organizationId: orgId,
                });
                rejectionCodeMap.set(normalizedCode, rejectionType);
                summary.created.rejectionTypes++;
              } else {
                rejectionType = {
                  id: -1,
                  rejectionCode: normalizedCode,
                  reason: purpose || normalizedCode,
                  type: "rejection",
                  organizationId: orgId,
                };
              }
            }

            if (!rejectionType) {
              addFailedRow(summary, rowNum, "Failed to get or create rejection type");
              logger.error(formatRowError(rowNum, "Failed to get or create rejection type"), { code: normalizedCode });
              continue;
            }

            // Get or create zone if specified
            let zoneId: number | null = null;
            if (!isBlank(zone)) {
              let zoneObj = zoneMap.get(normalizeForMatching(zone));
              if (!zoneObj) {
                logger.info(`Creating new zone: ${zone}`);
                if (!dryRun) {
                  zoneObj = await storage.createZone({
                    name: zone,
                    organizationId: orgId,
                  });
                  zoneMap.set(normalizeForMatching(zone), zoneObj);
                  summary.created.zones++;
                } else {
                  zoneObj = {
                    id: -1,
                    name: zone,
                    organizationId: orgId,
                    createdAt: new Date(),
                  };
                }
              }
              zoneId = zoneObj?.id || null;
            }

            // Create rejection entry
            if (!dryRun) {
              await storage.createRejectionEntry({
                partId: part.id,
                rejectionTypeId: rejectionType.id,
                quantity,
                remarks: remarks || null,
                date: entryDate,
                organizationId: orgId,
                createdByUsername: (req.user as User).username ?? (req.user as User).email ?? null,
                zoneId,
              } as any);
            }

            logger.debug(`Rejection entry processed for row ${rowNum}`);
          }

          summary.successfulImports++;
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          addFailedRow(summary, rowNum, errorMsg);
          logger.error(formatRowError(rowNum, "Exception during processing", errorMsg), { 
            error: err, 
            row 
          });
        }
      }

      if (dryRun) {
        logger.info("DRY RUN COMPLETE - No data was inserted");
        addWarning(summary, "This was a dry run - no data was actually imported");
      } else {
        logger.info(`Import complete`, {
          successful: summary.successfulImports,
          failed: summary.failedRows.length,
          created: summary.created,
        });
      }

      res.json({
        success: true,
        message: dryRun 
          ? `Dry run: Would import ${summary.successfulImports} of ${summary.totalRows} rows`
          : `Imported ${summary.successfulImports} of ${summary.totalRows} rows`,
        summary,
        logs: logger.getLogs(),
      });
    } catch (err) {
      logger.error("Import failed with fatal error", { error: err });
      res.status(500).json({
        success: false,
        message: err instanceof Error ? err.message : "Import failed",
        summary,
        logs: logger.getLogs(),
      });
    }
  });

  // Cancel an ongoing import
  app.post("/api/import-entries/:id/cancel", isAdmin, (req, res) => {
    const importId = getParamString(req.params.id);
    const importState = activeImports.get(importId);

    if (!importState) {
      return res.status(404).json({
        success: false,
        message: "Import not found or already completed",
      });
    }

    importState.cancelled = true;
    res.json({
      success: true,
      message: "Import cancellation requested. Current row processing will halt.",
      importId,
    });
  });

  return httpServer;
}
