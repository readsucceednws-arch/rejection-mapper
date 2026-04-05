import { db } from "../storage";
import { issueEntries, organizations, users } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

/**
 * Collaboration Service
 * Handles real-time updates, comments, assignments, and notifications
 */

export interface Comment {
  id: number;
  issueId: number;
  userId: number;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: number;
    username: string;
    fullName?: string;
  };
}

export interface Assignment {
  id: number;
  issueId: number;
  assignedTo: number;
  assignedBy: number;
  status: 'assigned' | 'in_progress' | 'completed';
  createdAt: Date;
  updatedAt: Date;
  assignedToUser: {
    id: number;
    username: string;
    fullName?: string;
  };
  assignedByUser: {
    id: number;
    username: string;
    fullName?: string;
  };
}

export interface Notification {
  id: number;
  userId: number;
  type: 'comment' | 'assignment' | 'trend_alert' | 'insight';
  title: string;
  message: string;
  data?: any;
  read: boolean;
  createdAt: Date;
}

export interface RealtimeUpdate {
  type: 'new_issue' | 'comment_added' | 'assignment_updated' | 'trend_change';
  organizationId: number;
  data: any;
  timestamp: Date;
  userId?: number;
}

export class CollaborationService {
  
  /**
   * Add comment to issue
   */
  async addComment(issueId: number, userId: number, content: string): Promise<Comment> {
    // In a real implementation, this would insert into a comments table
    // For now, we'll simulate with a mock implementation
    
    const comment: Comment = {
      id: Math.floor(Math.random() * 10000),
      issueId,
      userId,
      content,
      createdAt: new Date(),
      updatedAt: new Date(),
      user: {
        id: userId,
        username: `user_${userId}`,
        fullName: `User ${userId}`
      }
    };

    // Create notification for other users in the organization
    await this.createNotification(
      userId,
      'comment',
      'New Comment Added',
      `A comment was added to issue #${issueId}`,
      { issueId, commentId: comment.id }
    );

    // Trigger real-time update
    await this.triggerRealtimeUpdate({
      type: 'comment_added',
      organizationId: await this.getIssueOrganizationId(issueId),
      data: comment,
      timestamp: new Date(),
      userId
    });

    return comment;
  }

  /**
   * Assign issue to user
   */
  async assignIssue(issueId: number, assignedBy: number, assignedTo: number): Promise<Assignment> {
    const assignment: Assignment = {
      id: Math.floor(Math.random() * 10000),
      issueId,
      assignedTo,
      assignedBy,
      status: 'assigned',
      createdAt: new Date(),
      updatedAt: new Date(),
      assignedToUser: {
        id: assignedTo,
        username: `user_${assignedTo}`,
        fullName: `User ${assignedTo}`
      },
      assignedByUser: {
        id: assignedBy,
        username: `user_${assignedBy}`,
        fullName: `User ${assignedBy}`
      }
    };

    // Create notification for assigned user
    await this.createNotification(
      assignedTo,
      'assignment',
      'Issue Assigned',
      `You have been assigned to issue #${issueId}`,
      { issueId, assignmentId: assignment.id }
    );

    // Trigger real-time update
    await this.triggerRealtimeUpdate({
      type: 'assignment_updated',
      organizationId: await this.getIssueOrganizationId(issueId),
      data: assignment,
      timestamp: new Date(),
      userId: assignedBy
    });

    return assignment;
  }

  /**
   * Update assignment status
   */
  async updateAssignmentStatus(assignmentId: number, status: 'in_progress' | 'completed'): Promise<Assignment> {
    // Mock implementation
    const assignment: Assignment = {
      id: assignmentId,
      issueId: Math.floor(Math.random() * 1000),
      assignedTo: Math.floor(Math.random() * 10),
      assignedBy: Math.floor(Math.random() * 10),
      status,
      createdAt: new Date(),
      updatedAt: new Date(),
      assignedToUser: {
        id: Math.floor(Math.random() * 10),
        username: `user_${Math.floor(Math.random() * 10)}`,
        fullName: `User ${Math.floor(Math.random() * 10)}`
      },
      assignedByUser: {
        id: Math.floor(Math.random() * 10),
        username: `user_${Math.floor(Math.random() * 10)}`,
        fullName: `User ${Math.floor(Math.random() * 10)}`
      }
    };

    return assignment;
  }

  /**
   * Get comments for issue
   */
  async getIssueComments(issueId: number): Promise<Comment[]> {
    // Mock implementation - in real app, query comments table
    return [
      {
        id: 1,
        issueId,
        userId: 1,
        content: "This issue needs immediate attention",
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        user: {
          id: 1,
          username: "john_doe",
          fullName: "John Doe"
        }
      },
      {
        id: 2,
        issueId,
        userId: 2,
        content: "I've investigated and found the root cause",
        createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
        updatedAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
        user: {
          id: 2,
          username: "jane_smith",
          fullName: "Jane Smith"
        }
      }
    ];
  }

  /**
   * Get assignments for issue
   */
  async getIssueAssignments(issueId: number): Promise<Assignment[]> {
    // Mock implementation
    return [
      {
        id: 1,
        issueId,
        assignedTo: 2,
        assignedBy: 1,
        status: 'in_progress',
        createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
        updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        assignedToUser: {
          id: 2,
          username: "jane_smith",
          fullName: "Jane Smith"
        },
        assignedByUser: {
          id: 1,
          username: "john_doe",
          fullName: "John Doe"
        }
      }
    ];
  }

  /**
   * Get user notifications
   */
  async getUserNotifications(userId: number, limit: number = 50): Promise<Notification[]> {
    // Mock implementation
    return [
      {
        id: 1,
        userId,
        type: 'comment',
        title: 'New Comment Added',
        message: 'A comment was added to issue #123',
        data: { issueId: 123, commentId: 456 },
        read: false,
        createdAt: new Date(Date.now() - 30 * 60 * 1000)
      },
      {
        id: 2,
        userId,
        type: 'assignment',
        title: 'Issue Assigned',
        message: 'You have been assigned to issue #124',
        data: { issueId: 124, assignmentId: 789 },
        read: false,
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000)
      },
      {
        id: 3,
        userId,
        type: 'trend_alert',
        title: 'Trend Alert',
        message: 'Issues increased by 25% this week',
        data: { trend: 'increasing', changePercent: 25 },
        read: true,
        createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000)
      }
    ];
  }

  /**
   * Mark notification as read
   */
  async markNotificationRead(notificationId: number, userId: number): Promise<void> {
    // Mock implementation - would update notifications table
  }

  /**
   * Create notification
   */
  private async createNotification(
    userId: number,
    type: 'comment' | 'assignment' | 'trend_alert' | 'insight',
    title: string,
    message: string,
    data?: any
  ): Promise<Notification> {
    const notification: Notification = {
      id: Math.floor(Math.random() * 10000),
      userId,
      type,
      title,
      message,
      data,
      read: false,
      createdAt: new Date()
    };

    return notification;
  }

  /**
   * Trigger real-time update
   */
  private async triggerRealtimeUpdate(update: RealtimeUpdate): Promise<void> {
    // In a real implementation, this would use WebSocket or Server-Sent Events
    // For now, we'll just log the update
    console.log('Real-time update triggered:', update);
  }

  /**
   * Get organization users for assignment
   */
  async getOrganizationUsers(organizationId: number): Promise<any[]> {
    // Mock implementation - would query users table
    return [
      { id: 1, username: 'john_doe', fullName: 'John Doe', role: 'admin' },
      { id: 2, username: 'jane_smith', fullName: 'Jane Smith', role: 'member' },
      { id: 3, username: 'bob_wilson', fullName: 'Bob Wilson', role: 'member' }
    ];
  }

  /**
   * Get issue organization ID
   */
  private async getIssueOrganizationId(issueId: number): Promise<number> {
    // Mock implementation - would query issueEntries table
    return 1;
  }

  /**
   * Create trend alert notifications
   */
  async createTrendAlerts(organizationId: number, trendData: any): Promise<void> {
    const users = await this.getOrganizationUsers(organizationId);
    
    for (const user of users) {
      if (trendData.trend === 'increasing' && Math.abs(trendData.changePercent.count) > 20) {
        await this.createNotification(
          user.id,
          'trend_alert',
          'Trend Alert',
          `Issues ${trendData.trend} by ${Math.abs(trendData.changePercent.count).toFixed(1)}% this week`,
          { trend: trendData.trend, changePercent: trendData.changePercent.count }
        );
      }
    }
  }

  /**
   * Create insight notifications
   */
  async createInsightNotifications(organizationId: number, insights: any[]): Promise<void> {
    const users = await this.getOrganizationUsers(organizationId);
    
    for (const user of users) {
      for (const insight of insights.slice(0, 2)) { // Top 2 insights
        if (insight.confidence > 0.8) {
          await this.createNotification(
            user.id,
            'insight',
            'New Insight Available',
            insight.title,
            { insightType: insight.type, value: insight.value }
          );
        }
      }
    }
  }
}
