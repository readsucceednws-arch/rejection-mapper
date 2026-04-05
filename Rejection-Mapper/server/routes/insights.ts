import { Router } from "express";
import { InsightsEngine } from "../services/insights-engine";

const router = Router();
const insightsEngine = new InsightsEngine();

// Get dashboard metrics
router.get("/dashboard/:organizationId", async (req, res) => {
  try {
    const { organizationId } = req.params;
    const orgId = parseInt(organizationId);
    
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const metrics = await insightsEngine.getDashboardMetrics(orgId);
    res.json(metrics);
  } catch (error) {
    console.error("Error getting dashboard metrics:", error);
    res.status(500).json({ error: "Failed to get dashboard metrics" });
  }
});

// Get top issues
router.get("/top-issues/:organizationId", async (req, res) => {
  try {
    const { organizationId } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;
    const orgId = parseInt(organizationId);
    
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const topIssues = await insightsEngine.getTopIssues(orgId, limit);
    res.json(topIssues);
  } catch (error) {
    console.error("Error getting top issues:", error);
    res.status(500).json({ error: "Failed to get top issues" });
  }
});

// Get zone analysis
router.get("/zone-analysis/:organizationId", async (req, res) => {
  try {
    const { organizationId } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;
    const orgId = parseInt(organizationId);
    
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const zoneAnalysis = await insightsEngine.getZoneAnalysis(orgId, limit);
    res.json(zoneAnalysis);
  } catch (error) {
    console.error("Error getting zone analysis:", error);
    res.status(500).json({ error: "Failed to get zone analysis" });
  }
});

// Get item analysis
router.get("/item-analysis/:organizationId", async (req, res) => {
  try {
    const { organizationId } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;
    const orgId = parseInt(organizationId);
    
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const itemAnalysis = await insightsEngine.getItemAnalysis(orgId, limit);
    res.json(itemAnalysis);
  } catch (error) {
    console.error("Error getting item analysis:", error);
    res.status(500).json({ error: "Failed to get item analysis" });
  }
});

// Get trend data
router.get("/trends/:organizationId", async (req, res) => {
  try {
    const { organizationId } = req.params;
    const orgId = parseInt(organizationId);
    
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const trendData = await insightsEngine.getTrendData(orgId);
    res.json(trendData);
  } catch (error) {
    console.error("Error getting trend data:", error);
    res.status(500).json({ error: "Failed to get trend data" });
  }
});

// Get daily aggregation for charts
router.get("/daily-aggregation/:organizationId", async (req, res) => {
  try {
    const { organizationId } = req.params;
    const days = parseInt(req.query.days as string) || 30;
    const orgId = parseInt(organizationId);
    
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const dailyData = await insightsEngine.getDailyAggregation(orgId, days);
    res.json(dailyData);
  } catch (error) {
    console.error("Error getting daily aggregation:", error);
    res.status(500).json({ error: "Failed to get daily aggregation" });
  }
});

export default router;
