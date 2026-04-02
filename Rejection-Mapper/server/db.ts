import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import dns from "dns/promises";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
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

    -- Composite index for fast duplicate detection on rejection entries
    CREATE INDEX IF NOT EXISTS "IDX_rejection_entries_dup_check"
      ON "rejection_entries" ("organization_id", "part_id", "rejection_type_id", "quantity", "date");

    -- Composite index for fast duplicate detection on rework entries
    CREATE INDEX IF NOT EXISTS "IDX_rework_entries_dup_check"
      ON "rework_entries" ("organization_id", "part_id", "rework_type_id", "quantity", "date");

    -- Indexes for rejection_entries: speed up date-range filters, org scoping, and joins
    CREATE INDEX IF NOT EXISTS "IDX_rejection_entries_org_date"
      ON "rejection_entries" ("organization_id", "date" DESC);
    CREATE INDEX IF NOT EXISTS "IDX_rejection_entries_part_id"
      ON "rejection_entries" ("part_id");
    CREATE INDEX IF NOT EXISTS "IDX_rejection_entries_rejection_type_id"
      ON "rejection_entries" ("rejection_type_id");
    CREATE INDEX IF NOT EXISTS "IDX_rejection_entries_zone_id"
      ON "rejection_entries" ("zone_id");

    -- Indexes for rework_entries: same pattern
    CREATE INDEX IF NOT EXISTS "IDX_rework_entries_org_date"
      ON "rework_entries" ("organization_id", "date" DESC);
    CREATE INDEX IF NOT EXISTS "IDX_rework_entries_part_id"
      ON "rework_entries" ("part_id");
    CREATE INDEX IF NOT EXISTS "IDX_rework_entries_rework_type_id"
      ON "rework_entries" ("rework_type_id");
    CREATE INDEX IF NOT EXISTS "IDX_rework_entries_zone_id"
      ON "rework_entries" ("zone_id");

    -- Indexes for parts and types lookups used during import matching
    CREATE INDEX IF NOT EXISTS "IDX_parts_org_id"
      ON "parts" ("organization_id");
    CREATE INDEX IF NOT EXISTS "IDX_rejection_types_org_id"
      ON "rejection_types" ("organization_id");
    CREATE INDEX IF NOT EXISTS "IDX_rework_types_org_id"
      ON "rework_types" ("organization_id");
    CREATE INDEX IF NOT EXISTS "IDX_zones_org_id"
      ON "zones" ("organization_id");

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

    CREATE TABLE IF NOT EXISTS "invite_tokens" (
      "id" serial PRIMARY KEY,
      "user_id" integer NOT NULL REFERENCES "users"("id"),
      "token" text NOT NULL UNIQUE,
      "expires_at" timestamp NOT NULL,
      "used_at" timestamp
    );

    CREATE TABLE IF NOT EXISTS "zones" (
      "id" serial PRIMARY KEY,
      "name" text NOT NULL,
      "organization_id" integer REFERENCES "organizations"("id"),
      "created_at" timestamp NOT NULL DEFAULT now()
    );

    ALTER TABLE "rejection_entries" ADD COLUMN IF NOT EXISTS "rate" double precision;
    ALTER TABLE "rejection_entries" ADD COLUMN IF NOT EXISTS "amount" double precision;
    ALTER TABLE "rejection_entries" ADD COLUMN IF NOT EXISTS "process" text;
    ALTER TABLE "rejection_entries" ADD COLUMN IF NOT EXISTS "rejection_reason_code" text;
    ALTER TABLE "rejection_entries" ADD COLUMN IF NOT EXISTS "rejection_reason" text;
    ALTER TABLE "rejection_entries" ADD COLUMN IF NOT EXISTS "imported_at" timestamp;
    ALTER TABLE "rejection_entries" ADD COLUMN IF NOT EXISTS "zone_id" integer REFERENCES "zones"("id");
    ALTER TABLE "rejection_entries" ADD COLUMN IF NOT EXISTS "logged_by_user_id" integer REFERENCES "users"("id");
    ALTER TABLE "rejection_entries" ADD COLUMN IF NOT EXISTS "created_by_username" text;

      ALTER TABLE "rework_types" ADD COLUMN IF NOT EXISTS "zone" text;

    ALTER TABLE "rework_entries" ADD COLUMN IF NOT EXISTS "rate" double precision;
    ALTER TABLE "rework_entries" ADD COLUMN IF NOT EXISTS "amount" double precision;
    ALTER TABLE "rework_entries" ADD COLUMN IF NOT EXISTS "process" text;
    ALTER TABLE "rework_entries" ADD COLUMN IF NOT EXISTS "imported_at" timestamp;
    ALTER TABLE "rework_entries" ADD COLUMN IF NOT EXISTS "zone_id" integer REFERENCES "zones"("id");
    ALTER TABLE "rework_entries" ADD COLUMN IF NOT EXISTS "logged_by_user_id" integer REFERENCES "users"("id");
    ALTER TABLE "rework_entries" ADD COLUMN IF NOT EXISTS "created_by_username" text;

    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" text NOT NULL DEFAULT 'employee';
    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "username" text;
    ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;

    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_username_unique') THEN
        ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE ("username");
      END IF;
    END $$;

    DO $$
    DECLARE
      current_delete_rule text;
    BEGIN
      SELECT rc.delete_rule INTO current_delete_rule
      FROM information_schema.referential_constraints rc
      JOIN information_schema.table_constraints tc
        ON rc.constraint_name = tc.constraint_name
       AND rc.constraint_schema = tc.constraint_schema
      WHERE tc.table_name = 'invite_tokens'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND tc.constraint_name = 'invite_tokens_user_id_fkey';

      IF current_delete_rule IS DISTINCT FROM 'CASCADE' THEN
        BEGIN
          ALTER TABLE "invite_tokens" DROP CONSTRAINT IF EXISTS "invite_tokens_user_id_fkey";
        EXCEPTION WHEN undefined_table THEN
          NULL;
        END;

        ALTER TABLE "invite_tokens"
          ADD CONSTRAINT "invite_tokens_user_id_fkey"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
      END IF;
    END $$;

    DO $$
    DECLARE
      current_delete_rule text;
    BEGIN
      SELECT rc.delete_rule INTO current_delete_rule
      FROM information_schema.referential_constraints rc
      JOIN information_schema.table_constraints tc
        ON rc.constraint_name = tc.constraint_name
       AND rc.constraint_schema = tc.constraint_schema
      WHERE tc.table_name = 'password_reset_tokens'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND tc.constraint_name = 'password_reset_tokens_user_id_fkey';

      IF current_delete_rule IS DISTINCT FROM 'CASCADE' THEN
        BEGIN
          ALTER TABLE "password_reset_tokens" DROP CONSTRAINT IF EXISTS "password_reset_tokens_user_id_fkey";
        EXCEPTION WHEN undefined_table THEN
          NULL;
        END;

        ALTER TABLE "password_reset_tokens"
          ADD CONSTRAINT "password_reset_tokens_user_id_fkey"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
      END IF;
    END $$;

    UPDATE "users" SET "role" = 'admin'
    WHERE "id" IN (
      SELECT MIN("id") FROM "users" WHERE "organization_id" IS NOT NULL GROUP BY "organization_id"
    ) AND "role" = 'employee';
  `);

  // Run column additions individually so a failure in the block above
  // (or a previously-partial migration) cannot leave these columns missing.
  const columnMigrations = [
    `ALTER TABLE "rejection_entries" ADD COLUMN IF NOT EXISTS "logged_by_user_id" integer REFERENCES "users"("id")`,
    `ALTER TABLE "rejection_entries" ADD COLUMN IF NOT EXISTS "created_by_username" text`,
    `ALTER TABLE "rework_entries" ADD COLUMN IF NOT EXISTS "logged_by_user_id" integer REFERENCES "users"("id")`,
    `ALTER TABLE "rework_entries" ADD COLUMN IF NOT EXISTS "created_by_username" text`,
    // Fix existing rework types where the code is a zone shorthand (Z1, Z2...)
    // and the reason contains the real description — promote reason to be the code.
    // This corrects old imports done before the Z1→CHAMFER NG fix.
    `UPDATE "rework_types"
       SET "rework_code" = UPPER(TRIM("reason")),
           "reason" = UPPER(TRIM("reason"))
     WHERE "reason" IS NOT NULL
       AND "reason" != ''
       AND "reason" != "rework_code"
       AND "rework_code" ~ '^Z[0-9]{1,2}$'`,
    `UPDATE "rejection_types"
       SET "rejection_code" = UPPER(TRIM("reason")),
           "reason" = UPPER(TRIM("reason"))
     WHERE "reason" IS NOT NULL
       AND "reason" != ''
       AND "reason" != "rejection_code"
       AND "rejection_code" ~ '^Z[0-9]{1,2}$'`,
    // Ensure no null/empty reasons remain
    `UPDATE "rework_types" SET "reason" = "rework_code" WHERE "reason" IS NULL OR "reason" = ''`,
    `UPDATE "rejection_types" SET "reason" = "rejection_code" WHERE "reason" IS NULL OR "reason" = ''`,
  ];
  for (const sql of columnMigrations) {
    try {
      await pool.query(sql);
    } catch (err: any) {
      console.warn("[db] Column migration skipped:", err.message);
    }
  }

  console.log(`[db] Pool ready (host: ${parsed.hostname})`);
}
