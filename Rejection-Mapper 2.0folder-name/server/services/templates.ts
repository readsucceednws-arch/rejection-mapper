import { db } from "../storage";
import { templates, customFields, organizations } from "@shared/schema";
import { eq } from "drizzle-orm";

/**
 * Template System - Multi-industry configurations
 * Supports manufacturing, bakery, food service, and other industries
 */

export interface TemplateConfig {
  industry: string;
  name: string;
  description: string;
  fieldMappings: {
    zone: string;      // "Work Station", "Kitchen Area", "Production Line"
    partNumber: string; // "Part Number", "Product Name", "Menu Item"
    type: string;      // "Issue Type", "Problem Type", "Quality Issue"
  };
  customFields: Array<{
    name: string;
    type: 'text' | 'number' | 'date' | 'select' | 'boolean';
    required: boolean;
    options?: string[];
    defaultValue?: any;
  }>;
  statusOptions: string[];
  priorityOptions: string[];
  sampleData: any[];
}

export class TemplateService {
  
  /**
   * Get all available templates
   */
  async getTemplates(organizationId?: number) {
    const query = db.select().from(templates);
    
    if (organizationId) {
      // Return public templates + organization-specific templates
      return await query.where(
        eq(templates.isPublic, true)
      );
    }
    
    return await query;
  }

  /**
   * Get template by ID
   */
  async getTemplate(id: number) {
    const [template] = await db.select().from(templates).where(eq(templates.id, id));
    return template;
  }

  /**
   * Create custom template for organization
   */
  async createTemplate(organizationId: number, config: TemplateConfig) {
    const [template] = await db.insert(templates).values({
      name: config.name,
      industry: config.industry,
      description: config.description,
      config: config as any,
      sampleData: config.sampleData,
      isPublic: false,
      organizationId,
    }).returning();

    return template;
  }

  /**
   * Seed default templates
   */
  async seedDefaultTemplates() {
    const existingTemplates = await db.select().from(templates).limit(1);
    
    if (existingTemplates.length > 0) {
      return; // Templates already exist
    }

    const defaultTemplates: TemplateConfig[] = [
      // Manufacturing Template (existing workflow)
      {
        industry: "manufacturing",
        name: "Manufacturing QA",
        description: "Quality control and defect tracking for manufacturing",
        fieldMappings: {
          zone: "Work Station",
          partNumber: "Part Number",
          type: "Defect Type"
        },
        customFields: [
          {
            name: "Severity",
            type: "select",
            required: true,
            options: ["Minor", "Major", "Critical"]
          },
          {
            name: "Cost Impact",
            type: "number",
            required: false
          },
          {
            name: "Equipment ID",
            type: "text",
            required: false
          }
        ],
        statusOptions: ["Open", "In Progress", "Resolved", "Closed"],
        priorityOptions: ["Low", "Medium", "High", "Critical"],
        sampleData: [
          {
            partNumber: "BR-1234",
            zone: "Assembly Line A",
            type: "Dimensional Error",
            quantity: 5,
            remarks: "Parts out of tolerance",
            severity: "Major",
            costImpact: 250.00,
            equipmentId: "EQ-001"
          },
          {
            partNumber: "BR-5678",
            zone: "Paint Shop",
            type: "Surface Defect",
            quantity: 12,
            remarks: "Paint bubbling on surface",
            severity: "Minor",
            costImpact: 120.00,
            equipmentId: "EQ-005"
          }
        ]
      },

      // Bakery Template
      {
        industry: "bakery",
        name: "Bakery Quality Control",
        description: "Track quality issues in bakery production",
        fieldMappings: {
          zone: "Kitchen Area",
          partNumber: "Product Name",
          type: "Quality Issue"
        },
        customFields: [
          {
            name: "Batch Number",
            type: "text",
            required: true
          },
          {
            name: "Temperature",
            type: "number",
            required: false
          },
          {
            name: "Shelf Life Issue",
            type: "boolean",
            required: false
          },
          {
            name: "Ingredient Issue",
            type: "select",
            required: false,
            options: ["Flour", "Yeast", "Sugar", "Butter", "Other"]
          }
        ],
        statusOptions: ["Fresh", "Stale", "Moldy", "Underbaked", "Overbaked"],
        priorityOptions: ["Low", "Medium", "High", "Urgent"],
        sampleData: [
          {
            partNumber: "Sourdough Bread",
            zone: "Mixing Area",
            type: "Underproofed",
            quantity: 15,
            remarks: "Dough didn't rise properly",
            batchNumber: "BATCH-2024-0315-A",
            temperature: 68,
            shelfLifeIssue: false,
            ingredientIssue: "Yeast"
          },
          {
            partNumber: "Chocolate Croissant",
            zone: "Baking Oven",
            type: "Overbaked",
            quantity: 8,
            remarks: "Too dark, bitter taste",
            batchNumber: "BATCH-2024-0315-B",
            temperature: 425,
            shelfLifeIssue: false,
            ingredientIssue: "Other"
          },
          {
            partNumber: "Blueberry Muffins",
            zone: "Cooling Rack",
            type: "Moldy",
            quantity: 24,
            remarks: "Mold detected after 2 days",
            batchNumber: "BATCH-2024-0313-C",
            temperature: 72,
            shelfLifeIssue: true,
            ingredientIssue: "Other"
          }
        ]
      },

      // Food Service Template
      {
        industry: "food_service",
        name: "Restaurant Quality Tracker",
        description: "Track food quality and service issues",
        fieldMappings: {
          zone: "Service Area",
          partNumber: "Menu Item",
          type: "Issue Type"
        },
        customFields: [
          {
            name: "Customer Complaint",
            type: "boolean",
            required: false
          },
          {
            name: "Allergy Concern",
            type: "boolean",
            required: false
          },
          {
            name: "Staff Involved",
            type: "text",
            required: false
          },
          {
            name: "Time of Day",
            type: "select",
            required: false,
            options: ["Breakfast", "Lunch", "Dinner", "Late Night"]
          }
        ],
        statusOptions: ["Preparation", "Cooking", "Plating", "Service", "Cleanup"],
        priorityOptions: ["Low", "Medium", "High", "Critical"],
        sampleData: [
          {
            partNumber: "Grilled Salmon",
            zone: "Kitchen Line",
            type: "Overcooked",
            quantity: 3,
            remarks: "Customer complained about dry fish",
            customerComplaint: true,
            allergyConcern: false,
            staffInvolved: "Chef John",
            timeOfDay: "Dinner"
          },
          {
            partNumber: "Caesar Salad",
            zone: "Prep Station",
            type: "Contamination",
            quantity: 1,
            remarks: "Foreign object found in salad",
            customerComplaint: true,
            allergyConcern: true,
            staffInvolved: "Prep Cook Sarah",
            timeOfDay: "Lunch"
          },
          {
            partNumber: "French Fries",
            zone: "Fry Station",
            type: "Soggy",
            quantity: 8,
            remarks: "Fries not crispy enough",
            customerComplaint: false,
            allergyConcern: false,
            staffInvolved: "Line Cook Mike",
            timeOfDay: "Lunch"
          }
        ]
      }
    ];

    // Insert default templates
    for (const template of defaultTemplates) {
      await db.insert(templates).values({
        name: template.name,
        industry: template.industry,
        description: template.description,
        config: template as any,
        sampleData: template.sampleData,
        isPublic: true,
        organizationId: null,
      });
    }

    console.log("Default templates seeded successfully");
  }

  /**
   * Apply template to organization
   */
  async applyTemplate(organizationId: number, templateId: number) {
    const template = await this.getTemplate(templateId);
    if (!template) {
      throw new Error("Template not found");
    }

    const config = template.config as TemplateConfig;

    // Create custom fields for the organization
    for (const field of config.customFields) {
      await db.insert(customFields).values({
        name: field.name,
        type: field.type,
        required: field.required,
        options: field.options || [],
        defaultValue: field.defaultValue,
        organizationId,
      });
    }

    return config;
  }

  /**
   * Get organization's field configuration
   */
  async getOrganizationConfig(organizationId: number) {
    const orgCustomFields = await db.select().from(customFields)
      .where(eq(customFields.organizationId, organizationId));

    // Default to manufacturing if no custom fields exist
    if (orgCustomFields.length === 0) {
      const manufacturingTemplate = await db.select()
        .from(templates)
        .where(eq(templates.industry, "manufacturing"))
        .limit(1);

      if (manufacturingTemplate.length > 0) {
        return manufacturingTemplate[0].config as TemplateConfig;
      }
    }

    return {
      industry: "custom",
      name: "Custom Configuration",
      description: "Organization-specific configuration",
      fieldMappings: {
        zone: "Zone",
        partNumber: "Part Number",
        type: "Type"
      },
      customFields: orgCustomFields.map(field => ({
        name: field.name,
        type: field.type,
        required: field.required,
        options: field.options,
        defaultValue: field.defaultValue
      })),
      statusOptions: ["Open", "In Progress", "Resolved", "Closed"],
      priorityOptions: ["Low", "Medium", "High", "Critical"],
      sampleData: []
    } as TemplateConfig;
  }

  /**
   * Get industry-specific insights rules
   */
  getIndustryRules(industry: string) {
    const rules = {
      manufacturing: [
        {
          condition: "high_rejection_rate",
          message: "High rejection rate detected in {zone}",
          cause: "Equipment calibration or material quality issues",
          action: "Schedule equipment maintenance and check supplier quality"
        },
        {
          condition: "recurring_issue",
          message: "Recurring {issueType} issues with {partNumber}",
          cause: "Process or design flaw",
          action: "Review standard operating procedures"
        }
      ],
      bakery: [
        {
          condition: "shelf_life_issues",
          message: "Multiple shelf life issues detected",
          cause: "Storage conditions or ingredient quality",
          action: "Check temperature controls and ingredient freshness"
        },
        {
          condition: "baking_consistency",
          message: "Inconsistent baking results for {product}",
          cause: "Temperature fluctuations or timing issues",
          action: "Calibrate oven timers and check temperature consistency"
        }
      ],
      food_service: [
        {
          condition: "customer_complaints",
          message: "High customer complaints for {menuItem}",
          cause: "Food quality or preparation issues",
          action: "Review recipe and staff training"
        },
        {
          condition: "allergy_concerns",
          message: "Allergy concerns reported",
          cause: "Cross-contamination or labeling issues",
          action: "Review allergen handling procedures"
        }
      ]
    };

    return rules[industry] || rules.manufacturing;
  }
}
