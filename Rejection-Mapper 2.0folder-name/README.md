# Rejection-Mapper

A manufacturing parts rejection tracking web app built with React, Express, and PostgreSQL (Drizzle ORM).

## Main Repository

🔗 **[https://github.com/readsucceednws-arch/rejection-mapper](https://github.com/readsucceednws-arch/rejection-mapper)**

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

## Project Structure

```
├── client/        # React frontend (Vite)
├── server/        # Express.js backend
├── shared/        # Shared schema and types (Drizzle ORM + Zod)
└── script/        # Utility scripts
```

## Getting Started

See [`replit.md`](./replit.md) for full documentation including database tables, key files, auth notes, and email configuration.
# Jira Clone — Integration Guide

## Files to add to your project

### 1. Shared schema
Copy `shared/schema-jira.ts` → `folder-name/shared/schema-jira.ts`

### 2. Server routes
Copy `server/routes/jira.ts` → `folder-name/server/routes/jira.ts`

Then register in your existing `server/routes.ts` (or wherever routes are registered):
```ts
import jiraRouter from "./routes/jira";
app.use("/api", jiraRouter);
```

### 3. Client hooks
Copy `client/src/hooks/use-jira.ts` → `folder-name/client/src/hooks/use-jira.ts`

### 4. Client components
Copy these to `folder-name/client/src/components/`:
- `client/src/components/jira-sidebar.tsx`
- `client/src/components/create-issue-modal.tsx`
- `client/src/components/issue-detail.tsx`

### 5. Client pages
Copy these to `folder-name/client/src/pages/`:
- `client/src/pages/board.tsx`
- `client/src/pages/backlog.tsx`
- `client/src/pages/issues.tsx`
- `client/src/pages/create-project.tsx`

### 6. Replace App.tsx
Replace `folder-name/client/src/App.tsx` with the new version.

### 7. Run the migration SQL
Run `migration.sql` in your Neon dashboard SQL editor.

## Routes added
| URL | Page |
|-----|------|
| `/projects/new` | Create project |
| `/projects/:id/board` | Kanban board |
| `/projects/:id/backlog` | Backlog |
| `/projects/:id/issues` | Issues list |

## First time setup
After deploying, you'll need to create a workspace + add yourself as a member.
You can do this via the API:
```
POST /api/workspaces  { name: "My Workspace", slug: "my-workspace" }
```
Or add a seed endpoint temporarily.

## Notes
- Auth reuses your existing session/passport setup — no changes needed
- DB reuses your existing Neon connection via `../db`
- All routes are protected by `isAuthenticated` middleware
