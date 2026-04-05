import { db } from "../storage";
import { issueEntries, organizations, templates, rejectionEntries, reworkEntries, parts, rejectionTypes, reworkTypes, zones } from "@shared/schema";
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
  type: 'trend' | 'pattern' | 'anomaly' | 'recommendation';
  title: string;
  description: string;
  impact: 'low' | 'medium' | 'high';
  actionable: boolean;
  data?: any;
}

export interface AnalyticsData {
  overview: OverviewStats;
  last7DaysTrend: TrendData;
  last30DaysTrend: TrendData;
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
        type: reworkTypes.type,
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
      .leftJoin(reworkTypes, eq(reworkEntries.reworkTypeId, reworkTypes.id))
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
      this.getOverview(organizationId, analyticsPeriod),
      this.getTrend(organizationId, 7),
      this.getTrend(organizationId, 30),
      this.getTopCategories(organizationId, analyticsPeriod),
      this.getTopItems(organizationId, analyticsPeriod),
      this.getTopIssueTypes(organizationId, analyticsPeriod),
      this.getDailyTrend(organizationId, analyticsPeriod),
      this.generateInsights(organizationId, analyticsPeriod)
    ]);

    return {
      overview,
      last7DaysTrend,
      last30DaysTrend,
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
  private async getOverview(organizationId: number, period: AnalyticsPeriod): Promise<OverviewStats> {
    const stats = await db.select({
      totalIssues: count(),
      totalQuantity: sum(issueEntries.quantity).mapWith(Number),
      uniqueCategories: count({ distinct: [issueEntries.zone] }),
      uniqueItems: count({ distinct: [issueEntries.partNumber] }),
      uniqueIssueTypes: count({ distinct: [issueEntries.type] })
    })
    .from(issueEntries)
    .where(and(
      eq(issueEntries.organizationId, organizationId),
      gte(issueEntries.date, period.from),
      lte(issueEntries.date, period.to)
    ));

    const result = stats[0];
    return {
      totalIssues: result.totalIssues || 0,
      totalQuantity: result.totalQuantity || 0,
      avgQuantityPerIssue: result.totalIssues > 0 ? (result.totalQuantity || 0) / result.totalIssues : 0,
      uniqueCategories: result.uniqueCategories || 0,
      uniqueItems: result.uniqueItems || 0,
      uniqueIssueTypes: result.uniqueIssueTypes || 0
    };
  }

  /**
   * Get trend data for specified days
   */
  private async getTrend(organizationId: number, days: number): Promise<TrendData> {
    const now = new Date();
    const currentPeriod = {
      from: new Date(now.getTime() - days * 24 * 60 * 60 * 1000),
      to: now
    };
    const previousPeriod = {
      from: new Date(now.getTime() - (days * 2) * 24 * 60 * 60 * 1000),
      to: new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    };

    const [current, previous] = await Promise.all([
      this.getPeriodStats(organizationId, currentPeriod),
      this.getPeriodStats(organizationId, previousPeriod)
    ]);

    const changePercent = {
      count: previous.count > 0 ? ((current.count - previous.count) / previous.count) * 100 : 0,
      quantity: previous.quantity > 0 ? ((current.quantity - previous.quantity) / previous.quantity) * 100 : 0
    };

    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (Math.abs(changePercent.count) > 5) {
      trend = changePercent.count > 0 ? 'increasing' : 'decreasing';
    }

    return {
      period: `${days} days`,
      current,
      previous,
      changePercent,
      trend
    };
  }

  /**
   * Get stats for a period
   */
  private async getPeriodStats(organizationId: number, period: AnalyticsPeriod): Promise<{ count: number; quantity: number }> {
    const stats = await db.select({
      count: count(),
      quantity: sum(issueEntries.quantity).mapWith(Number)
    })
    .from(issueEntries)
    .where(and(
      eq(issueEntries.organizationId, organizationId),
      gte(issueEntries.date, period.from),
      lte(issueEntries.date, period.to)
    ));

    const result = stats[0];
    return {
      count: result.count || 0,
      quantity: result.quantity || 0
    };
  }

  /**
   * Get top categories
   */
  private async getTopCategories(organizationId: number, period: AnalyticsPeriod): Promise<TopCategory[]> {
    const categories = await db.select({
      name: issueEntries.zone,
      count: count(),
      quantity: sum(issueEntries.quantity).mapWith(Number)
    })
    .from(issueEntries)
    .where(and(
      eq(issueEntries.organizationId, organizationId),
      gte(issueEntries.date, period.from),
      lte(issueEntries.date, period.to)
    ))
    .groupBy(issueEntries.zone)
    .orderBy(desc(count()))
    .limit(10);

    const total = categories.reduce((sum, cat) => sum + cat.count, 0);

    return categories.map(cat => ({
      name: cat.name || 'Unknown',
      count: cat.count,
      quantity: cat.quantity || 0,
      percentage: total > 0 ? (cat.count / total) * 100 : 0,
      topIssueType: '' // Would need additional query
    }));
  }

  /**
   * Get top items
   */
  private async getTopItems(organizationId: number, period: AnalyticsPeriod): Promise<TopItem[]> {
    const items = await db.select({
      name: issueEntries.partNumber,
      count: count(),
      quantity: sum(issueEntries.quantity).mapWith(Number)
    })
    .from(issueEntries)
    .where(and(
      eq(issueEntries.organizationId, organizationId),
      gte(issueEntries.date, period.from),
      lte(issueEntries.date, period.to)
    ))
    .groupBy(issueEntries.partNumber)
    .orderBy(desc(count()))
    .limit(10);

    const total = items.reduce((sum, item) => sum + item.count, 0);

    return items.map(item => ({
      name: item.name || 'Unknown',
      count: item.count,
      quantity: item.quantity || 0,
      percentage: total > 0 ? (item.count / total) * 100 : 0,
      topIssueType: '' // Would need additional query
    }));
  }

  /**
   * Get top issue types
   */
  private async getTopIssueTypes(organizationId: number, period: AnalyticsPeriod): Promise<TopIssueType[]> {
    const issueTypes = await db.select({
      name: issueEntries.type,
      count: count(),
      quantity: sum(issueEntries.quantity).mapWith(Number)
    })
    .from(issueEntries)
    .where(and(
      eq(issueEntries.organizationId, organizationId),
      gte(issueEntries.date, period.from),
      lte(issueEntries.date, period.to)
    ))
    .groupBy(issueEntries.type)
    .orderBy(desc(count()))
    .limit(10);

    const total = issueTypes.reduce((sum, type) => sum + type.count, 0);

    return issueTypes.map(issueType => ({
      name: issueType.name || 'Unknown',
      count: issueType.count,
      quantity: issueType.quantity || 0,
      percentage: total > 0 ? (issueType.count / total) * 100 : 0,
      topCategory: '', // Would need additional query
      topItem: '' // Would need additional query
    }));
  }

  /**
   * Get daily trend data
   */
  private async getDailyTrend(organizationId: number, period: AnalyticsPeriod): Promise<DailyTrend[]> {
    const entries = await db.select({
      date: sql<string>`DATE(${issueEntries.date})`,
      count: count(),
      quantity: sum(issueEntries.quantity).mapWith(Number)
    })
    .from(issueEntries)
    .where(and(
      eq(issueEntries.organizationId, organizationId),
      gte(issueEntries.date, period.from),
      lte(issueEntries.date, period.to)
    ))
    .groupBy(sql`DATE(${issueEntries.date})`)
    .orderBy(sql`DATE(${issueEntries.date})`);

    return entries.map(entry => ({
      date: entry.date,
      count: entry.count,
      quantity: entry.quantity || 0
    }));
  }

  /**
   * Generate rule-based insights
   */
  private async generateInsights(organizationId: number, period: AnalyticsPeriod): Promise<InsightSummary[]> {
    const insights: InsightSummary[] = [];
    const overview = await this.getOverview(organizationId, period);
    const trend = await this.getTrend(organizationId, 7);

    // Trend insight
    if (trend.trend === 'increasing' && trend.changePercent.count > 10) {
      insights.push({
        type: 'trend',
        title: 'Rising Issue Trend',
        description: `Issues increased by ${trend.changePercent.count.toFixed(1)}% in the last 7 days`,
        impact: 'high',
        actionable: true,
        data: trend
      });
    }

    // Volume insight
    if (overview.totalIssues > 100) {
      insights.push({
        type: 'pattern',
        title: 'High Issue Volume',
        description: `Total of ${overview.totalIssues} issues detected in the selected period`,
        impact: 'medium',
        actionable: true,
        data: overview
      });
    }

    // Efficiency insight
    if (overview.avgQuantityPerIssue > 10) {
      insights.push({
        type: 'recommendation',
        title: 'Batch Size Optimization',
        description: 'Consider investigating root causes to reduce average quantity per issue',
        impact: 'medium',
        actionable: true,
        data: overview
      });
    }

    return insights;
  }

  /**
   * Get template-aware field labels
   */
  async getFieldLabels(organizationId: number): Promise<Record<string, string>> {
    // Get organization's template configuration
    const org = await db.select().from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!org[0]) {
      return this.getDefaultLabels();
    }

    // Return labels based on template
    const templateId = org[0].templateId || 'manufacturing';
    switch (templateId) {
      case 'bakery':
        return this.getBakeryLabels();
      case 'manufacturing':
      default:
        return this.getDefaultLabels();
    }
  }

  private getDefaultLabels(): Record<string, string> {
    return {
      zone: 'Zone',
      partNumber: 'Part Number',
      type: 'Issue Type',
      quantity: 'Quantity'
    };
  }

  private getBakeryLabels(): Record<string, string> {
    return {
      zone: 'Kitchen Area',
      partNumber: 'Product Name',
      type: 'Quality Issue',
      quantity: 'Quantity'
    };
  }

  /**
   * Get default period (last 30 days)
   */
  private getDefaultPeriod(): AnalyticsPeriod {
    const now = new Date();
    const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { from, to: now };
  }

  /**
   * Update organization template
   */
  async updateOrganizationTemplate(organizationId: number, templateId: string): Promise<void> {
    await db.update(organizations)
      .set({ templateId })
      .where(eq(organizations.id, organizationId));
  }
}
