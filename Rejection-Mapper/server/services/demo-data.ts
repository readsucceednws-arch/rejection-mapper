import { db } from "../storage";
import { organizations, issueEntries, templates } from "@shared/schema";
import { eq } from "drizzle-orm";

/**
 * Demo Data Seeding Service
 * Creates sample organizations and data for testing
 * Manufacturing and Bakery examples
 */

export class DemoDataService {
  
  /**
   * Seed all demo data
   */
  async seedAllDemoData() {
    console.log("Seeding demo data...");
    
    try {
      await this.seedManufacturingOrg();
      await this.seedBakeryOrg();
      
      console.log("Demo data seeded successfully");
    } catch (error) {
      console.error("Error seeding demo data:", error);
      throw error;
    }
  }

  /**
   * Seed manufacturing organization with sample data
   */
  private async seedManufacturingOrg() {
    // Check if manufacturing org already exists
    const existingOrg = await db.select()
      .from(organizations)
      .where(eq(organizations.name, "Demo Manufacturing Co."))
      .limit(1);

    if (existingOrg.length > 0) {
      console.log("Manufacturing demo organization already exists");
      return;
    }

    // Create manufacturing organization
    const [manufacturingOrg] = await db.insert(organizations).values({
      name: "Demo Manufacturing Co.",
      inviteCode: "MANU-DEMO-2024",
    }).returning();

    console.log("Created manufacturing organization:", manufacturingOrg.name);

    // Seed manufacturing issue entries
    const manufacturingData = [
      {
        partNumber: "BR-1234",
        zone: "Assembly Line A",
        type: "Dimensional Error",
        quantity: 5,
        remarks: "Parts out of tolerance",
        date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        customFields: {
          severity: "Major",
          costImpact: 250.00,
          equipmentId: "EQ-001"
        },
        tags: ["quality", "dimensional"],
        entryType: "rejection"
      },
      {
        partNumber: "BR-5678",
        zone: "Paint Shop",
        type: "Surface Defect",
        quantity: 12,
        remarks: "Paint bubbling on surface",
        date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
        customFields: {
          severity: "Minor",
          costImpact: 120.00,
          equipmentId: "EQ-005"
        },
        tags: ["quality", "paint"],
        entryType: "rejection"
      },
      {
        partNumber: "BR-9012",
        zone: "Assembly Line B",
        type: "Misalignment",
        quantity: 8,
        remarks: "Components not aligned properly",
        date: new Date(), // Today
        customFields: {
          severity: "Major",
          costImpact: 180.00,
          equipmentId: "EQ-002"
        },
        tags: ["quality", "assembly"],
        entryType: "rework"
      },
      {
        partNumber: "BR-3456",
        zone: "Welding Station",
        type: "Weld Defect",
        quantity: 3,
        remarks: "Incomplete weld penetration",
        date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
        customFields: {
          severity: "Critical",
          costImpact: 450.00,
          equipmentId: "EQ-003"
        },
        tags: ["quality", "welding"],
        entryType: "rejection"
      },
      {
        partNumber: "BR-7890",
        zone: "Assembly Line A",
        type: "Dimensional Error",
        quantity: 7,
        remarks: "Repeated tolerance issues",
        date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
        customFields: {
          severity: "Major",
          costImpact: 350.00,
          equipmentId: "EQ-001"
        },
        tags: ["quality", "dimensional"],
        entryType: "rejection"
      },
      {
        partNumber: "BR-2345",
        zone: "Quality Control",
        type: "Cosmetic Defect",
        quantity: 15,
        remarks: "Surface scratches",
        date: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), // 4 days ago
        customFields: {
          severity: "Minor",
          costImpact: 75.00,
          equipmentId: "EQ-006"
        },
        tags: ["quality", "cosmetic"],
        entryType: "rework"
      },
      {
        partNumber: "BR-6789",
        zone: "Paint Shop",
        type: "Color Mismatch",
        quantity: 4,
        remarks: "Paint color doesn't match specification",
        date: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000), // 6 days ago
        customFields: {
          severity: "Minor",
          costImpact: 80.00,
          equipmentId: "EQ-005"
        },
        tags: ["quality", "paint"],
        entryType: "rejection"
      },
      {
        partNumber: "BR-1357",
        zone: "Assembly Line B",
        type: "Missing Component",
        quantity: 2,
        remarks: "Missing bolt in assembly",
        date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
        customFields: {
          severity: "Major",
          costImpact: 60.00,
          equipmentId: "EQ-002"
        },
        tags: ["quality", "assembly"],
        entryType: "rework"
      }
    ];

    for (const entry of manufacturingData) {
      await db.insert(issueEntries).values({
        ...entry,
        organizationId: manufacturingOrg.id,
        createdByUsername: "demo-user",
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    console.log(`Seeded ${manufacturingData.length} manufacturing entries`);
  }

  /**
   * Seed bakery organization with sample data
   */
  private async seedBakeryOrg() {
    // Check if bakery org already exists
    const existingOrg = await db.select()
      .from(organizations)
      .where(eq(organizations.name, "Demo Bakery & Cafe"))
      .limit(1);

    if (existingOrg.length > 0) {
      console.log("Bakery demo organization already exists");
      return;
    }

    // Create bakery organization
    const [bakeryOrg] = await db.insert(organizations).values({
      name: "Demo Bakery & Cafe",
      inviteCode: "BAKERY-DEMO-2024",
    }).returning();

    console.log("Created bakery organization:", bakeryOrg.name);

    // Seed bakery issue entries
    const bakeryData = [
      {
        partNumber: "Sourdough Bread",
        zone: "Mixing Area",
        type: "Underproofed",
        quantity: 15,
        remarks: "Dough didn't rise properly",
        date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
        customFields: {
          batchNumber: "BATCH-2024-0315-A",
          temperature: 68,
          shelfLifeIssue: false,
          ingredientIssue: "Yeast"
        },
        tags: ["dough", "proofing"],
        entryType: "waste"
      },
      {
        partNumber: "Chocolate Croissant",
        zone: "Baking Oven",
        type: "Overbaked",
        quantity: 8,
        remarks: "Too dark, bitter taste",
        date: new Date(), // Today
        customFields: {
          batchNumber: "BATCH-2024-0315-B",
          temperature: 425,
          shelfLifeIssue: false,
          ingredientIssue: "Other"
        },
        tags: ["pastry", "baking"],
        entryType: "waste"
      },
      {
        partNumber: "Blueberry Muffins",
        zone: "Cooling Rack",
        type: "Moldy",
        quantity: 24,
        remarks: "Mold detected after 2 days",
        date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        customFields: {
          batchNumber: "BATCH-2024-0313-C",
          temperature: 72,
          shelfLifeIssue: true,
          ingredientIssue: "Other"
        },
        tags: ["muffins", "storage"],
        entryType: "return"
      },
      {
        partNumber: "French Baguette",
        zone: "Proofing Box",
        type: "Overproofed",
        quantity: 12,
        remarks: "Collapsed during baking",
        date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
        customFields: {
          batchNumber: "BATCH-2024-0314-D",
          temperature: 85,
          shelfLifeIssue: false,
          ingredientIssue: "Yeast"
        },
        tags: ["bread", "proofing"],
        entryType: "waste"
      },
      {
        partNumber: "Cinnamon Rolls",
        zone: "Prep Station",
        type: "Underbaked",
        quantity: 6,
        remarks: "Dough still raw in center",
        date: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), // 4 days ago
        customFields: {
          batchNumber: "BATCH-2024-0312-E",
          temperature: 350,
          shelfLifeIssue: false,
          ingredientIssue: "Other"
        },
        tags: ["pastry", "baking"],
        entryType: "complaint"
      },
      {
        partNumber: "Whole Wheat Bread",
        zone: "Mixing Area",
        type: "Dry Texture",
        quantity: 10,
        remarks: "Too dense and dry",
        date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
        customFields: {
          batchNumber: "BATCH-2024-0311-F",
          temperature: 70,
          shelfLifeIssue: false,
          ingredientIssue: "Flour"
        },
        tags: ["bread", "texture"],
        entryType: "complaint"
      },
      {
        partNumber: "Apple Pie",
        zone: "Baking Oven",
        type: "Burnt Crust",
        quantity: 4,
        remarks: "Bottom crust burnt",
        date: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000), // 6 days ago
        customFields: {
          batchNumber: "BATCH-2024-0310-G",
          temperature: 400,
          shelfLifeIssue: false,
          ingredientIssue: "Other"
        },
        tags: ["pie", "baking"],
        entryType: "waste"
      },
      {
        partNumber: "Chocolate Chip Cookies",
        zone: "Cooling Rack",
        type: "Too Hard",
        quantity: 18,
        remarks: "Overbaked, hard as rocks",
        date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
        customFields: {
          batchNumber: "BATCH-2024-0309-H",
          temperature: 375,
          shelfLifeIssue: false,
          ingredientIssue: "Other"
        },
        tags: ["cookies", "texture"],
        entryType: "complaint"
      }
    ];

    for (const entry of bakeryData) {
      await db.insert(issueEntries).values({
        ...entry,
        organizationId: bakeryOrg.id,
        createdByUsername: "demo-baker",
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    console.log(`Seeded ${bakeryData.length} bakery entries`);
  }

  /**
   * Clean up all demo data
   */
  async cleanupDemoData() {
    console.log("Cleaning up demo data...");
    
    try {
      // Delete demo organizations and their data
      await db.delete(organizations)
        .where(eq(organizations.name, "Demo Manufacturing Co."));
      
      await db.delete(organizations)
        .where(eq(organizations.name, "Demo Bakery & Cafe"));
      
      console.log("Demo data cleaned up successfully");
    } catch (error) {
      console.error("Error cleaning up demo data:", error);
      throw error;
    }
  }

  /**
   * Get demo organization info
   */
  async getDemoOrganizations() {
    const demoOrgs = await db.select()
      .from(organizations)
      .where(organizations.name.in(["Demo Manufacturing Co.", "Demo Bakery & Cafe"]));

    return demoOrgs;
  }
}
