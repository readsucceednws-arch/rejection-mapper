import { AnalyticsService, AnalyticsData } from "./analytics";
import { AnalyticsPeriod } from "./analytics";

/**
 * Reporting Service
 * Generates weekly and monthly reports with CSV export
 * Template-aware reporting for all industries
 */

export interface ReportConfig {
  type: 'weekly' | 'monthly';
  organizationId: number;
  period?: AnalyticsPeriod;
  format: 'csv';
}

export interface ReportData {
  metadata: {
    organizationId: number;
    reportType: string;
    period: string;
    generatedAt: string;
    template?: string;
  };
  summary: {
    totalIssues: number;
    totalQuantity: number;
    avgQuantityPerIssue: number;
    uniqueCategories: number;
    uniqueItems: number;
    uniqueIssueTypes: number;
  };
  trends: {
    last7Days: any;
    last30Days: any;
  };
  topCategories: any[];
  topItems: any[];
  topIssueTypes: any[];
  insights: any[];
}

export class ReportingService {
  private analyticsService: AnalyticsService;

  constructor() {
    this.analyticsService = new AnalyticsService();
  }

  /**
   * Generate report based on configuration
   */
  async generateReport(config: ReportConfig): Promise<ReportData> {
    const period = config.period || this.getDefaultPeriod(config.type);
    
    // Get analytics data for the period
    const analytics = await this.analyticsService.getAnalytics(config.organizationId, period);
    
    // Get field labels for template awareness
    const fieldLabels = await this.analyticsService.getFieldLabels(config.organizationId);

    return {
      metadata: {
        organizationId: config.organizationId,
        reportType: config.type,
        period: this.formatPeriod(period),
        generatedAt: new Date().toISOString(),
        template: this.getTemplateName(fieldLabels)
      },
      summary: analytics.overview,
      trends: analytics.trends,
      topCategories: analytics.topCategories,
      topItems: analytics.topItems,
      topIssueTypes: analytics.topIssueTypes,
      insights: analytics.insights
    };
  }

  /**
   * Export report as CSV
   */
  async exportToCSV(reportData: ReportData): Promise<string> {
    const csvLines: string[] = [];
    
    // Add metadata header
    csvLines.push(`# ${reportData.metadata.reportType.toUpperCase()} REPORT`);
    csvLines.push(`# Organization: ${reportData.metadata.organizationId}`);
    csvLines.push(`# Period: ${reportData.metadata.period}`);
    csvLines.push(`# Generated: ${new Date(reportData.metadata.generatedAt).toLocaleString()}`);
    csvLines.push(`# Template: ${reportData.metadata.template || 'Default'}`);
    csvLines.push('');

    // Summary section
    csvLines.push('## SUMMARY');
    csvLines.push('Metric,Value');
    csvLines.push(`Total Issues,${reportData.summary.totalIssues}`);
    csvLines.push(`Total Quantity,${reportData.summary.totalQuantity}`);
    csvLines.push(`Average Quantity Per Issue,${reportData.summary.avgQuantityPerIssue.toFixed(2)}`);
    csvLines.push(`Unique Categories,${reportData.summary.uniqueCategories}`);
    csvLines.push(`Unique Items,${reportData.summary.uniqueItems}`);
    csvLines.push(`Unique Issue Types,${reportData.summary.uniqueIssueTypes}`);
    csvLines.push('');

    // Trends section
    csvLines.push('## TRENDS');
    csvLines.push('Period,Current Count,Previous Count,Change %,Trend');
    
    csvLines.push(`Last 7 Days,${reportData.trends.last7Days.current.count},${reportData.trends.last7Days.previous.count},${reportData.trends.last7Days.changePercent.count.toFixed(1)}%,${reportData.trends.last7Days.trend}`);
    csvLines.push(`Last 30 Days,${reportData.trends.last30Days.current.count},${reportData.trends.last30Days.previous.count},${reportData.trends.last30Days.changePercent.count.toFixed(1)}%,${reportData.trends.last30Days.trend}`);
    csvLines.push('');

    // Top Categories section
    csvLines.push('## TOP CATEGORIES');
    csvLines.push('Category,Issues,Quantity,Percentage,Top Issue Type');
    reportData.topCategories.forEach(cat => {
      csvLines.push(`"${cat.name}",${cat.count},${cat.quantity},${cat.percentage.toFixed(1)}%,"${cat.topIssueType}"`);
    });
    csvLines.push('');

    // Top Items section
    csvLines.push('## TOP ITEMS');
    csvLines.push('Item,Issues,Quantity,Percentage,Top Issue Type');
    reportData.topItems.forEach(item => {
      csvLines.push(`"${item.name}",${item.count},${item.quantity},${item.percentage.toFixed(1)}%,"${item.topIssueType}"`);
    });
    csvLines.push('');

    // Top Issue Types section
    csvLines.push('## TOP ISSUE TYPES');
    csvLines.push('Issue Type,Issues,Quantity,Percentage,Top Category,Top Item');
    reportData.topIssueTypes.forEach(type => {
      csvLines.push(`"${type.name}",${type.count},${type.quantity},${type.percentage.toFixed(1)}%,"${type.topCategory}","${type.topItem}"`);
    });
    csvLines.push('');

    // Insights section
    csvLines.push('## INSIGHTS');
    csvLines.push('Type,Title,Description,Value,Confidence');
    reportData.insights.forEach(insight => {
      csvLines.push(`"${insight.type}","${insight.title}","${insight.description}","${insight.value}",${(insight.confidence * 100).toFixed(0)}%`);
    });

    return csvLines.join('\n');
  }

  /**
   * Generate weekly report
   */
  async generateWeeklyReport(organizationId: number): Promise<ReportData> {
    const config: ReportConfig = {
      type: 'weekly',
      organizationId,
      format: 'csv'
    };

    return await this.generateReport(config);
  }

  /**
   * Generate monthly report
   */
  async generateMonthlyReport(organizationId: number): Promise<ReportData> {
    const config: ReportConfig = {
      type: 'monthly',
      organizationId,
      format: 'csv'
    };

    return await this.generateReport(config);
  }

  /**
   * Get default period based on report type
   */
  private getDefaultPeriod(type: 'weekly' | 'monthly'): AnalyticsPeriod {
    const now = new Date();
    let from: Date;

    if (type === 'weekly') {
      // Last 7 days
      from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else {
      // Last 30 days
      from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    return { from, to: now };
  }

  /**
   * Format period for display
   */
  private formatPeriod(period: AnalyticsPeriod): string {
    return `${period.from.toLocaleDateString()} - ${period.to.toLocaleDateString()}`;
  }

  /**
   * Get template name from field labels
   */
  private getTemplateName(fieldLabels: any): string {
    if (!fieldLabels) return 'Default';

    // Determine template based on field labels
    if (fieldLabels.zone === 'Kitchen Area' && fieldLabels.partNumber === 'Product Name') {
      return 'Bakery';
    } else if (fieldLabels.zone === 'Service Area' && fieldLabels.partNumber === 'Menu Item') {
      return 'Food Service';
    } else if (fieldLabels.zone === 'Work Station' && fieldLabels.partNumber === 'Part Number') {
      return 'Manufacturing';
    }

    return 'Custom';
  }

  /**
   * Generate CSV filename
   */
  generateCSVFilename(reportData: ReportData): string {
    const date = new Date().toISOString().split('T')[0];
    const orgId = reportData.metadata.organizationId;
    const type = reportData.metadata.reportType;
    const template = reportData.metadata.template || 'default';
    
    return `${orgId}_${type}_${template}_${date}.csv`;
  }
}
