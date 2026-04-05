import { ReportingService, ReportData } from "./reporting";
import { PDFReportService, PDFReportConfig } from "./pdf-reports";

/**
 * Email Reports Service
 * Automated report delivery to stakeholders with scheduling and templates
 */

export interface EmailReportConfig {
  recipients: EmailRecipient[];
  schedule: 'daily' | 'weekly' | 'monthly' | 'custom';
  format: 'csv' | 'pdf';
  template: 'standard' | 'executive' | 'detailed';
  includeCharts: boolean;
  includeInsights: boolean;
  customMessage?: string;
  branding?: {
    logo?: string;
    company?: string;
    colors?: {
      primary: string;
      secondary: string;
    };
  };
}

export interface EmailRecipient {
  email: string;
  name: string;
  role: string;
  receiveInsights: boolean;
  receiveCharts: boolean;
}

export interface ScheduledReport {
  id: number;
  organizationId: number;
  name: string;
  config: EmailReportConfig;
  isActive: boolean;
  nextRun: Date;
  lastRun?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  variables: string[];
}

export class EmailReportsService {
  private reportingService: ReportingService;
  private pdfReportService: PDFReportService;

  constructor() {
    this.reportingService = new ReportingService();
    this.pdfReportService = new PDFReportService();
  }

  /**
   * Schedule automated report
   */
  async scheduleReport(
    organizationId: number,
    name: string,
    config: EmailReportConfig
  ): Promise<ScheduledReport> {
    const scheduledReport: ScheduledReport = {
      id: Math.floor(Math.random() * 10000),
      organizationId,
      name,
      config,
      isActive: true,
      nextRun: this.calculateNextRun(config.schedule),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    return scheduledReport;
  }

  /**
   * Generate and send report via email
   */
  async sendReportEmail(
    organizationId: number,
    type: 'weekly' | 'monthly',
    config: EmailReportConfig
  ): Promise<void> {
    // Generate report data
    const reportData = await this.reportingService.generateReport({
      type,
      organizationId,
      format: 'csv',
    });

    // Generate report file
    let reportBuffer: Buffer;
    let filename: string;
    let mimeType: string;

    if (config.format === 'pdf') {
      const pdfConfig: PDFReportConfig = {
        format: 'pdf',
        template: config.template as any,
        includeCharts: config.includeCharts,
        includeInsights: config.includeInsights,
        branding: config.branding
      };
      
      reportBuffer = await this.pdfReportService.generatePDFReport(
        organizationId,
        type,
        pdfConfig
      );
      filename = this.pdfReportService.generatePDFFilename(reportData, config.template);
      mimeType = 'application/pdf';
    } else {
      const csvContent = await this.reportingService.exportToCSV(reportData);
      reportBuffer = Buffer.from(csvContent, 'utf8');
      filename = this.reportingService.generateCSVFilename(reportData);
      mimeType = 'text/csv';
    }

    // Generate email content
    const emailContent = this.generateEmailContent(reportData, config);

    // Send email to all recipients
    for (const recipient of config.recipients) {
      await this.sendEmail({
        to: recipient.email,
        subject: emailContent.subject,
        htmlBody: emailContent.htmlBody,
        textBody: emailContent.textBody,
        attachments: [{
          filename,
          content: reportBuffer,
          mimeType
        }]
      });
    }
  }

  /**
   * Get scheduled reports for organization
   */
  async getScheduledReports(organizationId: number): Promise<ScheduledReport[]> {
    // Mock implementation
    return [
      {
        id: 1,
        organizationId,
        name: 'Weekly Performance Report',
        config: {
          recipients: [
            { email: 'manager@company.com', name: 'John Manager', role: 'manager', receiveInsights: true, receiveCharts: true },
            { email: 'lead@company.com', name: 'Jane Lead', role: 'team_lead', receiveInsights: false, receiveCharts: true }
          ],
          schedule: 'weekly',
          format: 'pdf',
          template: 'standard',
          includeCharts: true,
          includeInsights: true
        },
        isActive: true,
        nextRun: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        updatedAt: new Date()
      },
      {
        id: 2,
        organizationId,
        name: 'Monthly Executive Summary',
        config: {
          recipients: [
            { email: 'ceo@company.com', name: 'CEO', role: 'executive', receiveInsights: true, receiveCharts: false },
            { email: 'director@company.com', name: 'Director', role: 'director', receiveInsights: true, receiveCharts: false }
          ],
          schedule: 'monthly',
          format: 'pdf',
          template: 'executive',
          includeCharts: false,
          includeInsights: true
        },
        isActive: true,
        nextRun: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days from now
        createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        updatedAt: new Date()
      }
    ];
  }

  /**
   * Update scheduled report
   */
  async updateScheduledReport(
    reportId: number,
    updates: Partial<ScheduledReport>
  ): Promise<ScheduledReport> {
    // Mock implementation
    return {
      id: reportId,
      organizationId: 1,
      name: 'Updated Report',
      config: {
        recipients: [],
        schedule: 'weekly',
        format: 'pdf',
        template: 'standard',
        includeCharts: true,
        includeInsights: true
      },
      isActive: true,
      nextRun: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  /**
   * Delete scheduled report
   */
  async deleteScheduledReport(reportId: number): Promise<void> {
    // Mock implementation
  }

  /**
   * Get email templates
   */
  async getEmailTemplates(): Promise<EmailTemplate[]> {
    return [
      {
        id: 'standard_weekly',
        name: 'Standard Weekly Report',
        subject: 'Weekly Quality Report - {{organization}} - {{date}}',
        htmlBody: this.getStandardWeeklyHTMLTemplate(),
        textBody: this.getStandardWeeklyTextTemplate(),
        variables: ['organization', 'date', 'totalIssues', 'topIssue', 'trend']
      },
      {
        id: 'executive_monthly',
        name: 'Executive Monthly Summary',
        subject: 'Monthly Executive Summary - {{organization}} - {{date}}',
        htmlBody: this.getExecutiveMonthlyHTMLTemplate(),
        textBody: this.getExecutiveMonthlyTextTemplate(),
        variables: ['organization', 'date', 'summary', 'insights', 'recommendations']
      },
      {
        id: 'alert_immediate',
        name: 'Immediate Alert',
        subject: '🚨 Quality Alert - {{alertType}} - {{organization}}',
        htmlBody: this.getAlertHTMLTemplate(),
        textBody: this.getAlertTextTemplate(),
        variables: ['organization', 'alertType', 'description', 'urgency', 'action']
      }
    ];
  }

  /**
   * Generate email content
   */
  private generateEmailContent(reportData: ReportData, config: EmailReportConfig) {
    const template = this.getEmailTemplateForReport(config);
    const variables = this.getTemplateVariables(reportData);

    return {
      subject: this.replaceVariables(template.subject, variables),
      htmlBody: this.replaceVariables(template.htmlBody, variables),
      textBody: this.replaceVariables(template.textBody, variables)
    };
  }

  /**
   * Get template variables
   */
  private getTemplateVariables(reportData: ReportData): Record<string, string> {
    return {
      organization: `Organization ${reportData.metadata.organizationId}`,
      date: new Date().toLocaleDateString(),
      totalIssues: reportData.summary.totalIssues.toString(),
      totalQuantity: reportData.summary.totalQuantity.toString(),
      topIssue: reportData.topIssueTypes[0]?.name || 'N/A',
      trend: reportData.trends.last7Days.trend,
      topCategory: reportData.topCategories[0]?.name || 'N/A',
      topItem: reportData.topItems[0]?.name || 'N/A',
      period: reportData.metadata.period,
      template: reportData.metadata.template || 'Default'
    };
  }

  /**
   * Replace variables in template
   */
  private replaceVariables(template: string, variables: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
    return result;
  }

  /**
   * Get email template for report
   */
  private getEmailTemplateForReport(config: EmailReportConfig): EmailTemplate {
    const templates = {
      weekly: {
        standard: 'standard_weekly',
        executive: 'executive_monthly',
        detailed: 'standard_weekly'
      },
      monthly: {
        standard: 'executive_monthly',
        executive: 'executive_monthly',
        detailed: 'standard_weekly'
      }
    };

    const templateId = templates[config.schedule][config.template];
    return {
      id: templateId,
      name: templateId,
      subject: '',
      htmlBody: '',
      textBody: '',
      variables: []
    };
  }

  /**
   * Calculate next run time
   */
  private calculateNextRun(schedule: 'daily' | 'weekly' | 'monthly' | 'custom'): Date {
    const now = new Date();
    
    switch (schedule) {
      case 'daily':
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);
      case 'weekly':
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      case 'monthly':
        return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      default:
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    }
  }

  /**
   * Send email (mock implementation)
   */
  private async sendEmail(email: {
    to: string;
    subject: string;
    htmlBody: string;
    textBody: string;
    attachments: Array<{
      filename: string;
      content: Buffer;
      mimeType: string;
    }>;
  }): Promise<void> {
    // In a real implementation, this would use a service like SendGrid, AWS SES, or Nodemailer
    console.log('Sending email:', {
      to: email.to,
      subject: email.subject,
      attachments: email.attachments.map(a => a.filename)
    });
  }

  /**
   * Standard weekly HTML template
   */
  private getStandardWeeklyHTMLTemplate(): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Weekly Quality Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { text-align: center; border-bottom: 2px solid #007bff; padding-bottom: 20px; margin-bottom: 30px; }
        .header h1 { color: #007bff; margin: 0; }
        .section { margin-bottom: 30px; }
        .section h2 { color: #333; border-bottom: 1px solid #eee; padding-bottom: 10px; }
        .metric { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
        .metric:last-child { border-bottom: none; }
        .metric-label { font-weight: bold; color: #666; }
        .metric-value { color: #333; }
        .trend-up { color: #28a745; }
        .trend-down { color: #dc3545; }
        .trend-stable { color: #6c757d; }
        .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Weekly Quality Report</h1>
            <p>{{organization}} - {{date}}</p>
        </div>
        
        <div class="section">
            <h2>📊 Key Metrics</h2>
            <div class="metric">
                <span class="metric-label">Total Issues:</span>
                <span class="metric-value">{{totalIssues}}</span>
            </div>
            <div class="metric">
                <span class="metric-label">Total Quantity:</span>
                <span class="metric-value">{{totalQuantity}}</span>
            </div>
            <div class="metric">
                <span class="metric-label">Top Issue:</span>
                <span class="metric-value">{{topIssue}}</span>
            </div>
            <div class="metric">
                <span class="metric-label">7-Day Trend:</span>
                <span class="metric-value trend-{{trend}}">{{trend}}</span>
            </div>
        </div>
        
        <div class="section">
            <h2>🎯 Top Problem Areas</h2>
            <div class="metric">
                <span class="metric-label">Most Affected Category:</span>
                <span class="metric-value">{{topCategory}}</span>
            </div>
            <div class="metric">
                <span class="metric-label">Most Affected Item:</span>
                <span class="metric-value">{{topItem}}</span>
            </div>
        </div>
        
        <div class="footer">
            <p>Generated by InsightFlow Analytics Platform</p>
            <p>Report Period: {{period}}</p>
        </div>
    </div>
</body>
</html>
    `;
  }

  /**
   * Standard weekly text template
   */
  private getStandardWeeklyTextTemplate(): string {
    return `
WEEKLY QUALITY REPORT
========================

Organization: {{organization}}
Date: {{date}}
Period: {{period}}

KEY METRICS
----------
Total Issues: {{totalIssues}}
Total Quantity: {{totalQuantity}}
Top Issue: {{topIssue}}
7-Day Trend: {{trend}}

TOP PROBLEM AREAS
------------------
Most Affected Category: {{topCategory}}
Most Affected Item: {{topItem}}

---
Generated by InsightFlow Analytics Platform
    `;
  }

  /**
   * Executive monthly HTML template
   */
  private getExecutiveMonthlyHTMLTemplate(): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Executive Monthly Summary</title>
    <style>
        body { font-family: Georgia, serif; margin: 0; padding: 20px; background-color: #f8f9fa; }
        .container { max-width: 700px; margin: 0 auto; background-color: white; padding: 40px; border: 1px solid #dee2e6; }
        .header { text-align: center; margin-bottom: 40px; }
        .header h1 { color: #495057; font-size: 28px; margin: 0; }
        .header p { color: #6c757d; font-size: 16px; margin: 10px 0 0 0; }
        .summary { background-color: #f8f9fa; padding: 20px; border-left: 4px solid #007bff; margin-bottom: 30px; }
        .summary h2 { color: #007bff; margin-top: 0; }
        .insights { margin-bottom: 30px; }
        .insights h2 { color: #495057; border-bottom: 2px solid #dee2e6; padding-bottom: 10px; }
        .insight { margin-bottom: 20px; padding: 15px; background-color: #fff; border: 1px solid #dee2e6; border-radius: 5px; }
        .insight h3 { color: #007bff; margin-top: 0; }
        .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #dee2e6; color: #6c757d; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Executive Monthly Summary</h1>
            <p>{{organization}} - {{date}}</p>
        </div>
        
        <div class="summary">
            <h2>📈 Executive Summary</h2>
            <p>This month's performance shows {{totalIssues}} total issues with {{totalQuantity}} quantity impact. The primary focus area has been {{topCategory}} with {{topIssue}} being the most frequent issue type.</p>
        </div>
        
        <div class="insights">
            <h2>🔍 Key Insights</h2>
            <div class="insight">
                <h3>Performance Trend</h3>
                <p>7-day trend indicates {{trend}} pattern requiring attention.</p>
            </div>
            <div class="insight">
                <h3>Critical Areas</h3>
                <p>{{topCategory}} and {{topItem}} require immediate focus for improvement.</p>
            </div>
        </div>
        
        <div class="footer">
            <p>Confidential Executive Report</p>
            <p>Generated by InsightFlow Analytics Platform</p>
        </div>
    </div>
</body>
</html>
    `;
  }

  /**
   * Executive monthly text template
   */
  private getExecutiveMonthlyTextTemplate(): string {
    return `
EXECUTIVE MONTHLY SUMMARY
=========================

Organization: {{organization}}
Date: {{date}}
Period: {{period}}

EXECUTIVE SUMMARY
------------------
This month's performance shows {{totalIssues}} total issues with {{totalQuantity}} quantity impact.
Primary focus area: {{topCategory}}
Most frequent issue: {{topIssue}}

KEY INSIGHTS
------------
• Performance trend: {{trend}}
• Critical areas requiring attention: {{topCategory}}, {{topItem}}
• Total impact: {{totalQuantity}} units affected

---
Confidential Executive Report
Generated by InsightFlow Analytics Platform
    `;
  }

  /**
   * Alert HTML template
   */
  private getAlertHTMLTemplate(): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Quality Alert</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #fff3cd; }
        .container { max-width: 600px; margin: 0 auto; background-color: #fff; padding: 30px; border: 1px solid #ffeaa7; border-radius: 10px; }
        .alert { background-color: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .alert h1 { margin: 0 0 10px 0; font-size: 24px; }
        .content { margin-bottom: 20px; }
        .action { background-color: #d1ecf1; border: 1px solid #bee5eb; color: #0c5460; padding: 15px; border-radius: 5px; }
        .footer { text-align: center; margin-top: 20px; color: #6c757d; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="alert">
            <h1>🚨 {{alertType}} Alert</h1>
            <p><strong>{{organization}}</strong> - {{date}}</p>
        </div>
        
        <div class="content">
            <h2>Alert Details</h2>
            <p>{{description}}</p>
            <p><strong>Urgency:</strong> {{urgency}}</p>
        </div>
        
        <div class="action">
            <h2>Recommended Action</h2>
            <p>{{action}}</p>
        </div>
        
        <div class="footer">
            <p>Generated by InsightFlow Analytics Platform</p>
        </div>
    </div>
</body>
</html>
    `;
  }

  /**
   * Alert text template
   */
  private getAlertTextTemplate(): string {
    return `
🚨 {{alertType}} ALERT 🚨
=======================

Organization: {{organization}}
Date: {{date}}
Urgency: {{urgency}}

ALERT DETAILS
-------------
{{description}}

RECOMMENDED ACTION
------------------
{{action}}

---
Generated by InsightFlow Analytics Platform
    `;
  }
}
