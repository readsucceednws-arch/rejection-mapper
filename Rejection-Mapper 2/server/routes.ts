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

function isAdmin(req: any, res: any, next: any) {
  if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
  const user = req.user as User;
  if (user.role !== "admin") return res.status(403).json({ message: "Admin access required" });
  next();
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
      const user = req.user as User;
      const org = await storage.getOrganizationById(user.organizationId);
      if (!org) return res.status(404).json({ message: "Organisation not found" });
      await sendInviteEmail(email, org.inviteCode, org.name, user.email);
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
      const { token } = req.params;
      const user = await storage.getUserByInviteToken(token);
      if (!user) return res.status(400).json({ message: "This invite link is invalid or has expired." });
      const org = await storage.getOrganizationById(user.organizationId!);
      res.json({ username: user.username, email: user.email, orgName: org?.name ?? "" });
    } catch (err) { next(err); }
  });

  app.post("/api/activate", async (req, res, next) => {
    try {
      const { token, password } = z.object({
        token: z.string().min(1),
        password: z.string().min(6, "Password must be at least 6 characters"),
      }).parse(req.body);

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
      const user = req.user as User;
      const members = await storage.getUsersByOrganization(user.organizationId);
      res.json(members.map(({ password: _, ...m }) => m));
    } catch (err) { next(err); }
  });

  app.post("/api/members", isAdmin, async (req, res, next) => {
    try {
      const user = req.user as User;
      const { email, username } = z.object({
        email: z.string().email("Enter a valid email address"),
        username: z.string().min(2, "Username must be at least 2 characters").regex(/^\S+$/, "Username cannot contain spaces"),
      }).parse(req.body);

      const existingEmail = await storage.getUserByEmail(email);
      if (existingEmail) return res.status(400).json({ message: "An account with that email already exists" });
      const existingUsername = await storage.getUserByUsername(username);
      if (existingUsername) return res.status(400).json({ message: "That username is already taken" });

      const { randomBytes } = await import("crypto");
      const tempPassword = await hashPassword(randomBytes(32).toString("hex"));
      const newUser = await storage.createUser({ email, username, password: tempPassword, organizationId: user.organizationId });

      const token = await storage.createInviteToken(newUser.id);
      const org = await storage.getOrganizationById(user.organizationId);

      try {
        await sendWorkerInviteEmail(email, username, token, org?.name ?? "your organisation");
      } catch (emailErr: any) {
        console.error("[email] Failed to send invite email:", emailErr?.message ?? emailErr);
        await storage.deleteUser(newUser.id, user.organizationId);
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
      const memberId = parseInt(req.params.id, 10);
      if (memberId === user.id) return res.status(400).json({ message: "You cannot remove yourself" });
      await storage.deleteUser(memberId, user.organizationId);
      res.json({ message: "Member removed" });
    } catch (err) { next(err); }
  });

  app.patch("/api/members/:id/password", isAdmin, async (req, res, next) => {
    try {
      const user = req.user as User;
      const memberId = parseInt(req.params.id, 10);
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

  app.post(api.parts.create.path, isAuthenticated, async (req, res) => {
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

  app.put("/api/parts/:id", isAuthenticated, async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const id = parseInt(req.params.id);
      const input = api.parts.create.input.partial().parse(req.body);
      const updated = await storage.updatePart(id, orgId, input);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.delete("/api/parts/:id", isAuthenticated, async (req, res) => {
    const orgId = getOrgId(req);
    await storage.deletePart(parseInt(req.params.id), orgId);
    res.status(204).end();
  });

  // --- REJECTION TYPES ---
  app.get(api.rejectionTypes.list.path, isAuthenticated, async (req, res) => {
    const orgId = getOrgId(req);
    const items = await storage.getRejectionTypes(orgId);
    res.json(items);
  });

  app.post(api.rejectionTypes.create.path, isAuthenticated, async (req, res) => {
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

  app.put("/api/rejection-types/:id", isAuthenticated, async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const id = parseInt(req.params.id);
      const input = api.rejectionTypes.create.input.partial().parse(req.body);
      const updated = await storage.updateRejectionType(id, orgId, input);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.delete("/api/rejection-types/:id", isAuthenticated, async (req, res) => {
    const orgId = getOrgId(req);
    await storage.deleteRejectionType(parseInt(req.params.id), orgId);
    res.status(204).end();
  });

  // --- REJECTION ENTRIES ---
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
      const input = api.rejectionEntries.create.input.parse(req.body);
      const created = await storage.createRejectionEntry({ ...input, organizationId: orgId });
      res.status(201).json(created);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      throw err;
    }
  });

  // --- REWORK TYPES ---
  app.get("/api/rework-types", isAuthenticated, async (req, res) => {
    const orgId = getOrgId(req);
    const items = await storage.getReworkTypes(orgId);
    res.json(items);
  });

  app.post("/api/rework-types", isAuthenticated, async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const { insertReworkTypeSchema } = await import("@shared/schema");
      const input = insertReworkTypeSchema.parse(req.body);
      const created = await storage.createReworkType({ ...input, organizationId: orgId });
      res.status(201).json(created);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      throw err;
    }
  });

  app.put("/api/rework-types/:id", isAuthenticated, async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const id = parseInt(req.params.id);
      const { insertReworkTypeSchema } = await import("@shared/schema");
      const input = insertReworkTypeSchema.partial().parse(req.body);
      const updated = await storage.updateReworkType(id, orgId, input);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.delete("/api/rework-types/:id", isAuthenticated, async (req, res) => {
    const orgId = getOrgId(req);
    await storage.deleteReworkType(parseInt(req.params.id), orgId);
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
      const { insertReworkEntrySchema } = await import("@shared/schema");
      const input = insertReworkEntrySchema.extend({
        partId: z.coerce.number(),
        reworkTypeId: z.coerce.number(),
        quantity: z.coerce.number().default(1),
      }).parse(req.body);
      const created = await storage.createReworkEntry({ ...input, organizationId: orgId });
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
      const filters = {
        startDate: params.startDate as string | undefined,
        endDate: params.endDate as string | undefined,
        type: params.type as string | undefined,
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
      const filters = {
        startDate: params.startDate as string | undefined,
        endDate: params.endDate as string | undefined,
        type: params.type as string | undefined,
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

  return httpServer;
}
