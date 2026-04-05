import { db } from "../storage";
import { issueEntries } from "@shared/schema";
import { eq, and, gte, lte, desc, count, sum } from "drizzle-orm";

/**
 * Insights Engine - Analyzes issue data to generate actionable insights
 * Rule-based system (no ML) for explainable results
 */

export interface TopIssue {
  type: string;
  count: number;
  totalQuantity: number;
  percentage: number;
  zone?: string;
}

export interface ZoneAnalysis {
  zone: string;
  issueCount: number;
  totalQuantity: number;
  percentage: number;
  topIssueType: string;
}

export interface ItemAnalysis {
  partNumber: string;
  issueCount: number;
  totalQuantity: number;
  percentage: number;
  topIssueType: string;
}

export interface TrendData {
  period: string;
  count: number;
  quantity: number;
  changePercent?: number;
  trend: 'increasing' | 'decreasing' | 'stable';
}

export interface Insight {
  type: 'top_issue' | 'zone_focus' | 'item_focus' | 'trend';
  title: string;
  description: string;
  data: any;
  confidence: number;
  recommendations: string[];
  possibleCauses: string[];
  suggestedActions: string[];
}

export interface DashboardMetrics {
  totalIssues: number;
  totalQuantity: number;
  topIssue: TopIssue;
  mostAffectedZone: ZoneAnalysis;
  mostAffectedItem: ItemAnalysis;
  trend: TrendData;
  insights: Insight[];
}

export class InsightsEngine {
  
  /**
   * Generate comprehensive dashboard metrics
   */
  async getDashboardMetrics(organizationId: number): Promise<DashboardMetrics> {
    const [
      totalIssues,
      topIssues,
      zoneAnalysis,
      itemAnalysis,
      trendData
    ] = await Promise.all([
      this.getTotalIssues(organizationId),
      this.getTopIssues(organizationId),
      this.getZoneAnalysis(organizationId),
      this.getItemAnalysis(organizationId),
      this.getTrendData(organizationId)
    ]);

    const insights = this.generateInsights({
      topIssues,
      zoneAnalysis,
      itemAnalysis,
      trendData
    });

    return {
      totalIssues: totalIssues.count,
      totalQuantity: totalIssues.quantity || 0,
      topIssue: topIssues[0],
      mostAffectedZone: zoneAnalysis[0],
      mostAffectedItem: itemAnalysis[0],
      trend: trendData[trendData.length - 1] || { period: 'Current', count: 0, quantity: 0, trend: 'stable' },
      insights
    };
  }

  /**
   * Get total issues and quantity
   */
  private async getTotalIssues(organizationId: number) {
    const result = await db.select({
      count: count(),
      quantity: sum(issueEntries.quantity).mapWith(Number)
    })
    .from(issueEntries)
    .where(eq(issueEntries.organizationId, organizationId))
    .limit(1);

    return result[0] || { count: 0, quantity: 0 };
  }

  /**
   * Get top issues by frequency and quantity
   */
  async getTopIssues(organizationId: number, limit: number = 10): Promise<TopIssue[]> {
    const totalResult = await db.select({ count: count() })
      .from(issueEntries)
      .where(eq(issueEntries.organizationId, organizationId))
      .limit(1);

    const total = totalResult[0]?.count || 0;

    const issues = await db.select({
      type: issueEntries.type,
      count: count(),
      totalQuantity: sum(issueEntries.quantity).mapWith(Number),
      zone: issueEntries.zone
    })
    .from(issueEntries)
    .where(eq(issueEntries.organizationId, organizationId))
    .groupBy(issueEntries.type, issueEntries.zone)
    .orderBy(desc(count()))
    .limit(limit);

    return issues.map(issue => ({
      ...issue,
      percentage: total > 0 ? (issue.count / total) * 100 : 0
    }));
  }

  /**
   * Get zone analysis - most affected zones
   */
  async getZoneAnalysis(organizationId: number, limit: number = 10): Promise<ZoneAnalysis[]> {
    const totalResult = await db.select({ count: count() })
      .from(issueEntries)
      .where(eq(issueEntries.organizationId, organizationId))
      .limit(1);

    const total = totalResult[0]?.count || 0;

    // Get top issue type per zone
    const zones = await db.select({
      zone: issueEntries.zone,
      issueCount: count(),
      totalQuantity: sum(issueEntries.quantity).mapWith(Number)
    })
    .from(issueEntries)
    .where(eq(issueEntries.organizationId, organizationId))
    .groupBy(issueEntries.zone)
    .orderBy(desc(count()))
    .limit(limit);

    const result: ZoneAnalysis[] = [];

    for (const zone of zones) {
      // Get top issue type for this zone
      const topIssueType = await db.select({ type: issueEntries.type })
        .from(issueEntries)
        .where(and(
          eq(issueEntries.organizationId, organizationId),
          eq(issueEntries.zone, zone.zone)
        ))
        .groupBy(issueEntries.type)
        .orderBy(desc(count()))
        .limit(1);

      result.push({
        ...zone,
        percentage: total > 0 ? (zone.issueCount / total) * 100 : 0,
        topIssueType: topIssueType[0]?.type || 'Unknown'
      });
    }

    return result;
  }

  /**
   * Get item analysis - most affected part numbers
   */
  async getItemAnalysis(organizationId: number, limit: number = 10): Promise<ItemAnalysis[]> {
    const totalResult = await db.select({ count: count() })
      .from(issueEntries)
      .where(eq(issueEntries.organizationId, organizationId))
      .limit(1);

    const total = totalResult[0]?.count || 0;

    // Get top issue type per item
    const items = await db.select({
      partNumber: issueEntries.partNumber,
      issueCount: count(),
      totalQuantity: sum(issueEntries.quantity).mapWith(Number)
    })
    .from(issueEntries)
    .where(eq(issueEntries.organizationId, organizationId))
    .groupBy(issueEntries.partNumber)
    .orderBy(desc(count()))
    .limit(limit);

    const result: ItemAnalysis[] = [];

    for (const item of items) {
      // Get top issue type for this item
      const topIssueType = await db.select({ type: issueEntries.type })
        .from(issueEntries)
        .where(and(
          eq(issueEntries.organizationId, organizationId),
          eq(issueEntries.partNumber, item.partNumber)
        ))
        .groupBy(issueEntries.type)
        .orderBy(desc(count()))
        .limit(1);

      result.push({
        ...item,
        percentage: total > 0 ? (item.issueCount / total) * 100 : 0,
        topIssueType: topIssueType[0]?.type || 'Unknown'
      });
    }

    return result;
  }

  /**
   * Get trend data - compare last 7 days vs previous 7 days
   */
  async getTrendData(organizationId: number): Promise<TrendData[]> {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Get last 7 days data
    const recentData = await db.select({
      count: count(),
      quantity: sum(issueEntries.quantity).mapWith(Number)
    })
    .from(issueEntries)
    .where(and(
      eq(issueEntries.organizationId, organizationId),
      gte(issueEntries.date, sevenDaysAgo)
    ))
    .limit(1);

    // Get previous 7 days data
    const previousData = await db.select({
      count: count(),
      quantity: sum(issueEntries.quantity).mapWith(Number)
    })
    .from(issueEntries)
    .where(and(
      eq(issueEntries.organizationId, organizationId),
      gte(issueEntries.date, fourteenDaysAgo),
      lte(issueEntries.date, sevenDaysAgo)
    ))
    .limit(1);

    const recent = recentData[0] || { count: 0, quantity: 0 };
    const previous = previousData[0] || { count: 0, quantity: 0 };

    const changePercent = previous.count > 0 
      ? ((recent.count - previous.count) / previous.count) * 100 
      : 0;

    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (Math.abs(changePercent) > 10) {
      trend = changePercent > 0 ? 'increasing' : 'decreasing';
    }

    return [
      {
        period: 'Previous 7 days',
        count: previous.count,
        quantity: previous.quantity,
        trend: 'stable'
      },
      {
        period: 'Last 7 days',
        count: recent.count,
        quantity: recent.quantity,
        changePercent,
        trend
      }
    ];
  }

  /**
   * Generate insights based on analysis data
   */
  private generateInsights(data: {
    topIssues: TopIssue[];
    zoneAnalysis: ZoneAnalysis[];
    itemAnalysis: ItemAnalysis[];
    trendData: TrendData[];
  }): Insight[] {
    const insights: Insight[] = [];

    // Top Issue Insight
    if (data.topIssues.length > 0) {
      const topIssue = data.topIssues[0];
      insights.push({
        type: 'top_issue',
        title: `Primary Issue: ${topIssue.type}`,
        description: `${topIssue.type} accounts for ${topIssue.percentage.toFixed(1)}% of all issues (${topIssue.count} occurrences)`,
        data: topIssue,
        confidence: 0.9,
        recommendations: [
          `Focus on resolving ${topIssue.type} issues first`,
          `Investigate root causes for ${topIssue.type}`,
          `Implement preventive measures for ${topIssue.type}`
        ],
        possibleCauses: [
          `Process issues in ${topIssue.zone || 'multiple zones'}`,
          'Equipment malfunction',
          'Training gaps',
          'Material quality issues'
        ],
        suggestedActions: [
          'Conduct root cause analysis',
          'Review standard operating procedures',
          'Schedule equipment maintenance',
          'Provide additional training'
        ]
      });
    }

    // Zone Focus Insight
    if (data.zoneAnalysis.length > 0) {
      const topZone = data.zoneAnalysis[0];
      insights.push({
        type: 'zone_focus',
        title: `Zone Requiring Attention: ${topZone.zone}`,
        description: `${topZone.zone} has ${topZone.issueCount} issues (${topZone.percentage.toFixed(1)}% of total)`,
        data: topZone,
        confidence: 0.85,
        recommendations: [
          `Prioritize ${topZone.zone} for process improvement`,
          `Increase monitoring in ${topZone.zone}`,
          `Review ${topZone.topIssueType} issues in ${topZone.zone}`
        ],
        possibleCauses: [
          'Equipment calibration issues',
          'Operator skill gaps',
          'Environmental factors',
          'Workflow inefficiencies'
        ],
        suggestedActions: [
          'Check equipment calibration',
          'Audit operator procedures',
          'Review environmental controls',
          'Optimize workflow layout'
        ]
      });
    }

    // Item Focus Insight
    if (data.itemAnalysis.length > 0) {
      const topItem = data.itemAnalysis[0];
      insights.push({
        type: 'item_focus',
        title: `Item Requiring Review: ${topItem.partNumber}`,
        description: `${topItem.partNumber} has ${topItem.issueCount} issues (${topItem.percentage.toFixed(1)}% of total)`,
        data: topItem,
        confidence: 0.8,
        recommendations: [
          `Review quality of ${topItem.partNumber}`,
          `Check supplier for ${topItem.partNumber}`,
          `Monitor ${topItem.topIssueType} issues for ${topItem.partNumber}`
        ],
        possibleCauses: [
          'Supplier quality issues',
          'Design flaws',
          'Handling damage',
          'Storage conditions'
        ],
        suggestedActions: [
          'Audit supplier quality',
          'Review design specifications',
          'Improve handling procedures',
          'Check storage conditions'
        ]
      });
    }

    return insights;
  }

  /**
   * Get chart-ready data for daily aggregation
   */
  async getDailyAggregation(organizationId: number, days: number = 30): Promise<any[]> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    // This would ideally use SQL date truncation, but for now we'll do it in code
    const entries = await db.select({
      date: issueEntries.date,
      count: count(),
      quantity: sum(issueEntries.quantity).mapWith(Number)
    })
    .from(issueEntries)
    .where(and(
      eq(issueEntries.organizationId, organizationId),
      gte(issueEntries.date, startDate),
      lte(issueEntries.date, endDate)
    ))
    .groupBy(issueEntries.date)
    .orderBy(issueEntries.date);

    // Convert to chart-ready format
    const chartData = entries.map(entry => ({
      date: entry.date.toISOString().split('T')[0],
      count: entry.count,
      quantity: entry.quantity
    }));

    return chartData;
  }
}
