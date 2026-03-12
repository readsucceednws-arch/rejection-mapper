import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import dns from "dns/promises";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

export let pool: pg.Pool;
export let db: ReturnType<typeof drizzle>;

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
  const resolvedUrl = await resolveConnectionString(process.env.DATABASE_URL!);

  // Parse the URL to detect if it's a localhost connection (needs ssl rejectUnauthorized: false
  // because Replit's local Neon proxy presents a Neon cert that won't match 'localhost').
  const parsed = new URL(resolvedUrl);
  const isLocalhost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";

  pool = new Pool({
    connectionString: resolvedUrl,
    ssl: isLocalhost ? { rejectUnauthorized: false } : undefined,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    idleTimeoutMillis: 0,
    max: 10,
  });

  pool.on("error", (err) => {
    console.error("[db] Pool error:", err.message);
  });

  db = drizzle(pool, { schema });

  // Ensure all required tables exist (safe to run repeatedly — all are IF NOT EXISTS)
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
      "created_at" timestamp NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS "users" (
      "id" serial PRIMARY KEY,
      "email" text UNIQUE,
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
      "price" double precision NOT NULL DEFAULT 0,
      "organization_id" integer REFERENCES "organizations"("id")
    );

    CREATE TABLE IF NOT EXISTS "rejection_types" (
      "id" serial PRIMARY KEY,
      "rejection_code" text NOT NULL,
      "reason" text NOT NULL,
      "type" text NOT NULL DEFAULT 'rejection',
      "organization_id" integer REFERENCES "organizations"("id")
    );

    CREATE TABLE IF NOT EXISTS "rejection_entries" (
      "id" serial PRIMARY KEY,
      "part_id" integer NOT NULL REFERENCES "parts"("id"),
      "rejection_type_id" integer NOT NULL REFERENCES "rejection_types"("id"),
      "quantity" integer NOT NULL DEFAULT 1,
      "remarks" text,
      "date" timestamp NOT NULL DEFAULT now(),
      "organization_id" integer REFERENCES "organizations"("id")
    );

    CREATE TABLE IF NOT EXISTS "rework_types" (
      "id" serial PRIMARY KEY,
      "rework_code" text NOT NULL,
      "reason" text NOT NULL,
      "organization_id" integer REFERENCES "organizations"("id")
    );

    CREATE TABLE IF NOT EXISTS "rework_entries" (
      "id" serial PRIMARY KEY,
      "part_id" integer NOT NULL REFERENCES "parts"("id"),
      "rework_type_id" integer NOT NULL REFERENCES "rework_types"("id"),
      "quantity" integer NOT NULL DEFAULT 1,
      "remarks" text,
      "date" timestamp NOT NULL DEFAULT now(),
      "organization_id" integer REFERENCES "organizations"("id")
    );

    CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
      "id" serial PRIMARY KEY,
      "user_id" integer NOT NULL REFERENCES "users"("id"),
      "token" text NOT NULL UNIQUE,
      "expires_at" timestamp NOT NULL,
      "used_at" timestamp
    );

    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" text NOT NULL DEFAULT 'employee';
    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "username" text;
    ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;

    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_username_unique') THEN
        ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE ("username");
      END IF;
    END $$;

    UPDATE "users" SET "role" = 'admin'
    WHERE "id" IN (
      SELECT MIN("id") FROM "users" WHERE "organization_id" IS NOT NULL GROUP BY "organization_id"
    ) AND "role" = 'employee';
  `);

  console.log(`[db] Pool ready (host: ${parsed.hostname})`);
}
