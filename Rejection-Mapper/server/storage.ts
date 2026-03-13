import { db } from "./db";
import {
  parts,
  rejectionTypes,
  rejectionEntries,
  reworkTypes,
  reworkEntries,
  users,
  organizations,
  passwordResetTokens,
  inviteTokens,
  zones,
  type InsertPart,
  type InsertRejectionType,
  type InsertRejectionEntry,
  type InsertReworkType,
  type InsertReworkEntry,
  type InsertUser,
  type InsertOrganization,
  type InsertZone,
  type Part,
  type RejectionType,
  type RejectionEntryResponse,
  type ReworkType,
  type ReworkEntryResponse,
  type User,
  type Organization,
  type Zone,
} from "@shared/schema";
import { eq, desc, gte, lte, and, gt, inArray } from "drizzle-orm";
import crypto from "crypto";

function generateInviteCode(): string {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

export interface IStorage {
  // Organizations
  createOrganization(name: string): Promise<Organization>;
  getOrganizationById(id: number): Promise<Organization | undefined>;
  getOrganizationByInviteCode(code: string): Promise<Organization | undefined>;
  seedOrganizationFromDefault(organizationId: number): Promise<void>;

  // Parts
  getParts(organizationId: number): Promise<Part[]>;
  createPart(part: InsertPart): Promise<Part>;
  updatePart(id: number, organizationId: number, data: Partial<InsertPart>): Promise<Part>;
  deletePart(id: number, organizationId: number): Promise<void>;

  // Rejection Types
  getRejectionTypes(organizationId: number): Promise<RejectionType[]>;
  createRejectionType(rejectionType: InsertRejectionType): Promise<RejectionType>;
  updateRejectionType(id: number, organizationId: number, data: Partial<InsertRejectionType>): Promise<RejectionType>;
  deleteRejectionType(id: number, organizationId: number): Promise<void>;
  bulkDeleteRejectionTypes(ids: number[], organizationId: number): Promise<void>;

  // Rejection Entries
  getRejectionEntries(organizationId: number, filters?: { startDate?: string; endDate?: string; partId?: number; rejectionTypeId?: number; type?: string }): Promise<RejectionEntryResponse[]>;
  createRejectionEntry(entry: InsertRejectionEntry & { date?: Date }): Promise<RejectionEntryResponse>;
  findDuplicateRejectionEntry(orgId: number, date: Date, partId: number, rejectionTypeId: number, quantity: number): Promise<boolean>;

  // Rework Types
  getReworkTypes(organizationId: number): Promise<ReworkType[]>;
  createReworkType(reworkType: InsertReworkType): Promise<ReworkType>;
  updateReworkType(id: number, organizationId: number, data: Partial<InsertReworkType>): Promise<ReworkType>;
  deleteReworkType(id: number, organizationId: number): Promise<void>;
  bulkDeleteReworkTypes(ids: number[], organizationId: number): Promise<void>;

  // Rework Entries
  getReworkEntries(organizationId: number, filters?: { startDate?: string; endDate?: string; partId?: number; reworkTypeId?: number }): Promise<ReworkEntryResponse[]>;
  createReworkEntry(entry: InsertReworkEntry): Promise<ReworkEntryResponse>;

  // Users
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByUsernameAndOrg(username: string, organizationId: number): Promise<User | undefined>;
  getUserById(id: number): Promise<User | undefined>;
  getUsersByOrganization(organizationId: number): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  getUserCount(): Promise<number>;
  updateUserPassword(userId: number, hashedPassword: string): Promise<void>;
  updateUserEmail(userId: number, email: string): Promise<void>;
  deleteUser(userId: number, organizationId: number): Promise<void>;

  // Password reset tokens
  createPasswordResetToken(userId: number): Promise<string>;
  getUserByResetToken(token: string): Promise<User | undefined>;
  consumeResetToken(token: string): Promise<void>;

  // Invite tokens
  createInviteToken(userId: number): Promise<string>;
  getUserByInviteToken(token: string): Promise<User | undefined>;
  consumeInviteToken(token: string): Promise<void>;

  // Zones
  getZones(organizationId: number): Promise<Zone[]>;
  createZone(zone: InsertZone): Promise<Zone>;
  updateZone(id: number, organizationId: number, name: string): Promise<Zone>;
  deleteZone(id: number, organizationId: number): Promise<void>;

  // Reports
  getRejectionSummary(organizationId: number, filters?: { startDate?: string; endDate?: string }): Promise<any[]>;

  // Analytics
  getPartWiseSummary(organizationId: number, filters?: { startDate?: string; endDate?: string; type?: string }): Promise<{ partNumber: string; description: string | null; totalQuantity: number; rejections: number; reworks: number }[]>;
  getMonthWiseSummary(organizationId: number, filters?: { startDate?: string; endDate?: string; type?: string }): Promise<{ month: string; totalQuantity: number; rejections: number; reworks: number }[]>;
  getCostSummary(organizationId: number, filters?: { startDate?: string; endDate?: string }): Promise<{ partNumber: string; description: string | null; price: number; rejectionQty: number; reworkQty: number; rejectionCost: number; reworkCost: number; totalCost: number }[]>;
  getZoneWiseSummary(organizationId: number, filters?: { startDate?: string; endDate?: string }): Promise<{ zone: string; totalQuantity: number; rejections: number; reworks: number }[]>;
}

export class DatabaseStorage implements IStorage {
  async createOrganization(name: string): Promise<Organization> {
    const inviteCode = generateInviteCode();
    const [created] = await db.insert(organizations).values({ name, inviteCode }).returning();
    return created;
  }

  async getOrganizationById(id: number): Promise<Organization | undefined> {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, id));
    return org;
  }

  async getOrganizationByInviteCode(code: string): Promise<Organization | undefined> {
    const [org] = await db.select().from(organizations).where(eq(organizations.inviteCode, code.toUpperCase()));
    return org;
  }

  async seedOrganizationFromDefault(organizationId: number): Promise<void> {
    const DEFAULT_ORG_ID = 1;

    const defaultParts = await db.select().from(parts).where(eq(parts.organizationId, DEFAULT_ORG_ID));
    if (defaultParts.length > 0) {
      await db.insert(parts).values(
        defaultParts.map(({ id, ...p }) => ({ ...p, organizationId }))
      );
    }

    const defaultRejectionTypes = await db.select().from(rejectionTypes).where(eq(rejectionTypes.organizationId, DEFAULT_ORG_ID));
    if (defaultRejectionTypes.length > 0) {
      await db.insert(rejectionTypes).values(
        defaultRejectionTypes.map(({ id, ...rt }) => ({ ...rt, organizationId }))
      );
    }

    const defaultReworkTypes = await db.select().from(reworkTypes).where(eq(reworkTypes.organizationId, DEFAULT_ORG_ID));
    if (defaultReworkTypes.length > 0) {
      await db.insert(reworkTypes).values(
        defaultReworkTypes.map(({ id, ...rwt }) => ({ ...rwt, organizationId }))
      );
    }
  }

  async getParts(organizationId: number): Promise<Part[]> {
    return await db.select().from(parts).where(eq(parts.organizationId, organizationId));
  }

  async createPart(part: InsertPart): Promise<Part> {
    const [created] = await db.insert(parts).values(part).returning();
    return created;
  }

  async updatePart(id: number, organizationId: number, data: Partial<InsertPart>): Promise<Part> {
    const [updated] = await db.update(parts).set(data).where(and(eq(parts.id, id), eq(parts.organizationId, organizationId))).returning();
    if (!updated) throw new Error("Part not found");
    return updated;
  }

  async deletePart(id: number, organizationId: number): Promise<void> {
    await db.delete(parts).where(and(eq(parts.id, id), eq(parts.organizationId, organizationId)));
  }

  async getRejectionTypes(organizationId: number): Promise<RejectionType[]> {
    return await db.select().from(rejectionTypes).where(eq(rejectionTypes.organizationId, organizationId));
  }

  async createRejectionType(rejectionType: InsertRejectionType): Promise<RejectionType> {
    const [created] = await db.insert(rejectionTypes).values(rejectionType).returning();
    return created;
  }

  async updateRejectionType(id: number, organizationId: number, data: Partial<InsertRejectionType>): Promise<RejectionType> {
    const [updated] = await db.update(rejectionTypes).set(data).where(and(eq(rejectionTypes.id, id), eq(rejectionTypes.organizationId, organizationId))).returning();
    if (!updated) throw new Error("Rejection type not found");
    return updated;
  }

  async deleteRejectionType(id: number, organizationId: number): Promise<void> {
    await db.delete(rejectionTypes).where(and(eq(rejectionTypes.id, id), eq(rejectionTypes.organizationId, organizationId)));
  }

  async bulkDeleteRejectionTypes(ids: number[], organizationId: number): Promise<void> {
    if (ids.length === 0) return;
    await db.delete(rejectionTypes).where(and(inArray(rejectionTypes.id, ids), eq(rejectionTypes.organizationId, organizationId)));
  }

  async getRejectionEntries(organizationId: number, filters?: { startDate?: string; endDate?: string; partId?: number; rejectionTypeId?: number; type?: string }): Promise<RejectionEntryResponse[]> {
    const conditions = [eq(rejectionEntries.organizationId, organizationId)];
    if (filters?.startDate) conditions.push(gte(rejectionEntries.date, new Date(filters.startDate)));
    if (filters?.endDate) conditions.push(lte(rejectionEntries.date, new Date(filters.endDate)));
    if (filters?.partId) conditions.push(eq(rejectionEntries.partId, filters.partId));
    if (filters?.rejectionTypeId) conditions.push(eq(rejectionEntries.rejectionTypeId, filters.rejectionTypeId));

    let items = await db.query.rejectionEntries.findMany({
      where: and(...conditions),
      orderBy: [desc(rejectionEntries.date)],
      with: { part: true, rejectionType: true, zone: true },
      limit: 500,
    });

    if (filters?.type) {
      items = items.filter(item => item.rejectionType.type === filters.type);
    }
    return items;
  }

  async findDuplicateRejectionEntry(orgId: number, date: Date, partId: number, rejectionTypeId: number, quantity: number): Promise<boolean> {
    const startOfDay = new Date(date); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay   = new Date(date); endOfDay.setHours(23, 59, 59, 999);
    const rows = await db.select({ id: rejectionEntries.id }).from(rejectionEntries)
      .where(and(
        eq(rejectionEntries.organizationId, orgId),
        eq(rejectionEntries.partId, partId),
        eq(rejectionEntries.rejectionTypeId, rejectionTypeId),
        eq(rejectionEntries.quantity, quantity),
        gte(rejectionEntries.date, startOfDay),
        lte(rejectionEntries.date, endOfDay),
      )).limit(1);
    return rows.length > 0;
  }

  async createRejectionEntry(entry: InsertRejectionEntry & { date?: Date }): Promise<RejectionEntryResponse> {
    const [created] = await db.insert(rejectionEntries).values(entry).returning();
    const populated = await db.query.rejectionEntries.findFirst({
      where: eq(rejectionEntries.id, created.id),
      with: { part: true, rejectionType: true, zone: true },
    });
    if (!populated) throw new Error("Failed to retrieve created entry");
    return populated;
  }

  async getReworkTypes(organizationId: number): Promise<ReworkType[]> {
    return await db.select().from(reworkTypes).where(eq(reworkTypes.organizationId, organizationId));
  }

  async createReworkType(reworkType: InsertReworkType): Promise<ReworkType> {
    const [created] = await db.insert(reworkTypes).values(reworkType).returning();
    return created;
  }

  async updateReworkType(id: number, organizationId: number, data: Partial<InsertReworkType>): Promise<ReworkType> {
    const [updated] = await db.update(reworkTypes).set(data).where(and(eq(reworkTypes.id, id), eq(reworkTypes.organizationId, organizationId))).returning();
    if (!updated) throw new Error("Rework type not found");
    return updated;
  }

  async deleteReworkType(id: number, organizationId: number): Promise<void> {
    await db.delete(reworkTypes).where(and(eq(reworkTypes.id, id), eq(reworkTypes.organizationId, organizationId)));
  }

  async bulkDeleteReworkTypes(ids: number[], organizationId: number): Promise<void> {
    if (ids.length === 0) return;
    await db.delete(reworkTypes).where(and(inArray(reworkTypes.id, ids), eq(reworkTypes.organizationId, organizationId)));
  }

  async getReworkEntries(organizationId: number, filters?: { startDate?: string; endDate?: string; partId?: number; reworkTypeId?: number }): Promise<ReworkEntryResponse[]> {
    const conditions = [eq(reworkEntries.organizationId, organizationId)];
    if (filters?.startDate) conditions.push(gte(reworkEntries.date, new Date(filters.startDate)));
    if (filters?.endDate) conditions.push(lte(reworkEntries.date, new Date(filters.endDate)));
    if (filters?.partId) conditions.push(eq(reworkEntries.partId, filters.partId));
    if (filters?.reworkTypeId) conditions.push(eq(reworkEntries.reworkTypeId, filters.reworkTypeId));

    return await db.query.reworkEntries.findMany({
      where: and(...conditions),
      orderBy: [desc(reworkEntries.date)],
      with: { part: true, reworkType: true, zone: true },
      limit: 500,
    });
  }

  async createReworkEntry(entry: InsertReworkEntry): Promise<ReworkEntryResponse> {
    const [created] = await db.insert(reworkEntries).values(entry).returning();
    const populated = await db.query.reworkEntries.findFirst({
      where: eq(reworkEntries.id, created.id),
      with: { part: true, reworkType: true, zone: true },
    });
    if (!populated) throw new Error("Failed to retrieve created rework entry");
    return populated;
  }

  async getRejectionSummary(organizationId: number, filters?: { startDate?: string; endDate?: string }): Promise<any[]> {
    const entries = await this.getRejectionEntries(organizationId, filters);
    const summaryMap = new Map<number, { count: number; totalQuantity: number; reason: string; rejectionTypeId: number }>();
    for (const entry of entries) {
      const existing = summaryMap.get(entry.rejectionTypeId) || {
        rejectionTypeId: entry.rejectionTypeId,
        reason: entry.rejectionType.reason,
        count: 0,
        totalQuantity: 0,
      };
      existing.count += 1;
      existing.totalQuantity += entry.quantity;
      summaryMap.set(entry.rejectionTypeId, existing);
    }
    return Array.from(summaryMap.values());
  }

  async getPartWiseSummary(organizationId: number, filters?: { startDate?: string; endDate?: string; type?: string }): Promise<{ partNumber: string; description: string | null; totalQuantity: number; rejections: number; reworks: number }[]> {
    const dateFilters = { startDate: filters?.startDate, endDate: filters?.endDate };
    const map = new Map<number, { partNumber: string; description: string | null; totalQuantity: number; rejections: number; reworks: number; partId: number }>();

    if (!filters?.type || filters.type === "rejection") {
      const entries = await this.getRejectionEntries(organizationId, dateFilters);
      for (const entry of entries) {
        const isRework = entry.rejectionType.type === "rework";
        const key = entry.partId;
        const existing = map.get(key) || { partId: key, partNumber: entry.part.partNumber, description: entry.part.description, totalQuantity: 0, rejections: 0, reworks: 0 };
        existing.totalQuantity += entry.quantity;
        if (isRework) existing.reworks += entry.quantity;
        else existing.rejections += entry.quantity;
        map.set(key, existing);
      }
    }

    if (!filters?.type || filters.type === "rework") {
      const rEntries = await this.getReworkEntries(organizationId, dateFilters);
      for (const entry of rEntries) {
        const key = entry.partId;
        const existing = map.get(key) || { partId: key, partNumber: entry.part.partNumber, description: entry.part.description, totalQuantity: 0, rejections: 0, reworks: 0 };
        existing.totalQuantity += entry.quantity;
        existing.reworks += entry.quantity;
        map.set(key, existing);
      }
    }

    return Array.from(map.values()).map(({ partId, ...rest }) => rest).sort((a, b) => b.totalQuantity - a.totalQuantity);
  }

  async getMonthWiseSummary(organizationId: number, filters?: { startDate?: string; endDate?: string; type?: string }): Promise<{ month: string; totalQuantity: number; rejections: number; reworks: number }[]> {
    const dateFilters = { startDate: filters?.startDate, endDate: filters?.endDate };
    const map = new Map<string, { month: string; totalQuantity: number; rejections: number; reworks: number }>();

    const addToMap = (date: Date, quantity: number, isRework: boolean) => {
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const label = date.toLocaleString("default", { month: "short", year: "numeric" });
      const existing = map.get(key) || { month: label, totalQuantity: 0, rejections: 0, reworks: 0 };
      existing.totalQuantity += quantity;
      if (isRework) existing.reworks += quantity;
      else existing.rejections += quantity;
      map.set(key, existing);
    };

    if (!filters?.type || filters.type === "rejection") {
      const entries = await this.getRejectionEntries(organizationId, dateFilters);
      for (const e of entries) addToMap(new Date(e.date), e.quantity, e.rejectionType.type === "rework");
    }

    if (!filters?.type || filters.type === "rework") {
      const rEntries = await this.getReworkEntries(organizationId, dateFilters);
      for (const e of rEntries) addToMap(new Date(e.date), e.quantity, true);
    }

    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  }

  async getCostSummary(organizationId: number, filters?: { startDate?: string; endDate?: string }): Promise<{ partNumber: string; description: string | null; price: number; rejectionQty: number; reworkQty: number; rejectionCost: number; reworkCost: number; totalCost: number }[]> {
    const map = new Map<number, { partNumber: string; description: string | null; price: number; rejectionQty: number; reworkQty: number; rejectionCost: number; reworkCost: number; totalCost: number; partId: number }>();

    const entries = await this.getRejectionEntries(organizationId, filters);
    for (const entry of entries) {
      const price = entry.part.price || 0;
      const existing = map.get(entry.partId) || { partId: entry.partId, partNumber: entry.part.partNumber, description: entry.part.description, price, rejectionQty: 0, reworkQty: 0, rejectionCost: 0, reworkCost: 0, totalCost: 0 };
      const cost = entry.quantity * price;
      if (entry.rejectionType.type === "rework") { existing.reworkQty += entry.quantity; existing.reworkCost += cost; }
      else { existing.rejectionQty += entry.quantity; existing.rejectionCost += cost; }
      existing.totalCost = existing.rejectionCost + existing.reworkCost;
      map.set(entry.partId, existing);
    }

    const rEntries = await this.getReworkEntries(organizationId, filters);
    for (const entry of rEntries) {
      const price = entry.part.price || 0;
      const existing = map.get(entry.partId) || { partId: entry.partId, partNumber: entry.part.partNumber, description: entry.part.description, price, rejectionQty: 0, reworkQty: 0, rejectionCost: 0, reworkCost: 0, totalCost: 0 };
      const cost = entry.quantity * price;
      existing.reworkQty += entry.quantity;
      existing.reworkCost += cost;
      existing.totalCost = existing.rejectionCost + existing.reworkCost;
      map.set(entry.partId, existing);
    }

    return Array.from(map.values()).map(({ partId, ...rest }) => rest).sort((a, b) => b.totalCost - a.totalCost);
  }

  async getZoneWiseSummary(organizationId: number, filters?: { startDate?: string; endDate?: string }): Promise<{ zone: string; totalQuantity: number; rejections: number; reworks: number }[]> {
    const map = new Map<string, { zone: string; totalQuantity: number; rejections: number; reworks: number }>();

    function resolveZone(val: string | null | undefined): string {
      if (!val || val === "rejection" || val === "rework") return "General";
      return val;
    }

    function addToMap(zone: string, quantity: number, isRework: boolean) {
      const existing = map.get(zone) || { zone, totalQuantity: 0, rejections: 0, reworks: 0 };
      existing.totalQuantity += quantity;
      if (isRework) existing.reworks += quantity;
      else existing.rejections += quantity;
      map.set(zone, existing);
    }

    const rejEntries = await this.getRejectionEntries(organizationId, filters);
    for (const e of rejEntries) {
      addToMap(resolveZone(e.rejectionType.type), e.quantity, false);
    }

    const rwEntries = await this.getReworkEntries(organizationId, filters);
    for (const e of rwEntries) {
      addToMap(resolveZone(e.reworkType.zone), e.quantity, true);
    }

    return Array.from(map.values()).sort((a, b) => b.totalQuantity - a.totalQuantity);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username.toLowerCase()));
    return user;
  }

  async getUserByUsernameAndOrg(username: string, organizationId: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(
      and(eq(users.username, username.toLowerCase()), eq(users.organizationId, organizationId))
    );
    return user;
  }

  async getUserById(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUsersByOrganization(organizationId: number): Promise<User[]> {
    return db.select().from(users).where(eq(users.organizationId, organizationId));
  }

  async createUser(user: InsertUser): Promise<User> {
    const values: any = { ...user };
    if (values.email) values.email = values.email.toLowerCase();
    if (values.username) values.username = values.username.toLowerCase();
    const [created] = await db.insert(users).values(values).returning();
    return created;
  }

  async updateUserEmail(userId: number, email: string): Promise<void> {
    await db.update(users).set({ email: email.toLowerCase() }).where(eq(users.id, userId));
  }

  async getUserCount(): Promise<number> {
    const result = await db.select().from(users);
    return result.length;
  }

  async updateUserPassword(userId: number, hashedPassword: string): Promise<void> {
    await db.update(users).set({ password: hashedPassword }).where(eq(users.id, userId));
  }

  async deleteUser(userId: number, organizationId: number): Promise<void> {
    await db.delete(users).where(and(eq(users.id, userId), eq(users.organizationId, organizationId)));
  }

  async createPasswordResetToken(userId: number): Promise<string> {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await db.insert(passwordResetTokens).values({ userId, token, expiresAt });
    return token;
  }

  async getUserByResetToken(token: string): Promise<User | undefined> {
    const now = new Date();
    const [row] = await db
      .select({ user: users })
      .from(passwordResetTokens)
      .innerJoin(users, eq(passwordResetTokens.userId, users.id))
      .where(
        and(
          eq(passwordResetTokens.token, token),
          gt(passwordResetTokens.expiresAt, now),
          eq(passwordResetTokens.usedAt, null as any),
        )
      );
    return row?.user;
  }

  async consumeResetToken(token: string): Promise<void> {
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.token, token));
  }

  async createInviteToken(userId: number): Promise<string> {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await db.insert(inviteTokens).values({ userId, token, expiresAt });
    return token;
  }

  async getUserByInviteToken(token: string): Promise<User | undefined> {
    const now = new Date();
    const [row] = await db
      .select({ user: users })
      .from(inviteTokens)
      .innerJoin(users, eq(inviteTokens.userId, users.id))
      .where(
        and(
          eq(inviteTokens.token, token),
          gt(inviteTokens.expiresAt, now),
          eq(inviteTokens.usedAt, null as any),
        )
      );
    return row?.user;
  }

  async consumeInviteToken(token: string): Promise<void> {
    await db
      .update(inviteTokens)
      .set({ usedAt: new Date() })
      .where(eq(inviteTokens.token, token));
  }

  async getZones(organizationId: number): Promise<Zone[]> {
    return db.select().from(zones).where(eq(zones.organizationId, organizationId)).orderBy(zones.name);
  }

  async createZone(zone: InsertZone): Promise<Zone> {
    const [created] = await db.insert(zones).values(zone).returning();
    return created;
  }

  async updateZone(id: number, organizationId: number, name: string): Promise<Zone> {
    const [updated] = await db
      .update(zones)
      .set({ name })
      .where(and(eq(zones.id, id), eq(zones.organizationId, organizationId)))
      .returning();
    if (!updated) throw new Error("Zone not found");
    return updated;
  }

  async deleteZone(id: number, organizationId: number): Promise<void> {
    await db.delete(zones).where(and(eq(zones.id, id), eq(zones.organizationId, organizationId)));
  }
}

export const storage = new DatabaseStorage();
