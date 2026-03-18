/**
 * CSV/Excel Import Utilities
 * 
 * Provides robust data normalization, matching, and fallback logic
 * for importing rejection and rework entries with flexible field handling.
 */

/**
 * Normalize text by trimming whitespace
 */
export function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

/**
 * Normalize for case-insensitive, flexible matching
 * Removes special characters and converts to lowercase
 */
export function normalizeForMatching(value: unknown): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^\w\s]/g, "") // Remove special chars
    .replace(/\s+/g, " ") // Normalize spaces
    .trim();
}

/**
 * Normalize codes (uppercase, remove spaces, keep dashes)
 */
export function normalizeCode(value: unknown): string {
  return normalizeText(value)
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[‐-‒–—]/g, "-");
}

/**
 * Safely parse a number
 */
export function safeNumber(value: unknown): number | null {
  const text = normalizeText(value);
  if (!text) return null;
  
  const cleaned = text
    .replace(/[₹$€]/g, "") // Remove currency symbols
    .replace(/,/g, "") // Remove commas
    .replace(/\(([^)]+)\)/, "-$1"); // Convert (123) to -123
  
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

/**
 * Safely parse a date
 */
export function safeDate(value: unknown): Date | null {
  const text = normalizeText(value);
  if (!text) return null;
  
  try {
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  } catch {
    // Fall through
  }
  
  return null;
}

/**
 * Check if two values match flexibly
 * Handles case differences, extra spaces, minor variations
 */
export function flexibleMatch(a: unknown, b: unknown): boolean {
  return normalizeForMatching(a) === normalizeForMatching(b);
}

/**
 * Check if a value is blank/empty
 */
export function isBlank(value: unknown): boolean {
  return normalizeText(value) === "";
}

/**
 * Try to find a matching key in an object with flexible matching
 */
export function findKeyByFlexibleMatch(
  obj: Record<string, unknown>,
  target: string | null | undefined
): string | null {
  if (!target) return null;
  
  for (const key of Object.keys(obj)) {
    if (flexibleMatch(key, target)) {
      return key;
    }
  }
  
  return null;
}

/**
 * Get cell value from a row, with flexible header matching
 */
export function getRowCell(
  row: Record<string, unknown>,
  colName: string | null | undefined
): string | null {
  if (!colName) return null;
  
  // Try exact match first
  const exact = row[colName];
  if (exact !== undefined && exact !== null) {
    return normalizeText(exact) || null;
  }
  
  // Try flexible match
  const key = findKeyByFlexibleMatch(row, colName);
  if (key) {
    return normalizeText(row[key]) || null;
  }
  
  return null;
}

/**
 * Import result for a single row
 */
export interface RowImportResult {
  success: boolean;
  rowIndex: number;
  reason?: string;
  createdIds?: {
    partId?: number;
    rejectionTypeId?: number;
    reworkTypeId?: number;
    zoneId?: number;
  };
}

/**
 * Summary of import operation
 */
export interface ImportSummary {
  totalRows: number;
  successfulImports: number;
  failedRows: RowImportResult[];
  created: {
    parts: number;
    rejectionTypes: number;
    reworkTypes: number;
    zones: number;
  };
  warnings: string[];
}

/**
 * Initialize an empty import summary
 */
export function createEmptySummary(): ImportSummary {
  return {
    totalRows: 0,
    successfulImports: 0,
    failedRows: [],
    created: {
      parts: 0,
      rejectionTypes: 0,
      reworkTypes: 0,
      zones: 0,
    },
    warnings: [],
  };
}

/**
 * Add a failed row to the summary
 */
export function addFailedRow(
  summary: ImportSummary,
  rowIndex: number,
  reason: string
): void {
  summary.failedRows.push({
    success: false,
    rowIndex,
    reason,
  });
}

/**
 * Add a warning to the summary
 */
export function addWarning(summary: ImportSummary, warning: string): void {
  if (!summary.warnings.includes(warning)) {
    summary.warnings.push(warning);
  }
}

/**
 * Format error message for a row
 */
export function formatRowError(
  rowIndex: number,
  message: string,
  value?: string
): string {
  return `Row ${rowIndex}: ${message}${value ? ` (${value})` : ""}`;
}

/**
 * Logging function for import operations
 */
export class ImportLogger {
  private logs: string[] = [];
  private readonly prefix: string;

  constructor(prefix: string = "[IMPORT]") {
    this.prefix = prefix;
  }

  debug(message: string, data?: unknown): void {
    const log = `${this.prefix} [DEBUG] ${message}${data ? ` | ${JSON.stringify(data)}` : ""}`;
    console.log(log);
    this.logs.push(log);
  }

  info(message: string, data?: unknown): void {
    const log = `${this.prefix} [INFO] ${message}${data ? ` | ${JSON.stringify(data)}` : ""}`;
    console.log(log);
    this.logs.push(log);
  }

  warn(message: string, data?: unknown): void {
    const log = `${this.prefix} [WARN] ${message}${data ? ` | ${JSON.stringify(data)}` : ""}`;
    console.warn(log);
    this.logs.push(log);
  }

  error(message: string, data?: unknown): void {
    const log = `${this.prefix} [ERROR] ${message}${data ? ` | ${JSON.stringify(data)}` : ""}`;
    console.error(log);
    this.logs.push(log);
  }

  getLogs(): string[] {
    return [...this.logs];
  }

  clearLogs(): void {
    this.logs = [];
  }
}
