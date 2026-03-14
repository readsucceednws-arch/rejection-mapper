# RejectMap

A manufacturing parts rejection tracking web app built with React, Express, and PostgreSQL (Drizzle ORM).

## Architecture

- **Frontend**: React + Vite, TanStack Query, shadcn/ui, Recharts, wouter
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL via Drizzle ORM
- **Auth**: Passport.js (local strategy) + express-session + connect-pg-simple

## Features

- Log rejection and rework entries for parts (multi-entry per submission, per-entry zone selection)
- Manage parts with prices
- Manage rejection reason codes
- Manage rework type codes
- **Manage Zones**: Create/rename/delete production zones (e.g. Assembly Line A, Paint Shop)
- Zone selection per entry item in Log Entry form
- Dashboard with analytics: Overview KPIs, Part Analysis, Monthly Trends, Cost Analysis, Zone Analysis
- Recent Entries with All/Rejections/Reworks tabs
- Email + password login (session-based, protected routes)
- **Multi-tenant organizations**: Each org has isolated data; team members share one org via invite code
- Worker invite via email (48-hour activation link, Resend)

## Database Tables

- `organizations` — org name + invite code for team access
- `parts` — part numbers, descriptions, prices (per org)
- `rejection_types` — rejection reason codes (per org); `type` field stores "rejection"/"rework"
- `rejection_entries` — logged rejection/rework events (per org); includes rate, amount, process, rejectionReasonCode, rejectionReason, importedAt, zoneId
- `rework_types` — dedicated rework type codes (per org)
- `rework_entries` — dedicated rework log entries (per org); includes rate, amount, process, importedAt, zoneId
- `zones` — production zones (per org); referenced by rejection_entries and rework_entries
- `users` — email + hashed password + organizationId
- `password_reset_tokens` — secure tokens for password reset emails (1-hour expiry)
- `invite_tokens` — secure tokens for worker invite emails (48-hour expiry)
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

## Email (Invite & Password Reset)

- **Worker invite flow**: When an admin adds a team member, a secure invite token is generated (48-hour expiry), stored in `invite_tokens`, and an activation email is sent via Resend. The worker clicks the link, sets their own password, and is automatically signed in. No plain-text password is ever shared.
- **Password reset**: Secure token-based reset links via Resend (1-hour expiry).
- **Resend is required for worker invites**: If `RESEND_API_KEY` is not configured, the Add Member action returns a clear error to the admin — it does not silently fail.
- **Password reset fallback**: If no `RESEND_API_KEY`, reset links are printed to server console (dev mode).
- Set `RESEND_FROM_EMAIL` secret to customize the from address.
- Public API routes: `GET /api/invite/:token` (validate token), `POST /api/activate` (set password + sign in).

## Existing Data

- Default organization (invite code: `DEFAULT1`) holds seed data: 64 parts, 65 rejection types, 59 rework types
