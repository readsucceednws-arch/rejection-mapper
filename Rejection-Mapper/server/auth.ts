import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { storage } from "./storage";
import type { User } from "@shared/schema";
import type { Express, Request, Response, NextFunction } from "express";

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function comparePassword(supplied: string, stored: string): Promise<boolean> {
  const [hashed, salt] = stored.split(".");
  if (!hashed || !salt) return false;
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function getGoogleCallbackURL(): string {
  if (process.env.GOOGLE_CALLBACK_URL) return process.env.GOOGLE_CALLBACK_URL;
  const domains = process.env.REPLIT_DOMAINS?.split(",") ?? [];
  const prodDomain = domains.find((d) => d.endsWith(".replit.app"));
  const domain = prodDomain ?? domains[0];
  if (domain) return `https://${domain}/api/auth/google/callback`;
  return "http://localhost:5000/api/auth/google/callback";
}

export function setupPassport() {
  passport.use(
    new LocalStrategy({ usernameField: "identifier" }, async (identifier, password, done) => {
      try {
        const id = identifier.trim().toLowerCase();
        const user = id.includes("@")
          ? await storage.getUserByEmail(id)
          : await storage.getUserByUsername(id);
        if (!user) return done(null, false, { message: "Invalid credentials" });
        const valid = await comparePassword(password, user.password);
        if (!valid) return done(null, false, { message: "Invalid credentials" });
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    })
  );

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL: getGoogleCallbackURL(),
          scope: ["profile", "email"],
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const email = profile.emails?.[0]?.value;
            if (!email) return done(null, false);

            const existing = await storage.getUserByEmail(email);
            if (existing) return done(null, existing);

            const orgName = profile.displayName || email.split("@")[0] || "My Organization";
            const org = await storage.createOrganization(orgName);
            const placeholderPassword = `google_oauth_${randomBytes(16).toString("hex")}`;
            const user = await storage.createUser({
              email,
              password: placeholderPassword,
              role: "admin",
              organizationId: org.id,
            });

            (user as any).__newOrgInviteCode = org.inviteCode;
            return done(null, user);
          } catch (err) {
            return done(err as Error);
          }
        }
      )
    );
  }

  passport.serializeUser((user: any, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUserById(id);
      done(null, user ?? false);
    } catch (err) {
      done(err);
    }
  });
}

export function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ message: "Unauthorized" });
}

export function isGoogleAuthEnabled(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}
