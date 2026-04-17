import { db } from "../storage";
import { issueEntries, organizations, rejectionEntries, reworkEntries, parts, rejectionTypes, reworkTypes, zones } from "@shared/schema";
import { eq, and, gte, lte, desc, count, sum, sql, inArray } from "drizzle-orm";

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
   * Ensure issueEntries is populated with data from existing tables
   */
  private async ensureIssueEntriesPopulated(organizationId: number): Promise<void> {
    // Check if issueEntries has data for this org
    const existingEntries = await db.select({ count: count() })
      .from(issueEntries)
      .where(eq(issueEntries.organizationId, organizationId))
      .limit(1);

    if (existingEntries[0]?.count > 0) {
      return; // Already populated
    }

    // Get data from existing tables
    const [rejectionData, reworkData] = await Promise.all([
      db.select({
        partNumber: parts.partNumber,
        zone: zones.name,
        type: rejectionTypes.type,
        quantity: rejectionEntries.quantity,
        date: rejectionEntries.date,
        remarks: rejectionEntries.remarks,
        organizationId: rejectionEntries.organizationId,
        createdByUsername: rejectionEntries.createdByUsername,
        importedAt: rejectionEntries.importedAt
      })
      .from(rejectionEntries)
      .leftJoin(parts, eq(rejectionEntries.partId, parts.id))
      .leftJoin(zones, eq(rejectionEntries.zoneId, zones.id))
      .leftJoin(rejectionTypes, eq(rejectionEntries.rejectionTypeId, rejectionTypes.id))
      .where(eq(rejectionEntries.organizationId, organizationId)),
      
      db.select({
        partNumber: parts.partNumber,
        zone: zones.name,
        type: sql<string>`'rework'`,
        quantity: reworkEntries.quantity,
        date: reworkEntries.date,
        remarks: reworkEntries.remarks,
        organizationId: reworkEntries.organizationId,
        createdByUsername: reworkEntries.createdByUsername,
        importedAt: reworkEntries.importedAt
      })
      .from(reworkEntries)
      .leftJoin(parts, eq(reworkEntries.partId, parts.id))
      .leftJoin(zones, eq(reworkEntries.zoneId, zones.id))
      .where(eq(reworkEntries.organizationId, organizationId))
    ]);

    // Combine and insert into issueEntries
    const allEntries = [
      ...rejectionData.map(entry => ({
        ...entry,
        entryType: 'rejection'
      })),
      ...reworkData.map(entry => ({
        ...entry,
        entryType: 'rework'
      }))
    ];

    if (allEntries.length > 0) {
      await db.insert(issueEntries).values(allEntries);
    }
  }

  /**
   * Get comprehensive analytics for organization
   */
  async getAnalytics(organizationId: number, period?: AnalyticsPeriod): Promise<AnalyticsData> {
    // Ensure issueEntries is populated with existing data
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
      insights
    ] = await Promise.all([
      this.getOverviewStats(organizationId, analyticsPeriod),
      this.getTrendData(organizationId, 7),
      this.getTrendData(organizationId, 30),
      this.getTopCategories(organizationId, analyticsPeriod),
      this.getTopItems(organizationId, analyticsPeriod),
      this.getTopIssueTypes(organizationId, analyticsPeriod),
      this.getDailyTrend(organizationId, analyticsPeriod),
      this.generateInsights(organizationId, analyticsPeriod)
    ]);

    return {
      overview,
      trends: {
        last7Days: last7DaysTrend,
        last30Days: last30DaysTrend
      },
      topCategories,
      topItems,
      topIssueTypes,
      dailyTrend,
      insights
    };
  }

  /**
   * Get overview statistics
   */
  private async getOverviewStats(organizationId: number, period: AnalyticsPeriod): Promise<OverviewStats> {
    const [rejStats, rwStats] = await Promise.all([
      db.select({
        count: count(),
        totalQuantity: sum(rejectionEntries.quantity).mapWith(Number),
      })
      .from(rejectionEntries)
      .where(and(eq(rejectionEntries.organizationId, organizationId), gte(rejectionEntries.date, period.from), lte(rejectionEntries.date, period.to)))
      .limit(1),

      db.select({
        count: count(),
        totalQuantity: sum(reworkEntries.quantity).mapWith(Number),
      })
      .from(reworkEntries)
      .where(and(eq(reworkEntries.organizationId, organizationId), gte(reworkEntries.date, period.from), lte(reworkEntries.date, period.to)))
      .limit(1),
    ]);

    const totalCount = (rejStats[0]?.count || 0) + (rwStats[0]?.count || 0);
    const totalQuantity = (rejStats[0]?.totalQuantity || 0) + (rwStats[0]?.totalQuantity || 0);

    return {
      totalIssues: totalCount,
      totalQuantity,
      avgQuantityPerIssue: totalCount > 0 ? totalQuantity / totalCount : 0,
      uniqueCategories: 0,
      uniqueItems: 0,
      uniqueIssueTypes: 2,
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
      this.getPeriodStats(organizationId, previousFrom, previousTo)
    ]);

    const countChange = previousData.count > 0 
      ? ((currentData.count - previousData.count) / previousData.count) * 100 
      : 0;

    const quantityChange = previousData.quantity > 0 
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
        quantity: quantityChange
      },
      trend
    };
  }

  /**
   * Get stats for a specific period
   */
  private async getPeriodStats(organizationId: number, from: Date, to: Date) {
    const [rejResult, rwResult] = await Promise.all([
      db.select({ count: count(), quantity: sum(rejectionEntries.quantity).mapWith(Number) })
        .from(rejectionEntries)
        .where(and(eq(rejectionEntries.organizationId, organizationId), gte(rejectionEntries.date, from), lte(rejectionEntries.date, to)))
        .limit(1),
      db.select({ count: count(), quantity: sum(reworkEntries.quantity).mapWith(Number) })
        .from(reworkEntries)
        .where(and(eq(reworkEntries.organizationId, organizationId), gte(reworkEntries.date, from), lte(reworkEntries.date, to)))
        .limit(1),
    ]);
    return {
      count: (rejResult[0]?.count || 0) + (rwResult[0]?.count || 0),
      quantity: (rejResult[0]?.quantity || 0) + (rwResult[0]?.quantity || 0),
    };
  }

  /**
   * Get top categories/zones/stations
   */
  private async getTopCategories(organizationId: number, period: AnalyticsPeriod): Promise<TopCategory[]> {
    const LEGACY = new Set(['rejection', 'rework', '']);
    const isLegacy = (v: string | null | undefined) => !v || LEGACY.has(v);

    const [rejRows, rwRows] = await Promise.all([
      db.select({
        zoneName: zones.name,
        rejType: rejectionTypes.type,
        quantity: rejectionEntries.quantity,
      })
      .from(rejectionEntries)
      .leftJoin(zones, eq(rejectionEntries.zoneId, zones.id))
      .leftJoin(rejectionTypes, eq(rejectionEntries.rejectionTypeId, rejectionTypes.id))
      .where(and(eq(rejectionEntries.organizationId, organizationId), gte(rejectionEntries.date, period.from), lte(rejectionEntries.date, period.to))),

      db.select({
        zoneName: zones.name,
        rwZone: reworkTypes.zone,
        quantity: reworkEntries.quantity,
      })
      .from(reworkEntries)
      .leftJoin(zones, eq(reworkEntries.zoneId, zones.id))
      .leftJoin(reworkTypes, eq(reworkEntries.reworkTypeId, reworkTypes.id))
      .where(and(eq(reworkEntries.organizationId, organizationId), gte(reworkEntries.date, period.from), lte(reworkEntries.date, period.to))),
    ]);

    const map = new Map<string, { count: number; quantity: number }>();

    for (const r of rejRows) {
      const zone = r.zoneName ?? (!isLegacy(r.rejType) ? r.rejType! : 'General');
      const e = map.get(zone) ?? { count: 0, quantity: 0 };
      e.count += r.quantity ?? 1;
      e.quantity += r.quantity ?? 0;
      map.set(zone, e);
    }
    for (const r of rwRows) {
      const zone = r.zoneName ?? (!isLegacy(r.rwZone) ? r.rwZone! : 'General');
      const e = map.get(zone) ?? { count: 0, quantity: 0 };
      e.count += r.quantity ?? 1;
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
   * Get top items/products/batches
   */
  private async getTopItems(organizationId: number, period: AnalyticsPeriod): Promise<TopItem[]> {
    const [rejRows, rwRows] = await Promise.all([
      db.select({ partNumber: parts.partNumber, quantity: rejectionEntries.quantity })
        .from(rejectionEntries)
        .leftJoin(parts, eq(rejectionEntries.partId, parts.id))
        .where(and(eq(rejectionEntries.organizationId, organizationId), gte(rejectionEntries.date, period.from), lte(rejectionEntries.date, period.to))),

      db.select({ partNumber: parts.partNumber, quantity: reworkEntries.quantity })
        .from(reworkEntries)
        .leftJoin(parts, eq(reworkEntries.partId, parts.id))
        .where(and(eq(reworkEntries.organizationId, organizationId), gte(reworkEntries.date, period.from), lte(reworkEntries.date, period.to))),
    ]);

    const map = new Map<string, { count: number; quantity: number }>();
    for (const r of [...rejRows, ...rwRows]) {
      const pn = r.partNumber ?? 'Unknown';
      const e = map.get(pn) ?? { count: 0, quantity: 0 };
      e.count += r.quantity ?? 1;
      e.quantity += r.quantity ?? 0;
      map.set(pn, e);
    }

    const total = Array.from(map.values()).reduce((s, v) => s + v.quantity, 0) || 1;
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
   * Get top issue types — returns actual rejection reasons + rework types sorted by quantity
   */
  private async getTopIssueTypes(organizationId: number, period: AnalyticsPeriod): Promise<TopIssueType[]> {
    const [rejRows, rwRows] = await Promise.all([
      db.select({
        reason: rejectionTypes.reason,
        code: rejectionTypes.rejectionCode,
        rejReason: rejectionEntries.rejectionReason,
        rejCode: rejectionEntries.rejectionReasonCode,
        quantity: rejectionEntries.quantity,
        partNumber: parts.partNumber,
      })
      .from(rejectionEntries)
      .leftJoin(rejectionTypes, eq(rejectionEntries.rejectionTypeId, rejectionTypes.id))
      .leftJoin(parts, eq(rejectionEntries.partId, parts.id))
      .where(and(eq(rejectionEntries.organizationId, organizationId), gte(rejectionEntries.date, period.from), lte(rejectionEntries.date, period.to))),

      db.select({
        reason: reworkTypes.reason,
        code: reworkTypes.reworkCode,
        quantity: reworkEntries.quantity,
        partNumber: parts.partNumber,
      })
      .from(reworkEntries)
      .leftJoin(reworkTypes, eq(reworkEntries.reworkTypeId, reworkTypes.id))
      .leftJoin(parts, eq(reworkEntries.partId, parts.id))
      .where(and(eq(reworkEntries.organizationId, organizationId), gte(reworkEntries.date, period.from), lte(reworkEntries.date, period.to))),
    ]);

    // Map: reason name → { quantity, topItem }
    const map = new Map<string, { quantity: number; partCounts: Map<string, number> }>();

    for (const r of rejRows) {
      const name = r.reason ?? r.rejReason ?? r.code ?? r.rejCode ?? 'Unknown';
      const e = map.get(name) ?? { quantity: 0, partCounts: new Map() };
      e.quantity += r.quantity ?? 0;
      if (r.partNumber) e.partCounts.set(r.partNumber, (e.partCounts.get(r.partNumber) ?? 0) + (r.quantity ?? 0));
      map.set(name, e);
    }
    for (const r of rwRows) {
      const name = r.reason ?? r.code ?? 'Unknown';
      const e = map.get(name) ?? { quantity: 0, partCounts: new Map() };
      e.quantity += r.quantity ?? 0;
      if (r.partNumber) e.partCounts.set(r.partNumber, (e.partCounts.get(r.partNumber) ?? 0) + (r.quantity ?? 0));
      map.set(name, e);
    }

    const total = Array.from(map.values()).reduce((s, v) => s + v.quantity, 0) || 1;
    return Array.from(map.entries())
      .sort((a, b) => b[1].quantity - a[1].quantity)
      .slice(0, 10)
      .map(([name, { quantity, partCounts }]) => {
        const topItem = Array.from(partCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Unknown';
        return {
          name,
          count: quantity,
          quantity,
          percentage: (quantity / total) * 100,
          topCategory: 'N/A',
          topItem,
        };
      });
  }

  /**
   * Get daily trend data
   */
  private async getDailyTrend(organizationId: number, period: AnalyticsPeriod): Promise<DailyTrend[]> {
    // Query directly from rejectionEntries and reworkEntries to avoid stale issueEntries cache
    const [rejRows, rwRows] = await Promise.all([
      db.select({
        date: sql<string>`DATE(${rejectionEntries.date})`,
        count: count(),
        quantity: sum(rejectionEntries.quantity).mapWith(Number)
      })
      .from(rejectionEntries)
      .where(and(
        eq(rejectionEntries.organizationId, organizationId),
        gte(rejectionEntries.date, period.from),
        lte(rejectionEntries.date, period.to)
      ))
      .groupBy(sql`DATE(${rejectionEntries.date})`),

      db.select({
        date: sql<string>`DATE(${reworkEntries.date})`,
        count: count(),
        quantity: sum(reworkEntries.quantity).mapWith(Number)
      })
      .from(reworkEntries)
      .where(and(
        eq(reworkEntries.organizationId, organizationId),
        gte(reworkEntries.date, period.from),
        lte(reworkEntries.date, period.to)
      ))
      .groupBy(sql`DATE(${reworkEntries.date})`)
    ]);

    // Merge by date
    const map = new Map<string, { count: number; quantity: number }>();
    for (const r of rejRows) {
      const d = r.date;
      const e = map.get(d) ?? { count: 0, quantity: 0 };
      e.count += r.count;
      e.quantity += r.quantity ?? 0;
      map.set(d, e);
    }
    for (const r of rwRows) {
      const d = r.date;
      const e = map.get(d) ?? { count: 0, quantity: 0 };
      e.count += r.count;
      e.quantity += r.quantity ?? 0;
      map.set(d, e);
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { count, quantity }]) => ({ date, count, quantity }));
  }

  /**
   * Generate insight summaries
   */
  private async generateInsights(organizationId: number, period: AnalyticsPeriod): Promise<InsightSummary[]> {
    const insights: InsightSummary[] = [];

    // Top rejection reason
    const topRejectionReason = await db.select({
      reason: rejectionTypes.reason,
      code: rejectionTypes.rejectionCode,
      count: count()
    })
    .from(rejectionEntries)
    .leftJoin(rejectionTypes, eq(rejectionEntries.rejectionTypeId, rejectionTypes.id))
    .where(and(
      eq(rejectionEntries.organizationId, organizationId),
      gte(rejectionEntries.date, period.from),
      lte(rejectionEntries.date, period.to)
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
        confidence: 0.95
      });
    }

    // Top rework type
    const topReworkType = await db.select({
      reason: reworkTypes.reason,
      code: reworkTypes.reworkCode,
      count: count()
    })
    .from(reworkEntries)
    .leftJoin(reworkTypes, eq(reworkEntries.reworkTypeId, reworkTypes.id))
    .where(and(
      eq(reworkEntries.organizationId, organizationId),
      gte(reworkEntries.date, period.from),
      lte(reworkEntries.date, period.to)
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
        confidence: 0.95
      });
    }

    // Get biggest problem zone
    const topZone = await db.select({
      zone: issueEntries.zone,
      count: count()
    })
    .from(issueEntries)
    .where(and(
      eq(issueEntries.organizationId, organizationId),
      gte(issueEntries.date, period.from),
      lte(issueEntries.date, period.to),
      sql`${issueEntries.zone} IS NOT NULL`
    ))
    .groupBy(issueEntries.zone)
    .orderBy(desc(count()))
    .limit(1);

    if (topZone.length > 0) {
      insights.push({
        type: 'problem_area',
        title: 'Biggest Problem Zone',
        description: 'Zone with the most issues — requires immediate attention',
        value: topZone[0].zone ?? 'Unknown',
        confidence: 0.85
      });
    }

    // Get trend change
    const trend7Days = await this.getTrendData(organizationId, 7);
    if (trend7Days.trend !== 'stable') {
      insights.push({
        type: 'trend_change',
        title: 'Significant Trend Change',
        description: `Issues ${trend7Days.trend} compared to last week`,
        value: `${trend7Days.changePercent.count.toFixed(1)}%`,
        change: trend7Days.trend === 'increasing' ? '↑' : '↓',
        confidence: 0.8
      });
    }

    return insights;
  }

  /**
   * Get field labels (manufacturing defaults, no template system)
   */
  async getFieldLabels(organizationId: number): Promise<Record<string, string>> {
    return {
      zone: 'Zone',
      partNumber: 'Part Number',
      type: 'Issue Type',
      quantity: 'Quantity'
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
