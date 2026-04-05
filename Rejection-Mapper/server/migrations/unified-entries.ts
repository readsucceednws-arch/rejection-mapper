import { db } from "../storage";
import { issueEntries, rejectionEntries, reworkEntries, parts, rejectionTypes, reworkTypes, zones } from "@shared/schema";
import { eq } from "drizzle-orm";

/**
 * Migration script to populate unified issue_entries table from existing rejection and rework entries
 * This maintains backward compatibility while enabling new features
 */

export async function migrateToUnifiedEntries() {
  console.log("Starting migration to unified issue_entries table...");
  
  try {
    // Migrate rejection entries
    console.log("Migrating rejection entries...");
    const rejectionData = await db.select({
      id: rejectionEntries.id,
      partId: rejectionEntries.partId,
      rejectionTypeId: rejectionEntries.rejectionTypeId,
      quantity: rejectionEntries.quantity,
      remarks: rejectionEntries.remarks,
      date: rejectionEntries.date,
      organizationId: rejectionEntries.organizationId,
      rate: rejectionEntries.rate,
      amount: rejectionEntries.amount,
      process: rejectionEntries.process,
      rejectionReasonCode: rejectionEntries.rejectionReasonCode,
      rejectionReason: rejectionEntries.rejectionReason,
      createdByUsername: rejectionEntries.createdByUsername,
      importedAt: rejectionEntries.importedAt,
      zoneId: rejectionEntries.zoneId,
    }).from(rejectionEntries);

    for (const rejection of rejectionData) {
      // Get part number
      const part = await db.select({ partNumber: parts.partNumber })
        .from(parts)
        .where(eq(parts.id, rejection.partId))
        .limit(1);

      // Get rejection type info
      const rejectionType = await db.select({
        type: rejectionTypes.type,
        zone: rejectionTypes.zone,
        rejectionCode: rejectionTypes.rejectionCode,
        reason: rejectionTypes.reason
      })
        .from(rejectionTypes)
        .where(eq(rejectionTypes.id, rejection.rejectionTypeId))
        .limit(1);

      // Get zone name if zoneId exists
      let zoneName = rejectionType[0]?.zone;
      if (rejection.zoneId && !zoneName) {
        const zone = await db.select({ name: zones.name })
          .from(zones)
          .where(eq(zones.id, rejection.zoneId))
          .limit(1);
        zoneName = zone[0]?.name;
      }

      await db.insert(issueEntries).values({
        partNumber: part[0]?.partNumber || "Unknown",
        zone: zoneName || "Unknown",
        type: rejectionType[0]?.type || "rejection",
        quantity: rejection.quantity,
        remarks: rejection.remarks,
        date: rejection.date,
        rate: rejection.rate,
        amount: rejection.amount,
        process: rejection.process,
        rejectionReasonCode: rejection.rejectionReasonCode || rejectionType[0]?.rejectionCode,
        rejectionReason: rejection.rejectionReason || rejectionType[0]?.reason,
        createdByUsername: rejection.createdByUsername,
        importedAt: rejection.importedAt,
        organizationId: rejection.organizationId,
        tags: [],
        customFields: {},
        entryType: "rejection",
        originalId: rejection.id,
      });
    }

    // Migrate rework entries
    console.log("Migrating rework entries...");
    const reworkData = await db.select({
      id: reworkEntries.id,
      partId: reworkEntries.partId,
      reworkTypeId: reworkEntries.reworkTypeId,
      quantity: reworkEntries.quantity,
      remarks: reworkEntries.remarks,
      date: reworkEntries.date,
      organizationId: reworkEntries.organizationId,
      rate: reworkEntries.rate,
      amount: reworkEntries.amount,
      process: reworkEntries.process,
      createdByUsername: reworkEntries.createdByUsername,
      importedAt: reworkEntries.importedAt,
      zoneId: reworkEntries.zoneId,
    }).from(reworkEntries);

    for (const rework of reworkData) {
      // Get part number
      const part = await db.select({ partNumber: parts.partNumber })
        .from(parts)
        .where(eq(parts.id, rework.partId))
        .limit(1);

      // Get rework type info
      const reworkType = await db.select({
        reworkCode: reworkTypes.reworkCode,
        reason: reworkTypes.reason,
        zone: reworkTypes.zone
      })
        .from(reworkTypes)
        .where(eq(reworkTypes.id, rework.reworkTypeId))
        .limit(1);

      // Get zone name if zoneId exists
      let zoneName = reworkType[0]?.zone;
      if (rework.zoneId && !zoneName) {
        const zone = await db.select({ name: zones.name })
          .from(zones)
          .where(eq(zones.id, rework.zoneId))
          .limit(1);
        zoneName = zone[0]?.name;
      }

      await db.insert(issueEntries).values({
        partNumber: part[0]?.partNumber || "Unknown",
        zone: zoneName || "Unknown",
        type: "rework",
        quantity: rework.quantity,
        remarks: rework.remarks,
        date: rework.date,
        rate: rework.rate,
        amount: rework.amount,
        process: rework.process,
        rejectionReasonCode: reworkType[0]?.reworkCode,
        rejectionReason: reworkType[0]?.reason,
        createdByUsername: rework.createdByUsername,
        importedAt: rework.importedAt,
        organizationId: rework.organizationId,
        tags: [],
        customFields: {},
        entryType: "rework",
        originalId: rework.id,
      });
    }

    console.log("Migration completed successfully!");
    console.log(`Migrated ${rejectionData.length} rejection entries and ${reworkData.length} rework entries`);

  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  }
}

/**
 * Function to create new issue entries with backward compatibility
 */
export async function createUnifiedEntry(
  data: any,
  organizationId: number,
  entryType: "rejection" | "rework" = "rejection"
) {
  // Insert into unified table
  const [unifiedEntry] = await db.insert(issueEntries)
    .values({
      ...data,
      organizationId,
      entryType,
      tags: data.tags || [],
      customFields: data.customFields || {},
    })
    .returning();

  // For backward compatibility, also insert into original tables if needed
  if (entryType === "rejection" && data.rejectionTypeId && data.partId) {
    await db.insert(rejectionEntries).values({
      ...data,
      organizationId,
    });
  } else if (entryType === "rework" && data.reworkTypeId && data.partId) {
    await db.insert(reworkEntries).values({
      ...data,
      organizationId,
    });
  }

  return unifiedEntry;
}

/**
 * Function to get unified entries with filtering
 */
export async function getUnifiedEntries(
  organizationId: number,
  filters: {
    limit?: number;
    offset?: number;
    zone?: string;
    type?: string;
    entryType?: "rejection" | "rework";
    dateFrom?: Date;
    dateTo?: Date;
  } = {}
) {
  let query = db.select()
    .from(issueEntries)
    .where(eq(issueEntries.organizationId, organizationId));

  // Apply filters
  if (filters.zone) {
    query = query.where(eq(issueEntries.zone, filters.zone));
  }
  if (filters.type) {
    query = query.where(eq(issueEntries.type, filters.type));
  }
  if (filters.entryType) {
    query = query.where(eq(issueEntries.entryType, filters.entryType));
  }
  if (filters.limit) {
    query = query.limit(filters.limit);
  }
  if (filters.offset) {
    query = query.offset(filters.offset);
  }

  return await query.orderBy(issueEntries.date.desc());
}
