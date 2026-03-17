import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  doublePrecision,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// === TABLE DEFINITIONS ===

export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  inviteCode: text("invite_code").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").unique(),
  username: text("username").unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("employee"),
  organizationId: integer("organization_id").references(() => organizations.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const parts = pgTable("parts", {
  id: serial("id").primaryKey(),
  partNumber: text("part_number").notNull(),
  description: text("description"),
  price: doublePrecision("price").notNull().default(0),
  organizationId: integer("organization_id").references(() => organizations.id),
});

export const rejectionTypes = pgTable("rejection_types", {
  id: serial("id").primaryKey(),
  rejectionCode: text("rejection_code").notNull(),
  reason: text("reason").notNull(),
  type: text("type").notNull().default("rejection"),
  organizationId: integer("organization_id").references(() => organizations.id),
});

export const zones = pgTable("zones", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  organizationId: integer("organization_id").references(() => organizations.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const rejectionEntries = pgTable("rejection_entries", {
  id: serial("id").primaryKey(),
  partId: integer("part_id").references(() => parts.id).notNull(),
  rejectionTypeId: integer("rejection_type_id")
    .references(() => rejectionTypes.id)
    .notNull(),
  quantity: integer("quantity").notNull().default(1),
  remarks: text("remarks"),
  date: timestamp("date").notNull().defaultNow(),
  organizationId: integer("organization_id").references(() => organizations.id),
  rate: doublePrecision("rate"),
  amount: doublePrecision("amount"),
  process: text("process"),
  rejectionReasonCode: text("rejection_reason_code"),
  rejectionReason: text("rejection_reason"),
  importedAt: timestamp("imported_at"),
  zoneId: integer("zone_id").references(() => zones.id),
  createdByUsername: text("created_by_username"),
});

export const reworkTypes = pgTable("rework_types", {
  id: serial("id").primaryKey(),
  reworkCode: text("rework_code").notNull(),
  reason: text("reason").notNull(),
  zone: text("zone"),
  organizationId: integer("organization_id").references(() => organizations.id),
});

export const reworkEntries = pgTable("rework_entries", {
  id: serial("id").primaryKey(),
  partId: integer("part_id").references(() => parts.id).notNull(),
  reworkTypeId: integer("rework_type_id")
    .references(() => reworkTypes.id)
    .notNull(),
  quantity: integer("quantity").notNull().default(1),
  remarks: text("remarks"),
  date: timestamp("date").notNull().defaultNow(),
  organizationId: integer("organization_id").references(() => organizations.id),
  rate: doublePrecision("rate"),
  amount: doublePrecision("amount"),
  process: text("process"),
  importedAt: timestamp("imported_at"),
  zoneId: integer("zone_id").references(() => zones.id),
  createdByUsername: text("created_by_username"),
});

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
});

export const inviteTokens = pgTable("invite_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
});

// === RELATIONS ===

export const organizationsRelations = relations(
  organizations,
  ({ many }) => ({
    users: many(users),
    parts: many(parts),
    rejectionTypes: many(rejectionTypes),
    rejectionEntries: many(rejectionEntries),
    reworkTypes: many(reworkTypes),
    reworkEntries: many(reworkEntries),
    zones: many(zones),
  })
);

export const usersRelations = relations(users, ({ one }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
}));

export const partsRelations = relations(parts, ({ many, one }) => ({
  rejectionEntries: many(rejectionEntries),
  reworkEntries: many(reworkEntries),
  organization: one(organizations, {
    fields: [parts.organizationId],
    references: [organizations.id],
  }),
}));

export const rejectionTypesRelations = relations(
  rejectionTypes,
  ({ many, one }) => ({
    entries: many(rejectionEntries),
    organization: one(organizations, {
      fields: [rejectionTypes.organizationId],
      references: [organizations.id],
    }),
  })
);

export const zonesRelations = relations(zones, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [zones.organizationId],
    references: [organizations.id],
  }),
  rejectionEntries: many(rejectionEntries),
  reworkEntries: many(reworkEntries),
}));

export const rejectionEntriesRelations = relations(
  rejectionEntries,
  ({ one }) => ({
    part: one(parts, {
      fields: [rejectionEntries.partId],
      references: [parts.id],
    }),
    rejectionType: one(rejectionTypes, {
      fields: [rejectionEntries.rejectionTypeId],
      references: [rejectionTypes.id],
    }),
    organization: one(organizations, {
      fields: [rejectionEntries.organizationId],
      references: [organizations.id],
    }),
    zone: one(zones, {
      fields: [rejectionEntries.zoneId],
      references: [zones.id],
    }),
  })
);

export const reworkTypesRelations = relations(
  reworkTypes,
  ({ many, one }) => ({
    entries: many(reworkEntries),
    organization: one(organizations, {
      fields: [reworkTypes.organizationId],
      references: [organizations.id],
    }),
  })
);

export const reworkEntriesRelations = relations(reworkEntries, ({ one }) => ({
  part: one(parts, {
    fields: [reworkEntries.partId],
    references: [parts.id],
  }),
  reworkType: one(reworkTypes, {
    fields: [reworkEntries.reworkTypeId],
    references: [reworkTypes.id],
  }),
  organization: one(organizations, {
    fields: [reworkEntries.organizationId],
    references: [organizations.id],
  }),
  zone: one(zones, {
    fields: [reworkEntries.zoneId],
    references: [zones.id],
  }),
}));

// === BASE SCHEMAS ===

export const insertOrganizationSchema = createInsertSchema(
  organizations
).omit({
  id: true,
  createdAt: true,
});

export const insertPartSchema = createInsertSchema(parts).omit({
  id: true,
});

export const insertRejectionTypeSchema = createInsertSchema(
  rejectionTypes
).omit({
  id: true,
});

export const insertRejectionEntrySchema = createInsertSchema(
  rejectionEntries
).omit({
  id: true,
  date: true,
  importedAt: true,
  createdByUsername: true,
});

export const insertReworkTypeSchema = createInsertSchema(reworkTypes).omit({
  id: true,
});

export const insertReworkEntrySchema = createInsertSchema(
  reworkEntries
).omit({
  id: true,
  date: true,
  importedAt: true,
  createdByUsername: true,
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertZoneSchema = createInsertSchema(zones).omit({
  id: true,
  createdAt: true,
});

// === EXPLICIT API CONTRACT TYPES ===

export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;

export type Part = typeof parts.$inferSelect;
export type InsertPart = z.infer<typeof insertPartSchema>;

export type RejectionType = typeof rejectionTypes.$inferSelect;
export type InsertRejectionType = z.infer<typeof insertRejectionTypeSchema>;

export type Zone = typeof zones.$inferSelect;
export type InsertZone = z.infer<typeof insertZoneSchema>;

export type RejectionEntry = typeof rejectionEntries.$inferSelect;
export type InsertRejectionEntry = z.infer<typeof insertRejectionEntrySchema>;

export type ReworkType = typeof reworkTypes.$inferSelect;
export type InsertReworkType = z.infer<typeof insertReworkTypeSchema>;

export type ReworkEntry = typeof reworkEntries.$inferSelect;
export type InsertReworkEntry = z.infer<typeof insertReworkEntrySchema>;

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

// Populated response types
export type RejectionEntryResponse = RejectionEntry & {
  part: Part;
  rejectionType: RejectionType;
  zone?: Zone | null;
};

export type ReworkEntryResponse = ReworkEntry & {
  part: Part;
  reworkType: ReworkType;
  zone?: Zone | null;
};
