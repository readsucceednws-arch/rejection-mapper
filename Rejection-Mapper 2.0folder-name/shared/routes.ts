import { z } from 'zod';
import {
  insertPartSchema,
  insertRejectionTypeSchema,
  insertRejectionEntrySchema,
  insertReworkEntrySchema,
  insertReworkTypeSchema,
  insertZoneSchema,
  parts,
  rejectionTypes,
  reworkTypes,
  zones,
} from './schema';

// ─── Opaque populated-relation response types ────────────────────────────────
// Drizzle relations produce complex recursive TS types that Zod can't infer
// cleanly — using z.custom<any>() keeps the contract explicit without fighting
// the type system.
const rejectionEntryResponseSchema = z.custom<any>();
const reworkEntryResponseSchema    = z.custom<any>();

// ─── Reusable error shapes ───────────────────────────────────────────────────
export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  unauthorized: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

// ─── API contract ─────────────────────────────────────────────────────────────
export const api = {

  // ── Auth ───────────────────────────────────────────────────────────────────
  auth: {
    me: {
      method: 'GET' as const,
      path: '/api/me' as const,
      responses: {
        200: z.object({
          id: z.number(),
          email: z.string().nullable(),
          username: z.string().nullable(),
          role: z.string(),
          organizationId: z.number().nullable(),
          organizationName: z.string().optional(),
          inviteCode: z.string().optional(),
          createdAt: z.string(),
        }),
        401: errorSchemas.unauthorized,
      },
    },
    hasUsers: {
      method: 'GET' as const,
      path: '/api/has-users' as const,
      responses: {
        200: z.object({ hasUsers: z.boolean() }),
      },
    },
    login: {
      method: 'POST' as const,
      path: '/api/login' as const,
      input: z.object({
        identifier: z.string(),   // email or username
        password: z.string(),
      }),
      responses: {
        200: z.object({ message: z.string() }),
        401: errorSchemas.unauthorized,
      },
    },
    logout: {
      method: 'POST' as const,
      path: '/api/logout' as const,
      responses: {
        200: z.object({ message: z.string() }),
      },
    },
    createOrg: {
      method: 'POST' as const,
      path: '/api/create-org' as const,
      input: z.object({
        orgName: z.string().min(2),
        email: z.string().email(),
        password: z.string().min(6),
      }),
      responses: {
        201: z.object({
          id: z.number(),
          email: z.string().nullable(),
          role: z.string(),
          organizationId: z.number().nullable(),
          organizationName: z.string(),
          inviteCode: z.string(),
        }),
        400: errorSchemas.validation,
      },
    },
    joinOrg: {
      method: 'POST' as const,
      path: '/api/join-org' as const,
      input: z.object({
        inviteCode: z.string(),
        email: z.string().email(),
        username: z.string(),
        password: z.string(),
      }),
      responses: {
        200: z.object({ message: z.string() }),
        400: errorSchemas.validation,
      },
    },
    forgotPassword: {
      method: 'POST' as const,
      path: '/api/forgot-password' as const,
      input: z.object({ email: z.string().email() }),
      responses: {
        200: z.object({ message: z.string() }),
      },
    },
    resetPassword: {
      method: 'POST' as const,
      path: '/api/reset-password' as const,
      input: z.object({
        token: z.string(),
        password: z.string().min(6),
      }),
      responses: {
        200: z.object({ message: z.string() }),
        400: errorSchemas.validation,
      },
    },
    activate: {
      method: 'POST' as const,
      path: '/api/activate' as const,
      input: z.object({ token: z.string() }),
      responses: {
        200: z.object({ message: z.string() }),
        400: errorSchemas.validation,
      },
    },
    getInvite: {
      method: 'GET' as const,
      path: '/api/invite/:token' as const,
      responses: {
        200: z.object({
          username: z.string().nullable(),
          organizationName: z.string(),
        }),
        404: errorSchemas.notFound,
      },
    },
    googleEnabled: {
      method: 'GET' as const,
      path: '/api/auth/google/enabled' as const,
      responses: {
        200: z.object({ enabled: z.boolean() }),
      },
    },
    googleLogin: {
      method: 'GET' as const,
      path: '/api/auth/google' as const,
    },
    googleCallback: {
      method: 'GET' as const,
      path: '/api/auth/google/callback' as const,
    },
    updatePassword: {
      method: 'PATCH' as const,
      path: '/api/profile/password' as const,
      input: z.object({
        currentPassword: z.string(),
        newPassword: z.string().min(6),
      }),
      responses: {
        200: z.object({ message: z.string() }),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
  },

  // ── Team / members ─────────────────────────────────────────────────────────
  members: {
    list: {
      method: 'GET' as const,
      path: '/api/members' as const,
      responses: {
        200: z.array(z.object({
          id: z.number(),
          email: z.string().nullable(),
          username: z.string().nullable(),
          role: z.string(),
          organizationId: z.number().nullable(),
          createdAt: z.string(),
        })),
      },
    },
    invite: {
      method: 'POST' as const,
      path: '/api/members' as const,
      input: z.object({
        email: z.string().email().optional(),
        username: z.string().min(1),
        role: z.enum(['admin', 'employee']).default('employee'),
      }),
      responses: {
        201: z.object({ message: z.string() }),
        400: errorSchemas.validation,
      },
    },
    remove: {
      method: 'DELETE' as const,
      path: '/api/members/:id' as const,
      responses: {
        200: z.object({ message: z.string() }),
        404: errorSchemas.notFound,
      },
    },
    updatePassword: {
      method: 'PATCH' as const,
      path: '/api/members/:id/password' as const,
      input: z.object({ newPassword: z.string().min(6) }),
      responses: {
        200: z.object({ message: z.string() }),
        404: errorSchemas.notFound,
      },
    },
  },

  // ── Invite (worker invite via email) ───────────────────────────────────────
  invite: {
    send: {
      method: 'POST' as const,
      path: '/api/invite' as const,
      input: z.object({
        email: z.string().email(),
        username: z.string().min(1),
      }),
      responses: {
        200: z.object({ message: z.string() }),
        400: errorSchemas.validation,
      },
    },
  },

  // ── Parts ──────────────────────────────────────────────────────────────────
  parts: {
    list: {
      method: 'GET' as const,
      path: '/api/parts' as const,
      responses: {
        200: z.array(z.custom<typeof parts.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/parts' as const,
      input: insertPartSchema,
      responses: {
        201: z.custom<typeof parts.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/parts/:id' as const,
      input: insertPartSchema.partial(),
      responses: {
        200: z.custom<typeof parts.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    remove: {
      method: 'DELETE' as const,
      path: '/api/parts/:id' as const,
      responses: {
        200: z.object({ message: z.string() }),
        404: errorSchemas.notFound,
      },
    },
    bulkDelete: {
      method: 'DELETE' as const,
      path: '/api/parts/bulk' as const,
      input: z.object({ ids: z.array(z.number()) }),
      responses: {
        200: z.object({ message: z.string(), deleted: z.number() }),
      },
    },
  },

  // ── Rejection types ────────────────────────────────────────────────────────
  rejectionTypes: {
    list: {
      method: 'GET' as const,
      path: '/api/rejection-types' as const,
      responses: {
        200: z.array(z.custom<typeof rejectionTypes.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/rejection-types' as const,
      input: insertRejectionTypeSchema,
      responses: {
        201: z.custom<typeof rejectionTypes.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/rejection-types/:id' as const,
      input: insertRejectionTypeSchema.partial(),
      responses: {
        200: z.custom<typeof rejectionTypes.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    remove: {
      method: 'DELETE' as const,
      path: '/api/rejection-types/:id' as const,
      responses: {
        200: z.object({ message: z.string() }),
        404: errorSchemas.notFound,
      },
    },
    bulkDelete: {
      method: 'DELETE' as const,
      path: '/api/rejection-types/bulk' as const,
      input: z.object({ ids: z.array(z.number()) }),
      responses: {
        200: z.object({ message: z.string(), deleted: z.number() }),
      },
    },
  },

  // ── Rework types ───────────────────────────────────────────────────────────
  reworkTypes: {
    list: {
      method: 'GET' as const,
      path: '/api/rework-types' as const,
      responses: {
        200: z.array(z.custom<typeof reworkTypes.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/rework-types' as const,
      input: insertReworkTypeSchema,
      responses: {
        201: z.custom<typeof reworkTypes.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/rework-types/:id' as const,
      input: insertReworkTypeSchema.partial(),
      responses: {
        200: z.custom<typeof reworkTypes.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    remove: {
      method: 'DELETE' as const,
      path: '/api/rework-types/:id' as const,
      responses: {
        200: z.object({ message: z.string() }),
        404: errorSchemas.notFound,
      },
    },
    bulkDelete: {
      method: 'DELETE' as const,
      path: '/api/rework-types/bulk' as const,
      input: z.object({ ids: z.array(z.number()) }),
      responses: {
        200: z.object({ message: z.string(), deleted: z.number() }),
      },
    },
  },

  // ── Zones ──────────────────────────────────────────────────────────────────
  zones: {
    list: {
      method: 'GET' as const,
      path: '/api/zones' as const,
      responses: {
        200: z.array(z.custom<typeof zones.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/zones' as const,
      input: insertZoneSchema,
      responses: {
        201: z.custom<typeof zones.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/zones/:id' as const,
      input: z.object({ name: z.string().min(1) }),
      responses: {
        200: z.custom<typeof zones.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    remove: {
      method: 'DELETE' as const,
      path: '/api/zones/:id' as const,
      responses: {
        200: z.object({ message: z.string() }),
        404: errorSchemas.notFound,
      },
    },
  },

  // ── Rejection entries ──────────────────────────────────────────────────────
  rejectionEntries: {
    list: {
      method: 'GET' as const,
      path: '/api/rejection-entries' as const,
      input: z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        partId: z.coerce.number().optional(),
        rejectionTypeId: z.coerce.number().optional(),
      }).optional(),
      responses: {
        200: z.array(rejectionEntryResponseSchema),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/rejection-entries' as const,
      input: insertRejectionEntrySchema.extend({
        partId: z.coerce.number(),
        rejectionTypeId: z.coerce.number(),
        quantity: z.coerce.number().default(1),
        entryDate: z.string().optional(),
        zoneId: z.coerce.number().optional(),
      }),
      responses: {
        201: rejectionEntryResponseSchema,
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/rejection-entries/:id' as const,
      input: insertRejectionEntrySchema.partial().extend({
        zoneId: z.coerce.number().optional(),
      }),
      responses: {
        200: rejectionEntryResponseSchema,
        404: errorSchemas.notFound,
      },
    },
    bulkDelete: {
      method: 'DELETE' as const,
      path: '/api/rejection-entries/bulk' as const,
      input: z.object({ ids: z.array(z.number()) }),
      responses: {
        200: z.object({ message: z.string(), deleted: z.number() }),
      },
    },
  },

  // ── Rework entries ─────────────────────────────────────────────────────────
  reworkEntries: {
    list: {
      method: 'GET' as const,
      path: '/api/rework-entries' as const,
      input: z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        partId: z.coerce.number().optional(),
        reworkTypeId: z.coerce.number().optional(),
      }).optional(),
      responses: {
        200: z.array(reworkEntryResponseSchema),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/rework-entries' as const,
      input: insertReworkEntrySchema.extend({
        partId: z.coerce.number(),
        reworkTypeId: z.coerce.number(),
        quantity: z.coerce.number().default(1),
        entryDate: z.string().optional(),
        zoneId: z.coerce.number().optional(),
      }),
      responses: {
        201: reworkEntryResponseSchema,
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/rework-entries/:id' as const,
      input: insertReworkEntrySchema.partial().extend({
        zoneId: z.coerce.number().optional(),
      }),
      responses: {
        200: reworkEntryResponseSchema,
        404: errorSchemas.notFound,
      },
    },
    bulkDelete: {
      method: 'DELETE' as const,
      path: '/api/rework-entries/bulk' as const,
      input: z.object({ ids: z.array(z.number()) }),
      responses: {
        200: z.object({ message: z.string(), deleted: z.number() }),
      },
    },
  },

  // ── Import entries (bulk async with progress polling) ──────────────────────
  importEntries: {
    start: {
      method: 'POST' as const,
      path: '/api/import-entries' as const,
      input: z.object({
        rows: z.array(z.record(z.any())),
        dryRun: z.boolean().optional(),
        // Fingerprint enables resume-on-cancel: `${rowCount}:${firstRowJSON}:${lastRowJSON}`
        fingerprint: z.string().optional(),
      }),
      responses: {
        202: z.object({
          importId: z.string(),
          totalRows: z.number(),
          resumedFromRow: z.number(),   // 0 = fresh start, >0 = resuming from checkpoint
          message: z.string(),
        }),
        400: errorSchemas.validation,
      },
    },
    progress: {
      method: 'GET' as const,
      path: '/api/import-entries/:id/progress' as const,
      responses: {
        200: z.object({
          importId: z.string(),
          status: z.enum(['pending', 'running', 'done', 'failed', 'cancelled']),
          totalRows: z.number(),
          processedRows: z.number(),
          successfulImports: z.number(),
          failedRows: z.number(),
          message: z.string(),
          result: z.record(z.any()).optional(),
        }),
        404: errorSchemas.notFound,
      },
    },
    cancel: {
      method: 'POST' as const,
      path: '/api/import-entries/:id/cancel' as const,
      responses: {
        200: z.object({ message: z.string() }),
        404: errorSchemas.notFound,
      },
    },
  },

  // ── Reports ────────────────────────────────────────────────────────────────
  reports: {
    summary: {
      method: 'GET' as const,
      path: '/api/reports/summary' as const,
      input: z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }).optional(),
      responses: {
        200: z.array(z.object({
          rejectionTypeId: z.number(),
          reason: z.string(),
          count: z.number(),
          totalQuantity: z.number(),
        })),
      },
    },
  },

  // ── Analytics ──────────────────────────────────────────────────────────────
  analytics: {
    byPart: {
      method: 'GET' as const,
      path: '/api/analytics/by-part' as const,
      input: z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }).optional(),
      responses: {
        200: z.array(z.object({
          partNumber: z.string(),
          description: z.string().nullable(),
          rejections: z.number(),
          reworks: z.number(),
          totalQuantity: z.number(),
        })),
      },
    },
    byMonth: {
      method: 'GET' as const,
      path: '/api/analytics/by-month' as const,
      input: z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }).optional(),
      responses: {
        200: z.array(z.object({
          month: z.string(),
          rejections: z.number(),
          reworks: z.number(),
          totalQuantity: z.number(),
        })),
      },
    },
    byCost: {
      method: 'GET' as const,
      path: '/api/analytics/by-cost' as const,
      input: z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }).optional(),
      responses: {
        200: z.array(z.object({
          partNumber: z.string(),
          description: z.string().nullable(),
          price: z.number(),
          rejectionQty: z.number(),
          reworkQty: z.number(),
          rejectionCost: z.number(),
          reworkCost: z.number(),
          totalCost: z.number(),
        })),
      },
    },
    byZone: {
      method: 'GET' as const,
      path: '/api/analytics/by-zone' as const,
      input: z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }).optional(),
      responses: {
        200: z.array(z.object({
          zone: z.string(),
          rejections: z.number(),
          reworks: z.number(),
          totalQuantity: z.number(),
        })),
      },
    },
  },

  // ── Utilities ──────────────────────────────────────────────────────────────
  dedup: {
    method: 'POST' as const,
    path: '/api/dedup-entries' as const,
    responses: {
      200: z.object({
        message: z.string(),
        rejectionDuplicates: z.number(),
        reworkDuplicates: z.number(),
      }),
    },
  },

  fetchGsheet: {
    method: 'GET' as const,
    path: '/api/fetch-gsheet' as const,
    input: z.object({ url: z.string().url() }),
    responses: {
      200: z.object({ rows: z.array(z.record(z.any())) }),
      400: errorSchemas.validation,
    },
  },
};

// ─── URL builder ──────────────────────────────────────────────────────────────
export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

// ─── Convenience type exports ─────────────────────────────────────────────────
export type PartResponse           = z.infer<typeof api.parts.list.responses[200]>[0];
export type RejectionTypeResponse  = z.infer<typeof api.rejectionTypes.list.responses[200]>[0];
export type ReworkTypeResponse     = z.infer<typeof api.reworkTypes.list.responses[200]>[0];
export type ZoneResponse           = z.infer<typeof api.zones.list.responses[200]>[0];
export type ReportSummaryResponse  = z.infer<typeof api.reports.summary.responses[200]>;
export type ImportProgressResponse = z.infer<typeof api.importEntries.progress.responses[200]>;
export type ImportStartResponse    = z.infer<typeof api.importEntries.start.responses[202]>;
