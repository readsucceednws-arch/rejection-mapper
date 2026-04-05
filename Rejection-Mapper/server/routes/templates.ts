import { Router } from "express";
import { TemplateService } from "../services/templates";

const router = Router();
const templateService = new TemplateService();

// Get all available templates
router.get("/", async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    const templates = await templateService.getTemplates(organizationId);
    res.json(templates);
  } catch (error) {
    console.error("Error getting templates:", error);
    res.status(500).json({ error: "Failed to get templates" });
  }
});

// Get template by ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const templateId = parseInt(id);
    
    if (isNaN(templateId)) {
      return res.status(400).json({ error: "Invalid template ID" });
    }

    const template = await templateService.getTemplate(templateId);
    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }

    res.json(template);
  } catch (error) {
    console.error("Error getting template:", error);
    res.status(500).json({ error: "Failed to get template" });
  }
});

// Apply template to organization
router.post("/:id/apply", async (req, res) => {
  try {
    const { id } = req.params;
    const templateId = parseInt(id);
    const organizationId = req.user?.organizationId;
    
    if (isNaN(templateId)) {
      return res.status(400).json({ error: "Invalid template ID" });
    }

    if (!organizationId) {
      return res.status(400).json({ error: "Organization ID required" });
    }

    const config = await templateService.applyTemplate(organizationId, templateId);
    res.json({ 
      message: "Template applied successfully",
      config 
    });
  } catch (error) {
    console.error("Error applying template:", error);
    res.status(500).json({ error: "Failed to apply template" });
  }
});

// Get organization's current configuration
router.get("/config/current", async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    
    if (!organizationId) {
      return res.status(400).json({ error: "Organization ID required" });
    }

    const config = await templateService.getOrganizationConfig(organizationId);
    res.json(config);
  } catch (error) {
    console.error("Error getting organization config:", error);
    res.status(500).json({ error: "Failed to get organization config" });
  }
});

// Create custom template
router.post("/", async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    
    if (!organizationId) {
      return res.status(400).json({ error: "Organization ID required" });
    }

    const templateData = req.body;
    const template = await templateService.createTemplate(organizationId, templateData);
    res.json(template);
  } catch (error) {
    console.error("Error creating template:", error);
    res.status(500).json({ error: "Failed to create template" });
  }
});

// Seed default templates (admin only)
router.post("/seed", async (req, res) => {
  try {
    await templateService.seedDefaultTemplates();
    res.json({ message: "Default templates seeded successfully" });
  } catch (error) {
    console.error("Error seeding templates:", error);
    res.status(500).json({ error: "Failed to seed templates" });
  }
});

export default router;
