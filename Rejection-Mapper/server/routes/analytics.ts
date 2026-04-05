import { Router, Request, Response } from "express";
import { AnalyticsService } from "../services/analytics";
import { DemoDataService } from "../services/demo-data";

const router = Router();
const analyticsService = new AnalyticsService();
const demoDataService = new DemoDataService();

// Seed demo data endpoint
router.post("/seed-demo/:organizationId", async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;
    const orgId = parseInt(organizationId);
    
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    await demoDataService.seedAllDemoData();
    res.json({ success: true, message: "Demo data seeded successfully" });
  } catch (error) {
    console.error("Error seeding demo data:", error);
    res.status(500).json({ error: "Failed to seed demo data" });
  }
});

// Get comprehensive analytics
router.get("/overview/:organizationId", async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;
    const orgId = parseInt(organizationId);
    
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    // Parse optional period parameters
    const { from, to } = req.query;
    let period;
    
    if (from && to) {
      period = {
        from: new Date(from as string),
        to: new Date(to as string)
      };
    }

    const analytics = await analyticsService.getAnalytics(orgId, period);
    res.json(analytics);
  } catch (error) {
    console.error("Error getting analytics overview:", error);
    res.status(500).json({ error: "Failed to get analytics overview" });
  }
});

// Get overview stats only
router.get("/stats/:organizationId", async (req, res) => {
  try {
    const { organizationId } = req.params;
    const orgId = parseInt(organizationId);
    
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const { from, to } = req.query;
    let period;
    
    if (from && to) {
      period = {
        from: new Date(from as string),
        to: new Date(to as string)
      };
    }

    const analytics = await analyticsService.getAnalytics(orgId, period);
    res.json(analytics.overview);
  } catch (error) {
    console.error("Error getting overview stats:", error);
    res.status(500).json({ error: "Failed to get overview stats" });
  }
});

// Get trend data
router.get("/trends/:organizationId", async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;
    const orgId = parseInt(organizationId);
    
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const analytics = await analyticsService.getAnalytics(orgId);
    res.json(analytics.trends);
  } catch (error) {
    console.error("Error getting trend data:", error);
    res.status(500).json({ error: "Failed to get trend data" });
  }
});

// Get top categories
router.get("/top-categories/:organizationId", async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;
    const orgId = parseInt(organizationId);
    
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const { from, to } = req.query;
    let period;
    
    if (from && to) {
      period = {
        from: new Date(from as string),
        to: new Date(to as string)
      };
    }

    const analytics = await analyticsService.getAnalytics(orgId, period);
    res.json(analytics.topCategories.slice(0, limit));
  } catch (error) {
    console.error("Error getting top categories:", error);
    res.status(500).json({ error: "Failed to get top categories" });
  }
});

// Get top items
router.get("/top-items/:organizationId", async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;
    const orgId = parseInt(organizationId);
    
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const { from, to } = req.query;
    let period;
    
    if (from && to) {
      period = {
        from: new Date(from as string),
        to: new Date(to as string)
      };
    }

    const analytics = await analyticsService.getAnalytics(orgId, period);
    res.json(analytics.topItems.slice(0, limit));
  } catch (error) {
    console.error("Error getting top items:", error);
    res.status(500).json({ error: "Failed to get top items" });
  }
});

// Get top issue types
router.get("/top-issue-types/:organizationId", async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;
    const orgId = parseInt(organizationId);
    
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const { from, to } = req.query;
    let period;
    
    if (from && to) {
      period = {
        from: new Date(from as string),
        to: new Date(to as string)
      };
    }

    const analytics = await analyticsService.getAnalytics(orgId, period);
    res.json(analytics.topIssueTypes.slice(0, limit));
  } catch (error) {
    console.error("Error getting top issue types:", error);
    res.status(500).json({ error: "Failed to get top issue types" });
  }
});

// Get daily trend data
router.get("/daily-trend/:organizationId", async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;
    const orgId = parseInt(organizationId);
    
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const { from, to } = req.query;
    let period;
    
    if (from && to) {
      period = {
        from: new Date(from as string),
        to: new Date(to as string)
      };
    }

    const analytics = await analyticsService.getAnalytics(orgId, period);
    res.json(analytics.dailyTrend);
  } catch (error) {
    console.error("Error getting daily trend:", error);
    res.status(500).json({ error: "Failed to get daily trend" });
  }
});

// Get insight summaries
router.get("/insights/:organizationId", async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;
    const orgId = parseInt(organizationId);
    
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const { from, to } = req.query;
    let period;
    
    if (from && to) {
      period = {
        from: new Date(from as string),
        to: new Date(to as string)
      };
    }

    const analytics = await analyticsService.getAnalytics(orgId, period);
    res.json(analytics.insights);
  } catch (error) {
    console.error("Error getting insights:", error);
    res.status(500).json({ error: "Failed to get insights" });
  }
});

// Get field labels for template
router.get("/field-labels/:organizationId", async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;
    const orgId = parseInt(organizationId);
    
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const labels = await analyticsService.getFieldLabels(orgId);
    res.json(labels);
  } catch (error) {
    console.error("Error getting field labels:", error);
    res.status(500).json({ error: "Failed to get field labels" });
  }
});

// Update organization template
router.post("/update-template/:organizationId", async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;
    const { templateId } = req.body;
    const orgId = parseInt(organizationId);
    
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    if (!templateId) {
      return res.status(400).json({ error: "Template ID is required" });
    }

    await analyticsService.updateOrganizationTemplate(orgId, templateId);
    res.json({ success: true, message: "Template updated successfully" });
  } catch (error) {
    console.error("Error updating template:", error);
    res.status(500).json({ error: "Failed to update template" });
  }
});

export default router;
