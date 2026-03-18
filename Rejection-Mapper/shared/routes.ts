import { z } from 'zod';
import { 
  insertPartSchema, 
  insertRejectionTypeSchema, 
  insertRejectionEntrySchema,
  insertReworkEntrySchema,
  parts,
  rejectionTypes,
} from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

// Response schema including relations (workaround for recursive/complex TS inference in Zod)
const rejectionEntryResponseSchema = z.custom<any>();

export const api = {
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
    }
  },
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
    }
  },
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
      }),
      responses: {
        201: rejectionEntryResponseSchema,
        400: errorSchemas.validation,
      },
    }
  },
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
        200: z.array(z.custom<any>()),
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
      }),
      responses: {
        201: z.custom<any>(),
        400: z.object({ message: z.string(), field: z.string().optional() }),
      },
    },
  },
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
    }
  }
};

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

export type PartResponse = z.infer<typeof api.parts.list.responses[200]>[0];
export type RejectionTypeResponse = z.infer<typeof api.rejectionTypes.list.responses[200]>[0];
export type ReportSummaryResponse = z.infer<typeof api.reports.summary.responses[200]>;
