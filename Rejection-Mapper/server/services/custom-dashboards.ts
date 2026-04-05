import { db } from "../storage";
import { organizations, users } from "@shared/schema";
import { eq } from "drizzle-orm";

/**
 * Custom Dashboard Service
 * User-configurable dashboard layouts with drag-and-drop widgets
 */

export interface DashboardTemplate {
  id: string;
  name: string;
  description: string;
  category: 'analytics' | 'operations' | 'executive' | 'quality';
  layout: DashboardLayout;
  isDefault: boolean;
  widgets: WidgetTemplate[];
}

export interface WidgetTemplate {
  id: string;
  type: 'kpi' | 'chart' | 'table' | 'insight' | 'trend' | 'alert' | 'custom';
  name: string;
  description: string;
  icon: string;
  defaultConfig: WidgetConfig;
  dataSource: string;
  permissions: string[];
}

export interface WidgetConfig {
  title: string;
  size: { width: number; height: number };
  refreshInterval?: number;
  filters?: any;
  chartType?: 'line' | 'bar' | 'pie' | 'area' | 'scatter';
  period?: '7d' | '30d' | '90d' | 'custom';
  showTrend?: boolean;
  showTarget?: boolean;
  limit?: number;
  colors?: string[];
  customFields?: string[];
}

export interface CustomDashboard {
  id: number;
  organizationId: number;
  userId: number;
  name: string;
  description?: string;
  layout: DashboardLayout;
  templateId?: string;
  isPublic: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: {
    id: number;
    username: string;
    fullName?: string;
  };
}

export interface DashboardLayout {
  widgets: LayoutWidget[];
  columns: number;
  theme: 'light' | 'dark' | 'auto';
  background?: string;
  header?: {
    showTitle: boolean;
    showDate: boolean;
    showOrganization: boolean;
  };
  sidebar?: {
    enabled: boolean;
    position: 'left' | 'right';
    widgets: string[];
  };
}

export interface LayoutWidget {
  id: string;
  type: 'kpi' | 'chart' | 'table' | 'insight' | 'trend' | 'alert' | 'custom';
  title: string;
  position: { x: number; y: number; w: number; h: number };
  config: WidgetConfig;
  dataSource: string;
  isVisible: boolean;
  minimized?: boolean;
}

export class CustomDashboardService {
  
  /**
   * Get dashboard templates
   */
  async getDashboardTemplates(): Promise<DashboardTemplate[]> {
    return [
      {
        id: 'analytics_overview',
        name: 'Analytics Overview',
        description: 'Comprehensive analytics dashboard with all key metrics',
        category: 'analytics',
        layout: {
          widgets: [
            {
              id: 'kpi_total_issues',
              type: 'kpi',
              title: 'Total Issues',
              position: { x: 0, y: 0, w: 3, h: 2 },
              config: {
                title: 'Total Issues',
                size: { width: 3, height: 2 },
                showTrend: true,
                refreshInterval: 300
              },
              dataSource: 'analytics.total_issues',
              isVisible: true
            },
            {
              id: 'chart_daily_trend',
              type: 'chart',
              title: 'Daily Trend',
              position: { x: 3, y: 0, w: 6, h: 4 },
              config: {
                title: 'Daily Trend',
                size: { width: 6, height: 4 },
                chartType: 'line',
                period: '30d',
                refreshInterval: 600
              },
              dataSource: 'analytics.daily_trend',
              isVisible: true
            },
            {
              id: 'table_top_issues',
              type: 'table',
              title: 'Top Issues',
              position: { x: 9, y: 0, w: 3, h: 4 },
              config: {
                title: 'Top Issues',
                size: { width: 3, height: 4 },
                limit: 10,
                refreshInterval: 300
              },
              dataSource: 'analytics.top_issues',
              isVisible: true
            },
            {
              id: 'chart_categories',
              type: 'chart',
              title: 'Categories',
              position: { x: 0, y: 2, w: 4, h: 3 },
              config: {
                title: 'Top Categories',
                size: { width: 4, height: 3 },
                chartType: 'bar',
                period: '30d',
                limit: 5
              },
              dataSource: 'analytics.top_categories',
              isVisible: true
            },
            {
              id: 'insights_panel',
              type: 'insight',
              title: 'AI Insights',
              position: { x: 4, y: 4, w: 8, h: 2 },
              config: {
                title: 'AI Insights',
                size: { width: 8, height: 2 },
                refreshInterval: 1800
              },
              dataSource: 'ai.insights',
              isVisible: true
            }
          ],
          columns: 12,
          theme: 'light'
        },
        isDefault: true,
        widgets: []
      },
      {
        id: 'operations_dashboard',
        name: 'Operations Dashboard',
        description: 'Real-time operational metrics and alerts',
        category: 'operations',
        layout: {
          widgets: [
            {
              id: 'alert_panel',
              type: 'alert',
              title: 'Active Alerts',
              position: { x: 0, y: 0, w: 12, h: 2 },
              config: {
                title: 'Active Alerts',
                size: { width: 12, height: 2 },
                refreshInterval: 60
              },
              dataSource: 'alerts.active',
              isVisible: true
            },
            {
              id: 'kpi_current_shift',
              type: 'kpi',
              title: 'Current Shift',
              position: { x: 0, y: 2, w: 4, h: 2 },
              config: {
                title: 'Current Shift',
                size: { width: 4, height: 2 },
                refreshInterval: 120
              },
              dataSource: 'operations.current_shift',
              isVisible: true
            },
            {
              id: 'chart_real_time',
              type: 'chart',
              title: 'Real-time Issues',
              position: { x: 4, y: 2, w: 8, h: 3 },
              config: {
                title: 'Real-time Issues',
                size: { width: 8, height: 3 },
                chartType: 'area',
                period: '7d',
                refreshInterval: 300
              },
              dataSource: 'analytics.real_time',
              isVisible: true
            }
          ],
          columns: 12,
          theme: 'light'
        },
        isDefault: false,
        widgets: []
      },
      {
        id: 'executive_summary',
        name: 'Executive Summary',
        description: 'High-level metrics for executive leadership',
        category: 'executive',
        layout: {
          widgets: [
            {
              id: 'kpi_summary',
              type: 'kpi',
              title: 'Monthly Summary',
              position: { x: 0, y: 0, w: 12, h: 1 },
              config: {
                title: 'Monthly Summary',
                size: { width: 12, height: 1 },
                period: '30d',
                refreshInterval: 3600
              },
              dataSource: 'executive.summary',
              isVisible: true
            },
            {
              id: 'chart_performance',
              type: 'chart',
              title: 'Performance Trend',
              position: { x: 0, y: 1, w: 6, h: 3 },
              config: {
                title: 'Performance Trend',
                size: { width: 6, height: 3 },
                chartType: 'line',
                period: '90d',
                refreshInterval: 1800
              },
              dataSource: 'executive.performance',
              isVisible: true
            },
            {
              id: 'insights_executive',
              type: 'insight',
              title: 'Key Insights',
              position: { x: 6, y: 1, w: 6, h: 3 },
              config: {
                title: 'Key Insights',
                size: { width: 6, height: 3 },
                refreshInterval: 3600
              },
              dataSource: 'ai.executive_insights',
              isVisible: true
            }
          ],
          columns: 12,
          theme: 'light'
        },
        isDefault: false,
        widgets: []
      },
      {
        id: 'quality_control',
        name: 'Quality Control',
        description: 'Quality metrics and defect analysis',
        category: 'quality',
        layout: {
          widgets: [
            {
              id: 'kpi_defect_rate',
              type: 'kpi',
              title: 'Defect Rate',
              position: { x: 0, y: 0, w: 3, h: 2 },
              config: {
                title: 'Defect Rate',
                size: { width: 3, height: 2 },
                showTrend: true,
                refreshInterval: 300
              },
              dataSource: 'quality.defect_rate',
              isVisible: true
            },
            {
              id: 'chart_defect_types',
              type: 'chart',
              title: 'Defect Types',
              position: { x: 3, y: 0, w: 4, h: 3 },
              config: {
                title: 'Defect Types',
                size: { width: 4, height: 3 },
                chartType: 'pie',
                period: '30d',
                refreshInterval: 600
              },
              dataSource: 'quality.defect_types',
              isVisible: true
            },
            {
              id: 'table_defect_details',
              type: 'table',
              title: 'Recent Defects',
              position: { x: 7, y: 0, w: 5, h: 4 },
              config: {
                title: 'Recent Defects',
                size: { width: 5, height: 4 },
                limit: 20,
                refreshInterval: 300
              },
              dataSource: 'quality.recent_defects',
              isVisible: true
            }
          ],
          columns: 12,
          theme: 'light'
        },
        isDefault: false,
        widgets: []
      }
    ];
  }

  /**
   * Get widget templates
   */
  async getWidgetTemplates(): Promise<WidgetTemplate[]> {
    return [
      {
        id: 'kpi_widget',
        type: 'kpi',
        name: 'KPI Metric',
        description: 'Display key performance indicators with trends',
        icon: '📊',
        defaultConfig: {
          title: 'KPI Metric',
          size: { width: 3, height: 2 },
          showTrend: true,
          refreshInterval: 300
        },
        dataSource: 'analytics.kpi',
        permissions: ['read:analytics']
      },
      {
        id: 'chart_widget',
        type: 'chart',
        name: 'Chart',
        description: 'Various chart types for data visualization',
        icon: '📈',
        defaultConfig: {
          title: 'Chart',
          size: { width: 6, height: 4 },
          chartType: 'line',
          period: '30d',
          refreshInterval: 600
        },
        dataSource: 'analytics.chart',
        permissions: ['read:analytics']
      },
      {
        id: 'table_widget',
        type: 'table',
        name: 'Data Table',
        description: 'Tabular data display with sorting and filtering',
        icon: '📋',
        defaultConfig: {
          title: 'Data Table',
          size: { width: 6, height: 4 },
          limit: 10,
          refreshInterval: 300
        },
        dataSource: 'analytics.table',
        permissions: ['read:analytics']
      },
      {
        id: 'insight_widget',
        type: 'insight',
        name: 'AI Insights',
        description: 'AI-powered insights and recommendations',
        icon: '🧠',
        defaultConfig: {
          title: 'AI Insights',
          size: { width: 8, height: 2 },
          refreshInterval: 1800
        },
        dataSource: 'ai.insights',
        permissions: ['read:ai']
      },
      {
        id: 'trend_widget',
        type: 'trend',
        name: 'Trend Analysis',
        description: 'Trend analysis with predictions',
        icon: '📉',
        defaultConfig: {
          title: 'Trend Analysis',
          size: { width: 6, height: 3 },
          chartType: 'line',
          period: '90d',
          showTrend: true,
          refreshInterval: 900
        },
        dataSource: 'analytics.trend',
        permissions: ['read:analytics']
      },
      {
        id: 'alert_widget',
        type: 'alert',
        name: 'Alert Panel',
        description: 'Real-time alerts and notifications',
        icon: '🚨',
        defaultConfig: {
          title: 'Alerts',
          size: { width: 12, height: 2 },
          refreshInterval: 60
        },
        dataSource: 'alerts.active',
        permissions: ['read:alerts']
      },
      {
        id: 'custom_widget',
        type: 'custom',
        name: 'Custom Widget',
        description: 'Custom widget with user-defined configuration',
        icon: '⚙️',
        defaultConfig: {
          title: 'Custom Widget',
          size: { width: 4, height: 3 },
          refreshInterval: 300
        },
        dataSource: 'custom.data',
        permissions: ['read:custom']
      }
    ];
  }

  /**
   * Create custom dashboard
   */
  async createCustomDashboard(
    organizationId: number,
    userId: number,
    name: string,
    description: string,
    layout: DashboardLayout,
    templateId?: string
  ): Promise<CustomDashboard> {
    const dashboard: CustomDashboard = {
      id: Math.floor(Math.random() * 10000),
      organizationId,
      userId,
      name,
      description,
      layout,
      templateId,
      isPublic: false,
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: {
        id: userId,
        username: `user_${userId}`,
        fullName: `User ${userId}`
      }
    };

    return dashboard;
  }

  /**
   * Get organization dashboards
   */
  async getOrganizationDashboards(organizationId: number, userId?: number): Promise<CustomDashboard[]> {
    // Mock implementation
    return [
      {
        id: 1,
        organizationId,
        userId: userId || 1,
        name: 'Main Analytics Dashboard',
        description: 'Primary analytics dashboard for the organization',
        layout: {
          widgets: [
            {
              id: 'kpi_1',
              type: 'kpi',
              title: 'Total Issues',
              position: { x: 0, y: 0, w: 3, h: 2 },
              config: {
                title: 'Total Issues',
                size: { width: 3, height: 2 },
                showTrend: true,
                refreshInterval: 300
              },
              dataSource: 'analytics.total_issues',
              isVisible: true
            },
            {
              id: 'chart_1',
              type: 'chart',
              title: 'Daily Trend',
              position: { x: 3, y: 0, w: 6, h: 4 },
              config: {
                title: 'Daily Trend',
                size: { width: 6, height: 4 },
                chartType: 'line',
                period: '30d',
                refreshInterval: 600
              },
              dataSource: 'analytics.daily_trend',
              isVisible: true
            }
          ],
          columns: 12,
          theme: 'light'
        },
        isPublic: true,
        isDefault: true,
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
        createdBy: {
          id: 1,
          username: 'admin',
          fullName: 'Admin User'
        }
      },
      {
        id: 2,
        organizationId,
        userId: userId || 1,
        name: 'Quality Control Dashboard',
        description: 'Focused on quality metrics and defect analysis',
        layout: {
          widgets: [
            {
              id: 'kpi_defect_rate',
              type: 'kpi',
              title: 'Defect Rate',
              position: { x: 0, y: 0, w: 4, h: 2 },
              config: {
                title: 'Defect Rate',
                size: { width: 4, height: 2 },
                showTrend: true,
                refreshInterval: 300
              },
              dataSource: 'quality.defect_rate',
              isVisible: true
            }
          ],
          columns: 12,
          theme: 'light'
        },
        isPublic: false,
        isDefault: false,
        createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
        createdBy: {
          id: 2,
          username: 'quality_manager',
          fullName: 'Quality Manager'
        }
      }
    ];
  }

  /**
   * Update dashboard layout
   */
  async updateDashboardLayout(
    dashboardId: number,
    layout: DashboardLayout
  ): Promise<CustomDashboard> {
    // Mock implementation
    return {
      id: dashboardId,
      organizationId: 1,
      userId: 1,
      name: 'Updated Dashboard',
      description: 'Updated description',
      layout,
      isPublic: false,
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: {
        id: 1,
        username: 'admin',
        fullName: 'Admin User'
      }
    };
  }

  /**
   * Delete dashboard
   */
  async deleteDashboard(dashboardId: number): Promise<void> {
    // Mock implementation
  }

  /**
   * Duplicate dashboard
   */
  async duplicateDashboard(
    dashboardId: number,
    newName: string,
    userId: number
  ): Promise<CustomDashboard> {
    // Mock implementation
    const originalDashboard = await this.getOrganizationDashboards(1);
    const dashboard = originalDashboard.find(d => d.id === dashboardId);
    
    if (!dashboard) {
      throw new Error('Dashboard not found');
    }

    return {
      ...dashboard,
      id: Math.floor(Math.random() * 10000),
      name: newName,
      userId,
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  /**
   * Share dashboard with users
   */
  async shareDashboard(
    dashboardId: number,
    userIds: number[],
    permissions: 'view' | 'edit'
  ): Promise<void> {
    // Mock implementation
  }

  /**
   * Get dashboard data for widgets
   */
  async getDashboardWidgetData(
    dashboardId: number,
    widgetId: string
  ): Promise<any> {
    // Mock implementation - would fetch data based on widget data source
    const mockData = {
      'analytics.total_issues': {
        value: 147,
        trend: 'increasing',
        change: 12.5,
        previousValue: 131
      },
      'analytics.daily_trend': [
        { date: '2024-03-01', value: 12 },
        { date: '2024-03-02', value: 15 },
        { date: '2024-03-03', value: 8 },
        { date: '2024-03-04', value: 18 },
        { date: '2024-03-05', value: 14 }
      ],
      'quality.defect_rate': {
        value: 2.3,
        trend: 'decreasing',
        change: -0.4,
        previousValue: 2.7
      }
    };

    return mockData[widgetId as keyof typeof mockData] || null;
  }

  /**
   * Validate dashboard layout
   */
  validateDashboardLayout(layout: DashboardLayout): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for overlapping widgets
    const positions = layout.widgets.map(w => w.position);
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        if (this.positionsOverlap(positions[i], positions[j])) {
          errors.push(`Widgets overlap at positions ${i} and ${j}`);
        }
      }
    }

    // Check for out-of-bounds widgets
    for (const widget of layout.widgets) {
      if (widget.position.x + widget.position.w > layout.columns) {
        errors.push(`Widget "${widget.title}" exceeds dashboard width`);
      }
      if (widget.position.x < 0 || widget.position.y < 0) {
        errors.push(`Widget "${widget.title}" has negative position`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Check if two widget positions overlap
   */
  private positionsOverlap(pos1: any, pos2: any): boolean {
    return !(
      pos1.x + pos1.w <= pos2.x ||
      pos2.x + pos2.w <= pos1.x ||
      pos1.y + pos1.h <= pos2.y ||
      pos2.y + pos2.h <= pos1.y
    );
  }

  /**
   * Get dashboard usage analytics
   */
  async getDashboardUsageAnalytics(organizationId: number): Promise<any> {
    // Mock implementation
    return {
      totalViews: 1250,
      uniqueUsers: 45,
      mostViewedDashboard: 'Main Analytics Dashboard',
      averageSessionDuration: 420, // seconds
      widgetUsage: [
        { widgetType: 'kpi', usage: 850 },
        { widgetType: 'chart', usage: 1200 },
        { widgetType: 'table', usage: 600 },
        { widgetType: 'insight', usage: 450 }
      ]
    };
  }
}
