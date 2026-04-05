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
 * Safely parse a date - handles multiple formats including Excel serial numbers.
 * Supported: DD-MM-YYYY, YYYY-MM-DD, DD/MM/YYYY, ISO 8601, Excel serial numbers.
 *
 * IMPORTANT: DD-MM-YYYY is checked FIRST (before generic JS Date parsing) because
 * JavaScript's Date constructor misinterprets "01-04-2025" as Jan 4 instead of Apr 1.
 */
export function safeDate(value: unknown): Date | null {
  const text = normalizeText(value);
  if (!text) return null;

  // ── 1. Excel serial number (pure numeric, e.g. 45748) ──────────────────────
  const serialNum = parseFloat(text);
  if (!isNaN(serialNum) && /^\d+(\.\d+)?$/.test(text)) {
    if (serialNum > 0 && serialNum < 999999) {
      const excelEpoch = new Date(1900, 0, 1);
      const daysFromEpoch = Math.floor(serialNum) - 1;
      // Account for Excel's leap-year bug (it treats 1900 as a leap year)
      const adjustedDays = daysFromEpoch > 59 ? daysFromEpoch + 1 : daysFromEpoch;
      const date = new Date(excelEpoch.getTime() + adjustedDays * 24 * 60 * 60 * 1000);
      if (!Number.isNaN(date.getTime()) && date.getFullYear() > 1900 && date.getFullYear() < 2100) {
        return date;
      }
    }
  }

  // ── 2. DD-MM-YYYY / DD/MM/YYYY / DD.MM.YYYY  (checked BEFORE generic JS parsing) ──
  // Standard format in Indian manufacturing Excel exports.
  // Must run before new Date() to avoid MM-DD misinterpretation by JS engine.
  const ddmmyyyyMatch = text.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (ddmmyyyyMatch) {
    const d = parseInt(ddmmyyyyMatch[1], 10);
    const m = parseInt(ddmmyyyyMatch[2], 10);
    const y = parseInt(ddmmyyyyMatch[3], 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const date = new Date(y, m - 1, d);
      if (!Number.isNaN(date.getTime())) {
        return date;
      }
    }
  }

  // ── 3. YYYY-MM-DD / YYYY/MM/DD  (ISO 8601 date-only) ─────────────────────
  const yyyymmddMatch = text.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (yyyymmddMatch) {
    const y = parseInt(yyyymmddMatch[1], 10);
    const m = parseInt(yyyymmddMatch[2], 10);
    const d = parseInt(yyyymmddMatch[3], 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const date = new Date(y, m - 1, d);
      if (!Number.isNaN(date.getTime())) {
        return date;
      }
    }
  }

  // ── 4. ISO 8601 with time component (e.g. "2025-04-01T00:00:00.000Z") ─────
  // Only allow strings with explicit time so JS UTC offset doesn't shift the date.
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
}

// NOTE: MM/DD/YYYY (US format) intentionally removed — it is ambiguous with
// DD-MM-YYYY and caused incorrect date imports from Indian Excel files.
// If US-format support is ever needed, add explicit UI toggle for date format.


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
