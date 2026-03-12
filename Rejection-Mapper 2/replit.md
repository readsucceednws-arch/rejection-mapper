# RejectMap

A manufacturing parts rejection tracking web app built with React, Express, and PostgreSQL (Drizzle ORM).

## Architecture

- **Frontend**: React + Vite, TanStack Query, shadcn/ui, Recharts, wouter
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL via Drizzle ORM
- **Auth**: Passport.js (local strategy) + express-session + connect-pg-simple

## Features

- Log rejection and rework entries for parts (multi-entry per submission)
- Manage parts with prices
- Manage rejection reason codes
- Manage rework type codes
- Dashboard with analytics: Overview KPIs, Part Analysis, Monthly Trends, Cost Analysis
- Recent Entries with All/Rejections/Reworks tabs
- Email + password login (session-based, protected routes)
- **Multi-tenant organizations**: Each org has isolated data; team members share one org via invite code

## Database Tables

- `organizations` — org name + invite code for team access
- `parts` — part numbers, descriptions, prices (per org)
- `rejection_types` — rejection reason codes (per org)
- `rejection_entries` — logged rejection/rework events (per org)
- `rework_types` — dedicated rework type codes (per org)
- `rework_entries` — dedicated rework log entries (per org)
- `users` — email + hashed password + organizationId
- `session` — express-session storage (pre-created manually)

## Key Files

- `shared/schema.ts` — Drizzle schema + Zod types
- `shared/routes.ts` — API contract definitions
- `server/storage.ts` — database CRUD interface (all methods take organizationId)
- `server/routes.ts` — Express API routes (all protected; orgId injected from req.user)
- `server/auth.ts` — passport strategy, password hashing, isAuthenticated middleware
- `server/index.ts` — Express server + session + passport setup
- `client/src/App.tsx` — routing with auth guard
- `client/src/hooks/use-auth.ts` — useUser, useLogin, useCreateOrg, useJoinOrg, useLogout hooks
- `client/src/pages/login.tsx` — 3-mode login page (sign in / create org / join org)

## Auth & Multi-Tenancy Notes

- Registration flow: Create Organization (new team) or Join Organization (invite code)
- Invite code shown after org creation; also visible in sidebar footer
- All data queries are filtered by organizationId from the logged-in user's session
- Passwords hashed with Node crypto.scrypt
- Sessions stored in PostgreSQL, 30-day expiry
- Session store uses shared pool (not a separate connection) to avoid ENOTFOUND errors in production

## Email (Forgot Password)

- The forgot password feature sends reset links via **Resend** if a `RESEND_API_KEY` secret is set
- If no API key is set, the reset link is printed to the server console (dev mode fallback)
- Set `RESEND_FROM_EMAIL` secret to customize the from address (defaults to `noreply@rejectmap.app`)
- **NOTE**: Resend integration was dismissed by user — they must provide `RESEND_API_KEY` manually as a secret, OR connect the Resend integration in a future session. The `server/email.ts` module gracefully falls back to console logging if the key is absent.

## Existing Data

- Default organization (invite code: `DEFAULT1`) holds seed data: 64 parts, 65 rejection types, 59 rework types
