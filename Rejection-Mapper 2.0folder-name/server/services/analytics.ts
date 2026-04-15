import { db } from "../storage";
import { issueEntries, organizations, rejectionEntries, reworkEntries, parts, rejectionTypes, reworkTypes, zones } from "@shared/schema";
import { eq, and, gte, lte, desc, count, sum, sql, isNotNull } from "drizzle-orm";

/**
 * Advanced Analytics Service
 * Works with unified issue_entries and template system
 * Template-aware analytics for manufacturing, bakery, food service, etc.
 */

export interface AnalyticsPeriod {
  from: Date;
  to: Date;
}

export interface OverviewStats {
  totalIssues: number;
  totalQuantity: number;
  avgQuantityPerIssue: number;
  uniqueCategories: number;
  uniqueItems: number;
  uniqueIssueTypes: number;
}

export interface TrendData {
  period: string;
  current: {
    count: number;
    quantity: number;
  };
  previous: {
    count: number;
    quantity: number;
  };
  changePercent: {
    count: number;
    quantity: number;
  };
  trend: 'increasing' | 'decreasing' | 'stable';
}

export interface TopCategory {
  name: string;
  count: number;
  quantity: number;
  percentage: number;
  topIssueType: string;
}

export interface TopItem {
  name: string;
  count: number;
  quantity: number;
  percentage: number;
  topIssueType: string;
}

export interface TopIssueType {
  name: string;
  count: number;
  quantity: number;
  percentage: number;
  topCategory: string;
  topItem: string;
}

export interface DailyTrend {
  date: string;
  count: number;
  quantity: number;
}

export interface InsightSummary {
  type: 'top_issue' | 'problem_area' | 'trend_change';
  title: string;
  description: string;
  value: string;
  change?: string;
  confidence: number;
}

export interface AnalyticsData {
  overview: OverviewStats;
  trends: {
    last7Days: TrendData;
    last30Days: TrendData;
  };
  topCategories: TopCategory[];
  topItems: TopItem[];
  topIssueTypes: TopIssueType[];
  dailyTrend: DailyTrend[];
  insights: InsightSummary[];
}

export class AnalyticsService {

  /**
   * Ensure issueEntries is populated with data from existing tables.
   *
   * FIX: Previously the insert spread aliased select fields directly, so
   * `zone` (from zones.name) and `partNumber` (from parts.partNumber) were
   * spread under those same keys — which looks correct, BUT the select aliases
   * matched issueEntries column names only by coincidence for `zone`, while
   * other mismatches (e.g. rework using sql`'rework'` for `type`) meant the
   * `type` column could be NULL for rework entries.  More importantly, because
   * `zone` and `partNumber` are NOT NULL in the schema, any row where the join
   * produced a NULL (unassigned zone / no part) would violate the constraint
   * and silently roll back or error, leaving issueEntries empty and every
   * subsequent query returning "Unknown".
   *
   * The fix explicitly maps every field and coalesces NULLs to safe defaults.
   */
  private async ensureIssueEntriesPopulated(organizationId: number): Promise<void> {
    const existingEntries = await db.select({ count: count() })
      .from(issueEntries)
      .where(eq(issueEntries.organizationId, organizationId))
      .limit(1);

    if ((existingEntries[0]?.count ?? 0) > 0) {
      return; // Already populated
    }

    const [rejectionData, reworkData] = await Promise.all([
      db.select({
        partNumber: parts.partNumber,
        zoneName: zones.name,
        rejTypeName: rejectionTypes.type,
        rejZone: rejectionTypes.zone,
        quantity: rejectionEntries.quantity,
        date: rejectionEntries.date,
        remarks: rejectionEntries.remarks,
        organizationId: rejectionEntries.organizationId,
        createdByUsername: rejectionEntries.createdByUsername,
        importedAt: rejectionEntries.importedAt,
      })
        .from(rejectionEntries)
        .leftJoin(parts, eq(rejectionEntries.partId, parts.id))
        .leftJoin(zones, eq(rejectionEntries.zoneId, zones.id))
        .leftJoin(rejectionTypes, eq(rejectionEntries.rejectionTypeId, rejectionTypes.id))
        .where(eq(rejectionEntries.organizationId, organizationId)),

      db.select({
        partNumber: parts.partNumber,
        zoneName: zones.name,
        rwZone: reworkTypes.zone,
        quantity: reworkEntries.quantity,
        date: reworkEntries.date,
        remarks: reworkEntries.remarks,
        organizationId: reworkEntries.organizationId,
        createdByUsername: reworkEntries.createdByUsername,
        importedAt: reworkEntries.importedAt,
      })
        .from(reworkEntries)
        .leftJoin(parts, eq(reworkEntries.partId, parts.id))
        .leftJoin(zones, eq(reworkEntries.zoneId, zones.id))
        .leftJoin(reworkTypes, eq(reworkEntries.reworkTypeId, reworkTypes.id))
        .where(eq(reworkEntries.organizationId, organizationId)),
    ]);

    const LEGACY = new Set(['rejection', 'rework', '']);

    const allEntries = [
      ...rejectionData.map(entry => ({
        organizationId: entry.organizationId,
        // Resolve zone: prefer zones.name, then rejectionTypes.zone, then 'General'
        zone:
          entry.zoneName ??
          (entry.rejZone && !LEGACY.has(entry.rejZone) ? entry.rejZone : null) ??
          'General',
        // Resolve partNumber: fall back to 'Unknown' to satisfy NOT NULL
        partNumber: entry.partNumber ?? 'Unknown',
        // Resolve type: prefer rejectionTypes.type, fall back to 'rejection'
        type:
          entry.rejTypeName && !LEGACY.has(entry.rejTypeName)
            ? entry.rejTypeName
            : 'rejection',
        quantity: entry.quantity ?? 1,
        date: entry.date,
        remarks: entry.remarks,
        createdByUsername: entry.createdByUsername,
        importedAt: entry.importedAt,
        entryType: 'rejection' as const,
      })),
      ...reworkData.map(entry => ({
        organizationId: entry.organizationId,
        // Resolve zone: prefer zones.name, then reworkTypes.zone, then 'General'
        zone:
          entry.zoneName ??
          (entry.rwZone && !LEGACY.has(entry.rwZone) ? entry.rwZone : null) ??
          'General',
        partNumber: entry.partNumber ?? 'Unknown',
        type: 'rework',
        quantity: entry.quantity ?? 1,
        date: entry.date,
        remarks: entry.remarks,
        createdByUsername: entry.createdByUsername,
        importedAt: entry.importedAt,
        entryType: 'rework' as const,
      })),
    ];

    if (allEntries.length > 0) {
      // Insert in chunks to avoid hitting parameter limits on large datasets
      const CHUNK = 500;
      for (let i = 0; i < allEntries.length; i += CHUNK) {
        await db.insert(issueEntries).values(allEntries.slice(i, i + CHUNK));
      }
    }
  }

  /**
   * Get comprehensive analytics for organization
   */
  async getAnalytics(organizationId: number, period?: AnalyticsPeriod): Promise<AnalyticsData> {
    await this.ensureIssueEntriesPopulated(organizationId);

    const defaultPeriod = this.getDefaultPeriod();
    const analyticsPeriod = period || defaultPeriod;

    const [
      overview,
      last7DaysTrend,
      last30DaysTrend,
      topCategories,
      topItems,
      topIssueTypes,
      dailyTrend,
      insights,
    ] = await Promise.all([
      this.getOverviewStats(organizationId, analyticsPeriod),
      this.getTrendData(organizationId, 7),
      this.getTrendData(organizationId, 30),
      this.getTopCategories(organizationId, analyticsPeriod),
      this.getTopItems(organizationId, analyticsPeriod),
      this.getTopIssueTypes(organizationId, analyticsPeriod),
      this.getDailyTrend(organizationId, analyticsPeriod),
      this.generateInsights(organizationId, analyticsPeriod),
    ]);

    return {
      overview,
      trends: {
        last7Days: last7DaysTrend,
        last30Days: last30DaysTrend,
      },
      topCategories,
      topItems,
      topIssueTypes,
      dailyTrend,
      insights,
    };
  }

  /**
   * Get overview statistics
   *
   * FIX: Now counts unique categories and items properly by querying
   * source tables directly (same pattern as getDailyTrend).
   */
  private async getOverviewStats(organizationId: number, period: AnalyticsPeriod): Promise<OverviewStats> {
    const [rejStats, rwStats] = await Promise.all([
      db.select({
        count: count(),
        totalQuantity: sum(rejectionEntries.quantity).mapWith(Number),
      })
        .from(rejectionEntries)
        .where(and(
          eq(rejectionEntries.organizationId, organizationId),
          gte(rejectionEntries.date, period.from),
          lte(rejectionEntries.date, period.to),
        ))
        .limit(1),

      db.select({
        count: count(),
        totalQuantity: sum(reworkEntries.quantity).mapWith(Number),
      })
        .from(reworkEntries)
        .where(and(
          eq(reworkEntries.organizationId, organizationId),
          gte(reworkEntries.date, period.from),
          lte(reworkEntries.date, period.to),
        ))
        .limit(1),
    ]);

    // Count unique zones across both source tables
    const [uniqueZonesRej, uniqueZonesRw] = await Promise.all([
      db.selectDistinct({ zone: zones.name })
        .from(rejectionEntries)
        .leftJoin(zones, eq(rejectionEntries.zoneId, zones.id))
        .where(and(
          eq(rejectionEntries.organizationId, organizationId),
          gte(rejectionEntries.date, period.from),
          lte(rejectionEntries.date, period.to),
          isNotNull(zones.name),
        )),
      db.selectDistinct({ zone: zones.name })
        .from(reworkEntries)
        .leftJoin(zones, eq(reworkEntries.zoneId, zones.id))
        .where(and(
          eq(reworkEntries.organizationId, organizationId),
          gte(reworkEntries.date, period.from),
          lte(reworkEntries.date, period.to),
          isNotNull(zones.name),
        )),
    ]);

    const uniqueZoneSet = new Set([
      ...uniqueZonesRej.map(r => r.zone),
      ...uniqueZonesRw.map(r => r.zone),
    ]);

    // Count unique parts across both source tables
    const [uniquePartsRej, uniquePartsRw] = await Promise.all([
      db.selectDistinct({ partId: rejectionEntries.partId })
        .from(rejectionEntries)
        .where(and(
          eq(rejectionEntries.organizationId, organizationId),
          gte(rejectionEntries.date, period.from),
          lte(rejectionEntries.date, period.to),
          isNotNull(rejectionEntries.partId),
        )),
      db.selectDistinct({ partId: reworkEntries.partId })
        .from(reworkEntries)
        .where(and(
          eq(reworkEntries.organizationId, organizationId),
          gte(reworkEntries.date, period.from),
          lte(reworkEntries.date, period.to),
          isNotNull(reworkEntries.partId),
        )),
    ]);

    const uniquePartSet = new Set([
      ...uniquePartsRej.map(r => r.partId),
      ...uniquePartsRw.map(r => r.partId),
    ]);

    const totalCount = (rejStats[0]?.count || 0) + (rwStats[0]?.count || 0);
    const totalQuantity = (rejStats[0]?.totalQuantity || 0) + (rwStats[0]?.totalQuantity || 0);

    return {
      totalIssues: totalCount,
      totalQuantity,
      avgQuantityPerIssue: totalCount > 0 ? totalQuantity / totalCount : 0,
      uniqueCategories: uniqueZoneSet.size,
      uniqueItems: uniquePartSet.size,
      uniqueIssueTypes: 2, // rejection + rework
    };
  }

  /**
   * Get trend data comparing current vs previous period
   */
  private async getTrendData(organizationId: number, days: number): Promise<TrendData> {
    const now = new Date();
    const currentFrom = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const previousTo = currentFrom;
    const previousFrom = new Date(previousTo.getTime() - days * 24 * 60 * 60 * 1000);

    const [currentData, previousData] = await Promise.all([
      this.getPeriodStats(organizationId, currentFrom, now),
      this.getPeriodStats(organizationId, previousFrom, previousTo),
    ]);

    const countChange =
      previousData.count > 0
        ? ((currentData.count - previousData.count) / previousData.count) * 100
        : 0;

    const quantityChange =
      previousData.quantity > 0
        ? ((currentData.quantity - previousData.quantity) / previousData.quantity) * 100
        : 0;

    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (Math.abs(countChange) > 10) {
      trend = countChange > 0 ? 'increasing' : 'decreasing';
    }

    return {
      period: `Last ${days} days`,
      current: currentData,
      previous: previousData,
      changePercent: {
        count: countChange,
        quantity: quantityChange,
      },
      trend,
    };
  }

  /**
   * Get stats for a specific period — queries source tables directly
   */
  private async getPeriodStats(organizationId: number, from: Date, to: Date) {
    const [rejResult, rwResult] = await Promise.all([
      db
        .select({ count: count(), quantity: sum(rejectionEntries.quantity).mapWith(Number) })
        .from(rejectionEntries)
        .where(and(
          eq(rejectionEntries.organizationId, organizationId),
          gte(rejectionEntries.date, from),
          lte(rejectionEntries.date, to),
        ))
        .limit(1),
      db
        .select({ count: count(), quantity: sum(reworkEntries.quantity).mapWith(Number) })
        .from(reworkEntries)
        .where(and(
          eq(reworkEntries.organizationId, organizationId),
          gte(reworkEntries.date, from),
          lte(reworkEntries.date, to),
        ))
        .limit(1),
    ]);
    return {
      count: (rejResult[0]?.count || 0) + (rwResult[0]?.count || 0),
      quantity: (rejResult[0]?.quantity || 0) + (rwResult[0]?.quantity || 0),
    };
  }

  /**
   * Get top categories/zones/stations
   *
   * Queries source tables directly — not issueEntries — so zone data is
   * always accurate regardless of issueEntries population state.
   */
  private async getTopCategories(organizationId: number, period: AnalyticsPeriod): Promise<TopCategory[]> {
    const LEGACY = new Set(['rejection', 'rework', '']);
    const isLegacy = (v: string | null | undefined) => !v || LEGACY.has(v);

    const [rejRows, rwRows] = await Promise.all([
      db.select({
        zoneName: zones.name,
        rejTypeZone: rejectionTypes.zone,
        quantity: rejectionEntries.quantity,
      })
        .from(rejectionEntries)
        .leftJoin(zones, eq(rejectionEntries.zoneId, zones.id))
        .leftJoin(rejectionTypes, eq(rejectionEntries.rejectionTypeId, rejectionTypes.id))
        .where(and(
          eq(rejectionEntries.organizationId, organizationId),
          gte(rejectionEntries.date, period.from),
          lte(rejectionEntries.date, period.to),
        )),

      db.select({
        zoneName: zones.name,
        rwTypeZone: reworkTypes.zone,
        quantity: reworkEntries.quantity,
      })
        .from(reworkEntries)
        .leftJoin(zones, eq(reworkEntries.zoneId, zones.id))
        .leftJoin(reworkTypes, eq(reworkEntries.reworkTypeId, reworkTypes.id))
        .where(and(
          eq(reworkEntries.organizationId, organizationId),
          gte(reworkEntries.date, period.from),
          lte(reworkEntries.date, period.to),
        )),
    ]);

    const map = new Map<string, { count: number; quantity: number }>();

    for (const r of rejRows) {
      const zone =
        r.zoneName ??
        (!isLegacy(r.rejTypeZone) ? r.rejTypeZone! : 'General');
      const e = map.get(zone) ?? { count: 0, quantity: 0 };
      e.count += 1;
      e.quantity += r.quantity ?? 0;
      map.set(zone, e);
    }
    for (const r of rwRows) {
      const zone =
        r.zoneName ??
        (!isLegacy(r.rwTypeZone) ? r.rwTypeZone! : 'General');
      const e = map.get(zone) ?? { count: 0, quantity: 0 };
      e.count += 1;
      e.quantity += r.quantity ?? 0;
      map.set(zone, e);
    }

    const total = Array.from(map.values()).reduce((s, v) => s + v.count, 0) || 1;
    return Array.from(map.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([name, { count: cnt, quantity }]) => ({
        name,
        count: cnt,
        quantity,
        percentage: (cnt / total) * 100,
        topIssueType: 'N/A',
      }));
  }

  /**
   * Get top items/products/batches — queries source tables directly
   */
  private async getTopItems(organizationId: number, period: AnalyticsPeriod): Promise<TopItem[]> {
    const [rejRows, rwRows] = await Promise.all([
      db.select({ partNumber: parts.partNumber, quantity: rejectionEntries.quantity })
        .from(rejectionEntries)
        .leftJoin(parts, eq(rejectionEntries.partId, parts.id))
        .where(and(
          eq(rejectionEntries.organizationId, organizationId),
          gte(rejectionEntries.date, period.from),
          lte(rejectionEntries.date, period.to),
        )),

      db.select({ partNumber: parts.partNumber, quantity: reworkEntries.quantity })
        .from(reworkEntries)
        .leftJoin(parts, eq(reworkEntries.partId, parts.id))
        .where(and(
          eq(reworkEntries.organizationId, organizationId),
          gte(reworkEntries.date, period.from),
          lte(reworkEntries.date, period.to),
        )),
    ]);

    const map = new Map<string, { count: number; quantity: number }>();
    for (const r of [...rejRows, ...rwRows]) {
      const pn = r.partNumber ?? 'Unknown';
      const e = map.get(pn) ?? { count: 0, quantity: 0 };
      e.count += 1;
      e.quantity += r.quantity ?? 0;
      map.set(pn, e);
    }

    const total = Array.from(map.values()).reduce((s, v) => s + v.count, 0) || 1;
    return Array.from(map.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([name, { count: cnt, quantity }]) => ({
        name,
        count: cnt,
        quantity,
        percentage: (cnt / total) * 100,
        topIssueType: 'N/A',
      }));
  }

  /**
   * Get top issue types
   *
   * FIX: topCategory sub-query now joins source tables directly instead of
   * reading issueEntries.zone (which was NULL before the insert fix).
   */
  private async getTopIssueTypes(organizationId: number, period: AnalyticsPeriod): Promise<TopIssueType[]> {
    // Count rejections per type
    const rejTypeCounts = await db.select({
      typeName: rejectionTypes.type,
      count: count(),
      quantity: sum(rejectionEntries.quantity).mapWith(Number),
    })
      .from(rejectionEntries)
      .leftJoin(rejectionTypes, eq(rejectionEntries.rejectionTypeId, rejectionTypes.id))
      .where(and(
        eq(rejectionEntries.organizationId, organizationId),
        gte(rejectionEntries.date, period.from),
        lte(rejectionEntries.date, period.to),
      ))
      .groupBy(rejectionTypes.type)
      .orderBy(desc(count()));

    // Rework is always one "type"
    const rwStats = await db.select({
      count: count(),
      quantity: sum(reworkEntries.quantity).mapWith(Number),
    })
      .from(reworkEntries)
      .where(and(
        eq(reworkEntries.organizationId, organizationId),
        gte(reworkEntries.date, period.from),
        lte(reworkEntries.date, period.to),
      ))
      .limit(1);

    const totalIssues =
      rejTypeCounts.reduce((s, r) => s + r.count, 0) +
      (rwStats[0]?.count || 0);

    const result: TopIssueType[] = [];

    // Process rejection types — get top zone and top part for each
    for (const rt of rejTypeCounts) {
      const typeName = rt.typeName ?? 'rejection';

      const [topZoneRows, topPartRows] = await Promise.all([
        db.select({ zoneName: zones.name, cnt: count() })
          .from(rejectionEntries)
          .leftJoin(rejectionTypes, eq(rejectionEntries.rejectionTypeId, rejectionTypes.id))
          .leftJoin(zones, eq(rejectionEntries.zoneId, zones.id))
          .where(and(
            eq(rejectionEntries.organizationId, organizationId),
            eq(rejectionTypes.type, typeName),
            gte(rejectionEntries.date, period.from),
            lte(rejectionEntries.date, period.to),
            isNotNull(zones.name),
          ))
          .groupBy(zones.name)
          .orderBy(desc(count()))
          .limit(1),

        db.select({ partNumber: parts.partNumber, cnt: count() })
          .from(rejectionEntries)
          .leftJoin(rejectionTypes, eq(rejectionEntries.rejectionTypeId, rejectionTypes.id))
          .leftJoin(parts, eq(rejectionEntries.partId, parts.id))
          .where(and(
            eq(rejectionEntries.organizationId, organizationId),
            eq(rejectionTypes.type, typeName),
            gte(rejectionEntries.date, period.from),
            lte(rejectionEntries.date, period.to),
            isNotNull(parts.partNumber),
          ))
          .groupBy(parts.partNumber)
          .orderBy(desc(count()))
          .limit(1),
      ]);

      result.push({
        name: typeName,
        count: rt.count,
        quantity: rt.quantity ?? 0,
        percentage: totalIssues > 0 ? (rt.count / totalIssues) * 100 : 0,
        topCategory: topZoneRows[0]?.zoneName ?? 'Unknown',
        topItem: topPartRows[0]?.partNumber ?? 'Unknown',
      });
    }

    // Add rework as a single type entry if it has data
    if ((rwStats[0]?.count ?? 0) > 0) {
      const [topZoneRows, topPartRows] = await Promise.all([
        db.select({ zoneName: zones.name, cnt: count() })
          .from(reworkEntries)
          .leftJoin(zones, eq(reworkEntries.zoneId, zones.id))
          .where(and(
            eq(reworkEntries.organizationId, organizationId),
            gte(reworkEntries.date, period.from),
            lte(reworkEntries.date, period.to),
            isNotNull(zones.name),
          ))
          .groupBy(zones.name)
          .orderBy(desc(count()))
          .limit(1),

        db.select({ partNumber: parts.partNumber, cnt: count() })
          .from(reworkEntries)
          .leftJoin(parts, eq(reworkEntries.partId, parts.id))
          .where(and(
            eq(reworkEntries.organizationId, organizationId),
            gte(reworkEntries.date, period.from),
            lte(reworkEntries.date, period.to),
            isNotNull(parts.partNumber),
          ))
          .groupBy(parts.partNumber)
          .orderBy(desc(count()))
          .limit(1),
      ]);

      result.push({
        name: 'rework',
        count: rwStats[0]?.count ?? 0,
        quantity: rwStats[0]?.quantity ?? 0,
        percentage: totalIssues > 0 ? ((rwStats[0]?.count ?? 0) / totalIssues) * 100 : 0,
        topCategory: topZoneRows[0]?.zoneName ?? 'Unknown',
        topItem: topPartRows[0]?.partNumber ?? 'Unknown',
      });
    }

    return result.sort((a, b) => b.count - a.count).slice(0, 10);
  }

  /**
   * Get daily trend data — queries source tables directly (unchanged, already correct)
   */
  private async getDailyTrend(organizationId: number, period: AnalyticsPeriod): Promise<DailyTrend[]> {
    const [rejRows, rwRows] = await Promise.all([
      db.select({
        date: sql<string>`DATE(${rejectionEntries.date})`,
        count: count(),
        quantity: sum(rejectionEntries.quantity).mapWith(Number),
      })
        .from(rejectionEntries)
        .where(and(
          eq(rejectionEntries.organizationId, organizationId),
          gte(rejectionEntries.date, period.from),
          lte(rejectionEntries.date, period.to),
        ))
        .groupBy(sql`DATE(${rejectionEntries.date})`),

      db.select({
        date: sql<string>`DATE(${reworkEntries.date})`,
        count: count(),
        quantity: sum(reworkEntries.quantity).mapWith(Number),
      })
        .from(reworkEntries)
        .where(and(
          eq(reworkEntries.organizationId, organizationId),
          gte(reworkEntries.date, period.from),
          lte(reworkEntries.date, period.to),
        ))
        .groupBy(sql`DATE(${reworkEntries.date})`),
    ]);

    const map = new Map<string, { count: number; quantity: number }>();
    for (const r of rejRows) {
      const e = map.get(r.date) ?? { count: 0, quantity: 0 };
      e.count += r.count;
      e.quantity += r.quantity ?? 0;
      map.set(r.date, e);
    }
    for (const r of rwRows) {
      const e = map.get(r.date) ?? { count: 0, quantity: 0 };
      e.count += r.count;
      e.quantity += r.quantity ?? 0;
      map.set(r.date, e);
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { count, quantity }]) => ({ date, count, quantity }));
  }

  /**
   * Generate insight summaries
   *
   * FIX: "Biggest Problem Zone" now queries source tables directly instead of
   * issueEntries.zone, which was always NULL before the insert fix and caused
   * the card to always display "Unknown".
   */
  private async generateInsights(organizationId: number, period: AnalyticsPeriod): Promise<InsightSummary[]> {
    const insights: InsightSummary[] = [];

    // Top rejection reason
    const topRejectionReason = await db.select({
      reason: rejectionTypes.reason,
      code: rejectionTypes.rejectionCode,
      count: count(),
    })
      .from(rejectionEntries)
      .leftJoin(rejectionTypes, eq(rejectionEntries.rejectionTypeId, rejectionTypes.id))
      .where(and(
        eq(rejectionEntries.organizationId, organizationId),
        gte(rejectionEntries.date, period.from),
        lte(rejectionEntries.date, period.to),
      ))
      .groupBy(rejectionTypes.reason, rejectionTypes.rejectionCode)
      .orderBy(desc(count()))
      .limit(1);

    if (topRejectionReason.length > 0) {
      insights.push({
        type: 'top_issue',
        title: 'Top Rejection Reason',
        description: `Code: ${topRejectionReason[0].code} — most frequent rejection in this period`,
        value: topRejectionReason[0].reason ?? topRejectionReason[0].code ?? 'Unknown',
        confidence: 0.95,
      });
    }

    // Top rework type (reworkTypes has no `type` col — use reworkCode/reason)
    const topReworkType = await db.select({
      reason: reworkTypes.reason,
      code: reworkTypes.reworkCode,
      count: count(),
    })
      .from(reworkEntries)
      .leftJoin(reworkTypes, eq(reworkEntries.reworkTypeId, reworkTypes.id))
      .where(and(
        eq(reworkEntries.organizationId, organizationId),
        gte(reworkEntries.date, period.from),
        lte(reworkEntries.date, period.to),
      ))
      .groupBy(reworkTypes.reason, reworkTypes.reworkCode)
      .orderBy(desc(count()))
      .limit(1);

    if (topReworkType.length > 0) {
      insights.push({
        type: 'top_issue',
        title: 'Top Rework Type',
        description: `Code: ${topReworkType[0].code} — most frequent rework in this period`,
        value: topReworkType[0].reason ?? topReworkType[0].code ?? 'Unknown',
        confidence: 0.95,
      });
    }

    // Biggest problem zone — query source tables directly (FIX: was using issueEntries.zone which was always NULL)
    const [topZoneRej, topZoneRw] = await Promise.all([
      db.select({ zoneName: zones.name, cnt: count() })
        .from(rejectionEntries)
        .leftJoin(zones, eq(rejectionEntries.zoneId, zones.id))
        .where(and(
          eq(rejectionEntries.organizationId, organizationId),
          gte(rejectionEntries.date, period.from),
          lte(rejectionEntries.date, period.to),
          isNotNull(zones.name),
        ))
        .groupBy(zones.name)
        .orderBy(desc(count()))
        .limit(5),

      db.select({ zoneName: zones.name, cnt: count() })
        .from(reworkEntries)
        .leftJoin(zones, eq(reworkEntries.zoneId, zones.id))
        .where(and(
          eq(reworkEntries.organizationId, organizationId),
          gte(reworkEntries.date, period.from),
          lte(reworkEntries.date, period.to),
          isNotNull(zones.name),
        ))
        .groupBy(zones.name)
        .orderBy(desc(count()))
        .limit(5),
    ]);

    // Merge zone counts from both tables
    const zoneMap = new Map<string, number>();
    for (const r of [...topZoneRej, ...topZoneRw]) {
      if (r.zoneName) {
        zoneMap.set(r.zoneName, (zoneMap.get(r.zoneName) ?? 0) + r.cnt);
      }
    }

    if (zoneMap.size > 0) {
      const topZone = Array.from(zoneMap.entries()).sort((a, b) => b[1] - a[1])[0];
      insights.push({
        type: 'problem_area',
        title: 'Biggest Problem Zone',
        description: 'Zone with the most issues — requires immediate attention',
        value: topZone[0],
        confidence: 0.85,
      });
    }

    // Trend change
    const trend7Days = await this.getTrendData(organizationId, 7);
    if (trend7Days.trend !== 'stable') {
      insights.push({
        type: 'trend_change',
        title: 'Significant Trend Change',
        description: `Issues ${trend7Days.trend} compared to last week`,
        value: `${trend7Days.changePercent.count.toFixed(1)}%`,
        change: trend7Days.trend === 'increasing' ? '↑' : '↓',
        confidence: 0.8,
      });
    }

    return insights;
  }

  /**
   * Get field labels (manufacturing defaults)
   */
  async getFieldLabels(organizationId: number): Promise<Record<string, string>> {
    return {
      zone: 'Zone',
      partNumber: 'Part Number',
      type: 'Issue Type',
      quantity: 'Quantity',
    };
  }

  /**
   * Update organization template (no-op, template system removed)
   */
  async updateOrganizationTemplate(organizationId: number, templateId: string): Promise<void> {
    // Template system removed
  }

  /**
   * Get default period (last 30 days)
   */
  private getDefaultPeriod(): AnalyticsPeriod {
    const now = new Date();
    const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { from, to: now };
  }
}
