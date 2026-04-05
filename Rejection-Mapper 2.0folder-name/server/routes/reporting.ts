import { Router } from "express";
import { ReportingService } from "../services/reporting";

const router = Router();
const reportingService = new ReportingService();

// Generate weekly report
router.get("/weekly/:organizationId", async (req, res) => {
  try {
    const { organizationId } = req.params;
    const orgId = parseInt(organizationId);
    
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const reportData = await reportingService.generateWeeklyReport(orgId);
    res.json(reportData);
  } catch (error) {
    console.error("Error generating weekly report:", error);
    res.status(500).json({ error: "Failed to generate weekly report" });
  }
});

// Generate monthly report
router.get("/monthly/:organizationId", async (req, res) => {
  try {
    const { organizationId } = req.params;
    const orgId = parseInt(organizationId);
    
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const reportData = await reportingService.generateMonthlyReport(orgId);
    res.json(reportData);
  } catch (error) {
    console.error("Error generating monthly report:", error);
    res.status(500).json({ error: "Failed to generate monthly report" });
  }
});

// Export weekly report as CSV
router.get("/weekly/:organizationId/csv", async (req, res) => {
  try {
    const { organizationId } = req.params;
    const orgId = parseInt(organizationId);
    
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const reportData = await reportingService.generateWeeklyReport(orgId);
    const csvContent = await reportingService.exportToCSV(reportData);
    const filename = reportingService.generateCSVFilename(reportData);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (error) {
    console.error("Error exporting weekly report:", error);
    res.status(500).json({ error: "Failed to export weekly report" });
  }
});

// Export monthly report as CSV
router.get("/monthly/:organizationId/csv", async (req, res) => {
  try {
    const { organizationId } = req.params;
    const orgId = parseInt(organizationId);
    
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    const reportData = await reportingService.generateMonthlyReport(orgId);
    const csvContent = await reportingService.exportToCSV(reportData);
    const filename = reportingService.generateCSVFilename(reportData);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (error) {
    console.error("Error exporting monthly report:", error);
    res.status(500).json({ error: "Failed to export monthly report" });
  }
});

// Generate custom report with period
router.post("/custom/:organizationId", async (req, res) => {
  try {
    const { organizationId } = req.params;
    const orgId = parseInt(organizationId);
    const { type, from, to } = req.body;
    
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    if (!type || !from || !to) {
      return res.status(400).json({ error: "Missing required fields: type, from, to" });
    }

    const config = {
      type: type as 'weekly' | 'monthly',
      organizationId: orgId,
      format: 'csv' as const,
      period: {
        from: new Date(from),
        to: new Date(to)
      }
    };

    const reportData = await reportingService.generateReport(config);
    res.json(reportData);
  } catch (error) {
    console.error("Error generating custom report:", error);
    res.status(500).json({ error: "Failed to generate custom report" });
  }
});

// Export custom report as CSV
router.post("/custom/:organizationId/csv", async (req, res) => {
  try {
    const { organizationId } = req.params;
    const orgId = parseInt(organizationId);
    const { type, from, to } = req.body;
    
    if (isNaN(orgId)) {
      return res.status(400).json({ error: "Invalid organization ID" });
    }

    if (!type || !from || !to) {
      return res.status(400).json({ error: "Missing required fields: type, from, to" });
    }

    const config = {
      type: type as 'weekly' | 'monthly',
      organizationId: orgId,
      format: 'csv' as const,
      period: {
        from: new Date(from),
        to: new Date(to)
      }
    };

    const reportData = await reportingService.generateReport(config);
    const csvContent = await reportingService.exportToCSV(reportData);
    const filename = reportingService.generateCSVFilename(reportData);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (error) {
    console.error("Error exporting custom report:", error);
    res.status(500).json({ error: "Failed to export custom report" });
  }
});

export default router;
