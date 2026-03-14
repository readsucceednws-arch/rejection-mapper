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
