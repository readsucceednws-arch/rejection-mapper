import { db } from "../storage";
import { rejectionEntries, reworkEntries, parts, rejectionTypes, reworkTypes, zones } from "@shared/schema";
import { eq, and, gte, lte, desc, count, sum, sql } from "drizzle-orm";

/**
 * Advanced Analytics Service
 * Queries rejectionEntries and reworkEntries directly — no issueEntries sync needed.
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
  current: { count: number; quantity: number };
  previous: { count: number; quantity: number };
  changePercent: { count: number; quantity: number };
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
  trends: { last7Days: TrendData; last30Days: TrendData };
  topCategories: TopCategory[];
  topItems: TopItem[];
  topIssueTypes: TopIssueType[];
  dailyTrend: DailyTrend[];
  insights: InsightSummary[];
}

// ─── helpers ────────────────────────────────────────────────────────────────

function mergeDateRows(
  a: { date: string; count: number; quantity: number }[],
  b: { date: string; count: number; quantity: number }[]
) {
  const map = new Map<string, { count: number; quantity: number }>();
  for (const r of [...a, ...b]) {
    const e = map.get(r.date) ?? { count: 0, quantity: 0 };
    e.count += r.count;
    e.quantity += r.quantity ?? 0;
    map.set(r.date, e);
  }
  return map;
}

// ─── service ────────────────────────────────────────────────────────────────

export class AnalyticsService {

  async getAnalytics(organizationId: number, period?: AnalyticsPeriod): Promise<AnalyticsData> {
    const analyticsPeriod = period ?? this.getDefaultPeriod();

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
      trends: { last7Days: last7DaysTrend, last30Days: last30DaysTrend },
      topCategories,
      topItems,
      topIssueTypes,
      dailyTrend,
      insights,
    };
  }

  // ── overview ──────────────────────────────────────────────────────────────

  private async getOverviewStats(organizationId: number, period: AnalyticsPeriod): Promise<OverviewStats> {
    const [rejStats, rwStats] = await Promise.all([
      db.select({
        count: count(),
        totalQuantity: sum(rejectionEntries.quantity).mapWith(Number),
        uniqueZones: sql<string>`COUNT(DISTINCT ${zones.name})`,
        uniqueParts: sql<string>`COUNT(DISTINCT ${parts.partNumber})`,
        uniqueTypes: sql<string>`COUNT(DISTINCT ${rejectionTypes.type})`,
      })
      .from(rejectionEntries)
      .leftJoin(parts, eq(rejectionEntries.partId, parts.id))
      .leftJoin(zones, eq(rejectionEntries.zoneId, zones.id))
      .leftJoin(rejectionTypes, eq(rejectionEntries.rejectionTypeId, rejectionTypes.id))
      .where(and(
        eq(rejectionEntries.organizationId, organizationId),
        gte(rejectionEntries.date, period.from),
        lte(rejectionEntries.date, period.to),
      )),

      db.select({
        count: count(),
        totalQuantity: sum(reworkEntries.quantity).mapWith(Number),
      })
      .from(reworkEntries)
      .where(and(
        eq(reworkEntries.organizationId, organizationId),
        gte(reworkEntries.date, period.from),
        lte(reworkEntries.date, period.to),
      )),
    ]);

    const totalIssues = (rejStats[0]?.count ?? 0) + (rwStats[0]?.count ?? 0);
    const totalQuantity = (rejStats[0]?.totalQuantity ?? 0) + (rwStats[0]?.totalQuantity ?? 0);

    return {
      totalIssues,
      totalQuantity,
      avgQuantityPerIssue: totalIssues > 0 ? totalQuantity / totalIssues : 0,
      uniqueCategories: parseInt(rejStats[0]?.uniqueZones ?? '0'),
      uniqueItems: parseInt(rejStats[0]?.uniqueParts ?? '0'),
      uniqueIssueTypes: parseInt(rejStats[0]?.uniqueTypes ?? '0') + 1,
    };
  }

  // ── trends ────────────────────────────────────────────────────────────────

  private async getTrendData(organizationId: number, days: number): Promise<TrendData> {
    const now = new Date();
    const currentFrom = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const previousFrom = new Date(currentFrom.getTime() - days * 24 * 60 * 60 * 1000);

    const [currentData, previousData] = await Promise.all([
      this.getPeriodStats(organizationId, currentFrom, now),
      this.getPeriodStats(organizationId, previousFrom, currentFrom),
    ]);

    const countChange = previousData.count > 0
      ? ((currentData.count - previousData.count) / previousData.count) * 100
      : 0;
    const quantityChange = previousData.quantity > 0
      ? ((currentData.quantity - previousData.quantity) / previousData.quantity) * 100
      : 0;

    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (Math.abs(countChange) > 10) trend = countChange > 0 ? 'increasing' : 'decreasing';

    return {
      period: `Last ${days} days`,
      current: currentData,
      previous: previousData,
      changePercent: { count: countChange, quantity: quantityChange },
      trend,
    };
  }

  private async getPeriodStats(organizationId: number, from: Date, to: Date) {
    const [rej, rw] = await Promise.all([
      db.select({ count: count(), quantity: sum(rejectionEntries.quantity).mapWith(Number) })
        .from(rejectionEntries)
        .where(and(eq(rejectionEntries.organizationId, organizationId), gte(rejectionEntries.date, from), lte(rejectionEntries.date, to))),
      db.select({ count: count(), quantity: sum(reworkEntries.quantity).mapWith(Number) })
        .from(reworkEntries)
        .where(and(eq(reworkEntries.organizationId, organizationId), gte(reworkEntries.date, from), lte(reworkEntries.date, to))),
    ]);
    return {
      count: (rej[0]?.count ?? 0) + (rw[0]?.count ?? 0),
      quantity: (rej[0]?.quantity ?? 0) + (rw[0]?.quantity ?? 0),
    };
  }

  // ── top categories ────────────────────────────────────────────────────────

  private async getTopCategories(organizationId: number, period: AnalyticsPeriod): Promise<TopCategory[]> {
    const [rejRows, rwRows] = await Promise.all([
      db.select({ name: zones.name, count: count(), quantity: sum(rejectionEntries.quantity).mapWith(Number) })
        .from(rejectionEntries)
        .leftJoin(zones, eq(rejectionEntries.zoneId, zones.id))
        .where(and(eq(rejectionEntries.organizationId, organizationId), gte(rejectionEntries.date, period.from), lte(rejectionEntries.date, period.to)))
        .groupBy(zones.name),
      db.select({ name: zones.name, count: count(), quantity: sum(reworkEntries.quantity).mapWith(Number) })
        .from(reworkEntries)
        .leftJoin(zones, eq(reworkEntries.zoneId, zones.id))
        .where(and(eq(reworkEntries.organizationId, organizationId), gte(reworkEntries.date, period.from), lte(reworkEntries.date, period.to)))
        .groupBy(zones.name),
    ]);

    const map = new Map<string, { count: number; quantity: number }>();
    for (const r of [...rejRows, ...rwRows]) {
      const key = r.name ?? 'Unknown';
      const e = map.get(key) ?? { count: 0, quantity: 0 };
      e.count += r.count;
      e.quantity += r.quantity ?? 0;
      map.set(key, e);
    }

    const total = Array.from(map.values()).reduce((s, v) => s + v.count, 0) || 1;
    return Array.from(map.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([name, { count, quantity }]) => ({
        name,
        count,
        quantity,
        percentage: (count / total) * 100,
        topIssueType: 'rejection',
      }));
  }

  // ── top items ─────────────────────────────────────────────────────────────

  private async getTopItems(organizationId: number, period: AnalyticsPeriod): Promise<TopItem[]> {
    const [rejRows, rwRows] = await Promise.all([
      db.select({ name: parts.partNumber, count: count(), quantity: sum(rejectionEntries.quantity).mapWith(Number) })
        .from(rejectionEntries)
        .leftJoin(parts, eq(rejectionEntries.partId, parts.id))
        .where(and(eq(rejectionEntries.organizationId, organizationId), gte(rejectionEntries.date, period.from), lte(rejectionEntries.date, period.to)))
        .groupBy(parts.partNumber),
      db.select({ name: parts.partNumber, count: count(), quantity: sum(reworkEntries.quantity).mapWith(Number) })
        .from(reworkEntries)
        .leftJoin(parts, eq(reworkEntries.partId, parts.id))
        .where(and(eq(reworkEntries.organizationId, organizationId), gte(reworkEntries.date, period.from), lte(reworkEntries.date, period.to)))
        .groupBy(parts.partNumber),
    ]);

    const map = new Map<string, { count: number; quantity: number }>();
    for (const r of [...rejRows, ...rwRows]) {
      const key = r.name ?? 'Unknown';
      const e = map.get(key) ?? { count: 0, quantity: 0 };
      e.count += r.count;
      e.quantity += r.quantity ?? 0;
      map.set(key, e);
    }

    const total = Array.from(map.values()).reduce((s, v) => s + v.count, 0) || 1;
    return Array.from(map.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([name, { count, quantity }]) => ({
        name,
        count,
        quantity,
        percentage: (count / total) * 100,
        topIssueType: 'rejection',
      }));
  }

  // ── top issue types ───────────────────────────────────────────────────────

  private async getTopIssueTypes(organizationId: number, period: AnalyticsPeriod): Promise<TopIssueType[]> {
    const [rejRows, rwTotal] = await Promise.all([
      db.select({
        name: rejectionTypes.type,
        count: count(),
        quantity: sum(rejectionEntries.quantity).mapWith(Number),
      })
      .from(rejectionEntries)
      .leftJoin(rejectionTypes, eq(rejectionEntries.rejectionTypeId, rejectionTypes.id))
      .where(and(eq(rejectionEntries.organizationId, organizationId), gte(rejectionEntries.date, period.from), lte(rejectionEntries.date, period.to)))
      .groupBy(rejectionTypes.type)
      .orderBy(desc(count()))
      .limit(9),

      db.select({ count: count(), quantity: sum(reworkEntries.quantity).mapWith(Number) })
        .from(reworkEntries)
        .where(and(eq(reworkEntries.organizationId, organizationId), gte(reworkEntries.date, period.from), lte(reworkEntries.date, period.to))),
    ]);

    const allRows = [
      ...rejRows.map(r => ({ name: r.name ?? 'Unknown', count: r.count, quantity: r.quantity ?? 0 })),
      { name: 'Rework', count: rwTotal[0]?.count ?? 0, quantity: rwTotal[0]?.quantity ?? 0 },
    ];

    const total = allRows.reduce((s, r) => s + r.count, 0) || 1;
    return allRows
      .filter(r => r.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(r => ({
        name: r.name,
        count: r.count,
        quantity: r.quantity,
        percentage: (r.count / total) * 100,
        topCategory: '',
        topItem: '',
      }));
  }

  // ── daily trend ───────────────────────────────────────────────────────────

  private async getDailyTrend(organizationId: number, period: AnalyticsPeriod): Promise<DailyTrend[]> {
    const [rejRows, rwRows] = await Promise.all([
      db.select({
        date: sql<string>`DATE(${rejectionEntries.date})`,
        count: count(),
        quantity: sum(rejectionEntries.quantity).mapWith(Number),
      })
      .from(rejectionEntries)
      .where(and(eq(rejectionEntries.organizationId, organizationId), gte(rejectionEntries.date, period.from), lte(rejectionEntries.date, period.to)))
      .groupBy(sql`DATE(${rejectionEntries.date})`),

      db.select({
        date: sql<string>`DATE(${reworkEntries.date})`,
        count: count(),
        quantity: sum(reworkEntries.quantity).mapWith(Number),
      })
      .from(reworkEntries)
      .where(and(eq(reworkEntries.organizationId, organizationId), gte(reworkEntries.date, period.from), lte(reworkEntries.date, period.to)))
      .groupBy(sql`DATE(${reworkEntries.date})`),
    ]);

    const map = mergeDateRows(
      rejRows.map(r => ({ date: r.date, count: r.count, quantity: r.quantity ?? 0 })),
      rwRows.map(r => ({ date: r.date, count: r.count, quantity: r.quantity ?? 0 })),
    );

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { count, quantity }]) => ({ date, count, quantity }));
  }

  // ── insights ──────────────────────────────────────────────────────────────

  private async generateInsights(organizationId: number, period: AnalyticsPeriod): Promise<InsightSummary[]> {
    const insights: InsightSummary[] = [];

    const topRejectionReason = await db.select({
      reason: rejectionTypes.reason,
      code: rejectionTypes.rejectionCode,
      count: count(),
    })
    .from(rejectionEntries)
    .leftJoin(rejectionTypes, eq(rejectionEntries.rejectionTypeId, rejectionTypes.id))
    .where(and(eq(rejectionEntries.organizationId, organizationId), gte(rejectionEntries.date, period.from), lte(rejectionEntries.date, period.to)))
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

    const topReworkType = await db.select({
      reason: reworkTypes.reason,
      code: reworkTypes.reworkCode,
      count: count(),
    })
    .from(reworkEntries)
    .leftJoin(reworkTypes, eq(reworkEntries.reworkTypeId, reworkTypes.id))
    .where(and(eq(reworkEntries.organizationId, organizationId), gte(reworkEntries.date, period.from), lte(reworkEntries.date, period.to)))
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

    const topZone = await db.select({ zone: zones.name, count: count() })
      .from(rejectionEntries)
      .leftJoin(zones, eq(rejectionEntries.zoneId, zones.id))
      .where(and(eq(rejectionEntries.organizationId, organizationId), gte(rejectionEntries.date, period.from), lte(rejectionEntries.date, period.to)))
      .groupBy(zones.name)
      .orderBy(desc(count()))
      .limit(1);

    if (topZone.length > 0) {
      insights.push({
        type: 'problem_area',
        title: 'Biggest Problem Zone',
        description: 'Zone with the most issues — requires immediate attention',
        value: topZone[0].zone ?? 'Unknown',
        confidence: 0.85,
      });
    }

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

  // ── misc ──────────────────────────────────────────────────────────────────

  async getFieldLabels(organizationId: number): Promise<Record<string, string>> {
    return { zone: 'Zone', partNumber: 'Part Number', type: 'Issue Type', quantity: 'Quantity' };
  }

  async updateOrganizationTemplate(organizationId: number, templateId: string): Promise<void> {
    // Template system removed
  }

  private getDefaultPeriod(): AnalyticsPeriod {
    const now = new Date();
    return { from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), to: now };
  }
}
