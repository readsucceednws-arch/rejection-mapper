import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import dns from "dns/promises";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

// Debug: Log the DATABASE_URL format (without password)
console.log("[db] DATABASE_URL format check:", 
  process.env.DATABASE_URL ? "Present" : "Missing");
if (process.env.DATABASE_URL) {
  const url = new URL(process.env.DATABASE_URL);
  console.log("[db] Connection info:", {
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port,
    database: url.pathname,
    hasSSL: url.searchParams.has('sslmode')
  });
}

export let pool: pg.Pool;
export let db: NodePgDatabase<typeof schema>;

// Only resolve single-word internal hostnames like 'helium' (the dev DB host).
// Skip localhost, IPs, and public domain names — those don't need DNS pre-resolution
// and resolving them breaks SSL certificate verification in production.
async function resolveConnectionString(url: string): Promise<string> {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const isInternalHostname =
      !host.includes(".") &&
      host !== "localhost" &&
      !/^\d{1,3}(\.\d{1,3}){3}$/.test(host);

    if (isInternalHostname) {
      const [ip] = await dns.resolve4(host);
      parsed.hostname = ip;
      console.log(`[db] Resolved internal host '${host}' → ${ip}`);
      return parsed.href;
    }
  } catch (e: any) {
    console.warn("[db] Could not resolve DB hostname:", e.message);
  }
  return url;
}

export async function initDb(): Promise<void> {
  try {
    console.log("[db] Starting database initialization...");
    const resolvedUrl = await resolveConnectionString(process.env.DATABASE_URL!);
    console.log("[db] URL resolved successfully");

    // Parse the URL to detect if it's a localhost connection (needs ssl rejectUnauthorized: false
    // because Replit's local Neon proxy presents a Neon cert that won't match 'localhost').
    const parsed = new URL(resolvedUrl);
    const isLocalhost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";

    console.log("[db] Creating pool with config:", {
      hostname: parsed.hostname,
      isLocalhost,
      hasSSL: !isLocalhost
    });

    pool = new Pool({
      connectionString: resolvedUrl,
      ssl: { rejectUnauthorized: false },
    });

    console.log("[db] Pool created, testing connection...");
    
    // Test the connection
    const testResult = await pool.query('SELECT 1 as test');
    console.log("[db] Connection test successful:", testResult.rows[0]);

    db = drizzle(pool, { schema });
    console.log("[db] Drizzle ORM initialized");
  } catch (error: any) {
    console.error("[db] Database initialization failed:", error);
    console.error("[db] Error details:", {
      message: error.message,
      code: error.code,
      severity: error.severity,
      detail: error.detail,
      hint: error.hint
    });
    throw error;
  }
}

export async function migrateDb() {
  if (!pool) {
    throw new Error("Database pool not initialized. Call initDb() first.");
  }

  console.log("[db] Running database migrations...");

  try {
    // Create all required tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL,
        CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
      );
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

      CREATE TABLE IF NOT EXISTS "organizations" (
        "id" serial PRIMARY KEY,
        "name" text NOT NULL,
        "invite_code" text NOT NULL UNIQUE,
        "template_id" text DEFAULT 'manufacturing',
        "settings" jsonb,
        "created_at" timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS "users" (
        "id" serial PRIMARY KEY,
        "email" text,
        "username" text UNIQUE,
        "password" text NOT NULL,
        "role" text NOT NULL DEFAULT 'employee',
        "organization_id" integer REFERENCES "organizations"("id"),
        "created_at" timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS "parts" (
        "id" serial PRIMARY KEY,
        "part_number" text NOT NULL,
        "description" text,
        "organization_id" integer REFERENCES "organizations"("id")
      );

      CREATE TABLE IF NOT EXISTS "zones" (
        "id" serial PRIMARY KEY,
        "name" text NOT NULL,
        "organization_id" integer REFERENCES "organizations"("id"),
        "created_at" timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS "rejection_types" (
        "id" serial PRIMARY KEY,
        "rejection_code" text NOT NULL,
        "reason" text NOT NULL,
        "organization_id" integer REFERENCES "organizations"("id")
      );

      CREATE TABLE IF NOT EXISTS "rework_types" (
        "id" serial PRIMARY KEY,
        "rework_code" text NOT NULL,
        "reason" text NOT NULL,
        "zone" text,
        "organization_id" integer REFERENCES "organizations"("id")
      );

      CREATE TABLE IF NOT EXISTS "rejection_entries" (
        "id" serial PRIMARY KEY,
        "part_id" integer NOT NULL REFERENCES "parts"("id"),
        "rejection_type_id" integer NOT NULL REFERENCES "rejection_types"("id"),
        "quantity" integer NOT NULL,
        "date" timestamp NOT NULL DEFAULT now(),
        "remarks" text,
        "rate" double precision,
        "amount" double precision,
        "process" text,
        "rejection_reason_code" text,
        "rejection_reason" text,
        "imported_at" timestamp,
        "zone_id" integer REFERENCES "zones"("id"),
        "logged_by_user_id" integer REFERENCES "users"("id"),
        "created_by_username" text,
        "organization_id" integer REFERENCES "organizations"("id")
      );

      CREATE TABLE IF NOT EXISTS "rework_entries" (
        "id" serial PRIMARY KEY,
        "part_id" integer NOT NULL REFERENCES "parts"("id"),
        "rework_type_id" integer NOT NULL REFERENCES "rework_types"("id"),
        "quantity" integer NOT NULL,
        "date" timestamp NOT NULL DEFAULT now(),
        "remarks" text,
        "rate" double precision,
        "amount" double precision,
        "process" text,
        "imported_at" timestamp,
        "zone_id" integer REFERENCES "zones"("id"),
        "logged_by_user_id" integer REFERENCES "users"("id"),
        "created_by_username" text,
        "organization_id" integer REFERENCES "organizations"("id")
      );

      CREATE TABLE IF NOT EXISTS "issue_entries" (
        "id" serial PRIMARY KEY,
        "part_number" text NOT NULL,
        "zone" text,
        "type" text NOT NULL,
        "quantity" integer NOT NULL DEFAULT 1,
        "date" timestamp NOT NULL DEFAULT now(),
        "remarks" text,
        "organization_id" integer REFERENCES "organizations"("id"),
        "created_by_username" text,
        "imported_at" timestamp,
        "entry_type" text NOT NULL
      );

      CREATE TABLE IF NOT EXISTS "templates" (
        "id" text PRIMARY KEY,
        "name" text NOT NULL,
        "description" text,
        "labels" jsonb NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
        "id" serial PRIMARY KEY,
        "user_id" integer NOT NULL REFERENCES "users"("id"),
        "token" text NOT NULL UNIQUE,
        "expires_at" timestamp NOT NULL,
        "used_at" timestamp
      );

      CREATE TABLE IF NOT EXISTS "invite_tokens" (
        "id" serial PRIMARY KEY,
        "user_id" integer NOT NULL REFERENCES "users"("id"),
        "token" text NOT NULL UNIQUE,
        "expires_at" timestamp NOT NULL,
        "used_at" timestamp
      );
    `);

    // Add indexes for performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS "IDX_rejection_entries_org_id" ON "rejection_entries" ("organization_id");
      CREATE INDEX IF NOT EXISTS "IDX_rework_entries_org_id" ON "rework_entries" ("organization_id");
      CREATE INDEX IF NOT EXISTS "IDX_issue_entries_org_id" ON "issue_entries" ("organization_id");
      CREATE INDEX IF NOT EXISTS "IDX_zones_org_id" ON "zones" ("organization_id");
    `);

    // Add constraints
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_username_unique') THEN
          ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE ("username");
        END IF;
      END $$;
    `);

    // Insert default templates
    await pool.query(`
      INSERT INTO "templates" ("id", "name", "description", "labels") VALUES 
        ('manufacturing', 'Manufacturing', 'For manufacturing and production environments', '{"zone": "Zone", "partNumber": "Part Number", "type": "Issue Type", "quantity": "Quantity"}'),
        ('bakery', 'Bakery', 'For bakery and food service businesses', '{"zone": "Kitchen Area", "partNumber": "Product Name", "type": "Quality Issue", "quantity": "Quantity"}')
      ON CONFLICT ("id") DO NOTHING;
    `);

    console.log("[db] Database migrations completed successfully");
  } catch (error: any) {
    console.error("[db] Migration failed:", error);
    throw error;
  }
}
