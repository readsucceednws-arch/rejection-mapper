import { useRef, useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useParts, useCreatePart } from "@/hooks/use-parts";
import { useRejectionTypes, useCreateRejectionType } from "@/hooks/use-rejection-types";
import { useReworkTypes, useCreateReworkType } from "@/hooks/use-rework-types";
import { useCreateRejectionEntry } from "@/hooks/use-rejection-entries";
import { api } from "@shared/routes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertCircle,
  ChevronDown, ChevronUp, Link, Wand2, ArrowUpDown, ArrowUp, ArrowDown, SkipForward,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type Row = Record<string, string>;

type ColumnMap = {
  partNumber:    string | null;
  rejectionCode: string | null;
  reworkCode:    string | null;
  description:   string | null;
  quantity:      string | null;
  process:       string | null;
  date:          string | null;
  rate:          string | null;
  amount:        string | null;
  remarks:       string | null;
};

type FieldType = "date" | "number" | "currency" | "quantity" | "partNumber" | "rejectionCode" | "process" | "text";

type ColumnMeta = {
  original: string;
  canonical: keyof ColumnMap | null;
  fieldType: FieldType;
};

type NormalizedRow = {
  id: string;
  date: string | null;
  partNumber: string | null;
  rejectionCode: string | null;
  quantity: number | null;
  process: string | null;
  rate: number | null;
  amount: number | null;
  sourceSheet: string;
  _raw: Row;
};

type ImportSection = {
  sheet: string;
  type: "parts" | "rejection-reasons" | "rework-types" | "entries" | "unknown";
  rows: Row[];
  allHeaders: string[];
  columnMap: ColumnMap;
  columnMeta: ColumnMeta[];
  confidence: number;
  headerRowIndex: number;
};

type SkippedSheet = {
  name: string;
  reason: string;
};

type ParseResult = {
  sections: ImportSection[];
  skipped: SkippedSheet[];
};

type ImportResult = {
  section: ImportSection;
  added: number;
  skipped: number;
  errors: string[];
};

type SortKey = keyof Omit<NormalizedRow, "_raw">;

// ─── Slug sets ───────────────────────────────────────────────────────────────

/** Slugify: strips all non-alphanumeric for exact-slug matching */
function slug(val: string | undefined): string {
  return (val ?? "").toString().toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Normalize: lowercases, strips punctuation while keeping spaces, for phrase matching */
function normalizePhrase(val: string | undefined): string {
  return (val ?? "").toString().toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
}

// ─── Column alias slug sets (used for exact slug + substring matching) ─────────
const PART_SLUGS      = new Set(["partnumber","partno","partnum","pn","part","item","itemno","itemnum","itemnumber","partcode","partid","materialcode","material","materialno","productname","product","component","componentname","itemdescription","itemname","componentno"]);
const REWORK_SLUGS    = new Set(["reworkcode","rwcode","rework","reworktype","rwtypecode","reworkreason","reworkno","reworknum","rwreason"]);
const REJECTION_SLUGS = new Set(["rejectioncode","rejectcode","rejectionreason","rejectreason","rejcode","rejreason","rejection","failurecode","defectcode","defect","ncrcode","nccode","defecttype","failurereason","rejecttype","rejectiontype"]);
const CODE_SLUGS      = new Set(["code","reasoncode","typecode","defectcode"]);
const DESC_SLUGS      = new Set(["description","desc","name","partname","itemname","reason","details","partdescription","remarks","defectdescription","failuredescription"]);
const PURPOSE_SLUGS   = new Set(["purpose","process","type","category","entrytype","operation","stage","workstage","operationtype"]);
const QTY_SLUGS       = new Set(["quantity","qty","count","units","pcs","pieces","nos","quantityrejected","rejectedqty","rejqty","totalqty","noofpieces"]);
const REMARKS_SLUGS   = new Set(["remarks","notes","note","comment","comments","observation","observations","remark"]);
const DATE_SLUGS      = new Set(["date","entrydate","transactiondate","logdate","entrydt","dateofentry","dateofrejection","inspectiondate"]);
const RATE_SLUGS      = new Set(["rate","unitrate","price","unitprice","cost","unitcost","costperunit"]);
const AMOUNT_SLUGS    = new Set(["amount","value","total","totalamount","totalvalue","totalcost","linecost"]);

// ─── Phrase aliases (multi-word, matched after normalizePhrase) ────────────────
const PHRASE_ALIASES: { phrase: string; weight: number }[] = [
  { phrase: "part number",         weight: 3 },
  { phrase: "part no",             weight: 3 },
  { phrase: "product name",        weight: 3 },
  { phrase: "item name",           weight: 2 },
  { phrase: "component name",      weight: 2 },
  { phrase: "rejection code",      weight: 3 },
  { phrase: "reject code",         weight: 3 },
  { phrase: "rejection reason",    weight: 3 },
  { phrase: "reject reason",       weight: 3 },
  { phrase: "defect code",         weight: 3 },
  { phrase: "rework code",         weight: 3 },
  { phrase: "rework reason",       weight: 3 },
  { phrase: "entry date",          weight: 3 },
  { phrase: "transaction date",    weight: 3 },
  { phrase: "date of rejection",   weight: 3 },
  { phrase: "quantity rejected",   weight: 3 },
  { phrase: "rejected qty",        weight: 3 },
  { phrase: "unit rate",           weight: 2 },
  { phrase: "unit price",          weight: 2 },
  { phrase: "total amount",        weight: 2 },
  { phrase: "date",                weight: 2 },
  { phrase: "qty",                 weight: 2 },
  { phrase: "rate",                weight: 2 },
  { phrase: "amount",              weight: 2 },
  { phrase: "process",             weight: 2 },
  { phrase: "purpose",             weight: 2 },
  { phrase: "operation",           weight: 2 },
  { phrase: "stage",               weight: 1 },
  { phrase: "cost",                weight: 1 },
];

const ALL_KNOWN_SLUGS = new Set([
  ...PART_SLUGS, ...REWORK_SLUGS, ...REJECTION_SLUGS, ...CODE_SLUGS,
  ...DESC_SLUGS, ...PURPOSE_SLUGS, ...QTY_SLUGS, ...REMARKS_SLUGS,
  ...DATE_SLUGS, ...RATE_SLUGS, ...AMOUNT_SLUGS,
]);

/** Score a raw header cell using both slug-set matching and phrase matching */
function scoreCell(cell: string): number {
  const s = slug(cell);
  const p = normalizePhrase(cell);
  let score = 0;
  // Exact slug match (highest confidence)
  if (s.length >= 2 && ALL_KNOWN_SLUGS.has(s)) score += 3;
  // Substring slug match
  else if (s.length >= 2) {
    for (const key of ALL_KNOWN_SLUGS) {
      if (s.includes(key) || key.includes(s)) { score += 1; break; }
    }
  }
  // Phrase match (multi-word aliases from attached methodology)
  for (const { phrase, weight } of PHRASE_ALIASES) {
    if (p.includes(phrase)) { score += weight; break; }
  }
  return score;
}

// ─── Item normalisation ───────────────────────────────────────────────────────

/**
 * Returns a stable grouping key for a raw item/part name.
 * Strips bracketed codes, collapses whitespace, lowercases — so
 * "Widget A [PN-001]", "Widget A[PN-001]", and "widget a" all share one bucket.
 */
function normalizeItemKey(raw: string | null | undefined): string {
  if (!raw?.trim()) return "(no part)";
  return raw
    .replace(/\s*[\[(].*?[\])]\s*/g, " ")   // strip [CODE] or (CODE) suffixes
    .replace(/[.\-_/]+/g, " ")               // treat separators as spaces
    .replace(/\s+/g, " ")                    // collapse whitespace
    .trim()
    .toLowerCase();
}

/** Picks the cleanest display label from a group of raw part names. */
function bestDisplayLabel(names: (string | null)[]): string {
  const freq = new Map<string, number>();
  for (const n of names) {
    if (!n) continue;
    const k = n.trim();
    freq.set(k, (freq.get(k) ?? 0) + 1);
  }
  if (!freq.size) return "(no part)";
  return [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

// ─── Matching helpers ─────────────────────────────────────────────────────────

function matchesAny(header: string, set: Set<string>): boolean {
  const s = slug(header);
  const p = normalizePhrase(header);
  if (s.length === 0) return false;
  // Exact slug match
  if (set.has(s)) return true;
  // Substring slug match
  for (const key of set) {
    if (s.includes(key) || key.includes(s)) return true;
  }
  // Phrase-based match: check if any set entry, when space-separated, appears in the phrase
  for (const key of set) {
    const phrase = key.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
    if (phrase.length > 2 && p.includes(phrase)) return true;
  }
  return false;
}

function findCol(row: Row, set: Set<string>): string {
  for (const key of Object.keys(row)) {
    if (matchesAny(key, set) && row[key]?.trim()) return row[key].trim();
  }
  return "";
}

function findHeader(headers: string[], set: Set<string>): string | null {
  return headers.find((h) => matchesAny(h, set)) ?? null;
}

// ─── Field type inference ─────────────────────────────────────────────────────

function inferFieldType(header: string, sampleValues: string[]): FieldType {
  if (matchesAny(header, DATE_SLUGS))      return "date";
  if (matchesAny(header, QTY_SLUGS))       return "quantity";
  if (matchesAny(header, RATE_SLUGS) || matchesAny(header, AMOUNT_SLUGS)) return "currency";
  if (matchesAny(header, PART_SLUGS))      return "partNumber";
  if (matchesAny(header, REJECTION_SLUGS) || matchesAny(header, REWORK_SLUGS)) return "rejectionCode";
  if (matchesAny(header, PURPOSE_SLUGS))   return "process";
  const filled = sampleValues.filter(Boolean);
  if (filled.length > 0) {
    const numericCount = filled.filter((v) => !isNaN(parseFloat(v.replace(/,/g, "")))).length;
    if (numericCount / filled.length > 0.75) return "number";
  }
  return "text";
}

function canonicalForHeader(h: string): keyof ColumnMap | null {
  if (matchesAny(h, PART_SLUGS))      return "partNumber";
  if (matchesAny(h, REJECTION_SLUGS)) return "rejectionCode";
  if (matchesAny(h, REWORK_SLUGS))    return "reworkCode";
  if (matchesAny(h, DESC_SLUGS))      return "description";
  if (matchesAny(h, QTY_SLUGS))       return "quantity";
  if (matchesAny(h, PURPOSE_SLUGS))   return "process";
  if (matchesAny(h, DATE_SLUGS))      return "date";
  if (matchesAny(h, RATE_SLUGS))      return "rate";
  if (matchesAny(h, AMOUNT_SLUGS))    return "amount";
  if (matchesAny(h, REMARKS_SLUGS))   return "remarks";
  return null;
}

// ─── Header detection ─────────────────────────────────────────────────────────

function scoreHeaderRow(row: any[]): number {
  return row.reduce((total, cell) => total + scoreCell(String(cell ?? "")), 0);
}

function findHeaderRowIndex(rawRows: any[][], maxScan = 15): number {
  let bestScore = -1;
  let bestIdx = 0;
  for (let i = 0; i < Math.min(maxScan, rawRows.length); i++) {
    const row = rawRows[i] as any[];
    if (!Array.isArray(row)) continue;
    const nonEmpty = row.filter((c) => c !== undefined && c !== null && String(c).trim() !== "");
    if (nonEmpty.length < 2) continue;
    const score = scoreHeaderRow(row);
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  }
  return bestIdx;
}

// ─── Column map & confidence ──────────────────────────────────────────────────

function buildColumnMap(headers: string[]): ColumnMap {
  return {
    partNumber:    findHeader(headers, PART_SLUGS),
    rejectionCode: findHeader(headers, REJECTION_SLUGS) ?? findHeader(headers, CODE_SLUGS),
    reworkCode:    findHeader(headers, REWORK_SLUGS),
    description:   findHeader(headers, DESC_SLUGS),
    quantity:      findHeader(headers, QTY_SLUGS),
    process:       findHeader(headers, PURPOSE_SLUGS),
    date:          findHeader(headers, DATE_SLUGS),
    rate:          findHeader(headers, RATE_SLUGS),
    amount:        findHeader(headers, AMOUNT_SLUGS),
    remarks:       findHeader(headers, REMARKS_SLUGS),
  };
}

function buildColumnMeta(headers: string[], rows: Row[]): ColumnMeta[] {
  return headers.map((h) => {
    const samples = rows.slice(0, 20).map((r) => r[h] ?? "");
    return {
      original: h,
      canonical: canonicalForHeader(h),
      fieldType: inferFieldType(h, samples),
    };
  });
}

function computeConfidence(cm: ColumnMap, type: ImportSection["type"]): number {
  if (type === "parts") {
    return [cm.partNumber, cm.description].filter(Boolean).length / 2;
  }
  if (type === "entries") {
    const score = [cm.date, cm.quantity, cm.partNumber ?? cm.rejectionCode].filter(Boolean).length;
    return Math.min(score / 3, 1);
  }
  if (type === "rejection-reasons") {
    return [cm.partNumber || cm.rejectionCode, cm.rejectionCode].filter(Boolean).length / 2;
  }
  if (type === "rework-types") return cm.reworkCode ? 1 : 0;
  return Math.min(Object.values(cm).filter(Boolean).length / 3, 1);
}

// ─── Type detection ───────────────────────────────────────────────────────────

function detectType(headers: string[]): ImportSection["type"] {
  const hasPart      = headers.some((h) => matchesAny(h, PART_SLUGS));
  const hasRework    = headers.some((h) => matchesAny(h, REWORK_SLUGS));
  const hasRejection = headers.some((h) => matchesAny(h, REJECTION_SLUGS));
  const hasCode      = headers.some((h) => matchesAny(h, CODE_SLUGS));
  const hasDesc      = headers.some((h) => matchesAny(h, DESC_SLUGS));
  const hasPurpose   = headers.some((h) => matchesAny(h, PURPOSE_SLUGS));
  const hasQty       = headers.some((h) => matchesAny(h, QTY_SLUGS));
  const hasDate      = headers.some((h) => matchesAny(h, DATE_SLUGS));

  // Transactional sheet: has date + qty → these are log entries to save to the DB
  if (hasDate && hasQty) return "entries";
  if (hasPart && hasQty) return "entries";

  if (hasRework && !hasDate) return "rework-types";
  if (hasRejection && !hasDate) return "rejection-reasons";
  if (hasPart && hasDesc && !hasCode && !hasQty) return "parts";
  if (hasPart && !hasCode && !hasQty) return "parts";
  if (hasPart && hasDesc && hasCode && !hasQty) return "parts";
  if (hasCode && (hasPurpose || hasDesc)) return "rejection-reasons";
  if (hasCode && !hasPart && !hasQty) return "rejection-reasons";
  if (hasCode) return "rejection-reasons";
  return "unknown";
}

// ─── Sheet quality check ──────────────────────────────────────────────────────

function checkDataSheet(headers: string[], dataRows: Row[]): { ok: boolean; reason: string } {
  if (headers.length < 1) return { ok: false, reason: "No columns detected" };
  if (dataRows.length < 1) return { ok: false, reason: "No data rows found after the header row" };
  const known = headers.filter((h) =>
    matchesAny(h, PART_SLUGS) || matchesAny(h, REJECTION_SLUGS) || matchesAny(h, REWORK_SLUGS) ||
    matchesAny(h, CODE_SLUGS) || matchesAny(h, DESC_SLUGS) || matchesAny(h, QTY_SLUGS) ||
    matchesAny(h, DATE_SLUGS) || matchesAny(h, PURPOSE_SLUGS) ||
    matchesAny(h, RATE_SLUGS) || matchesAny(h, AMOUNT_SLUGS)
  );
  if (known.length === 0) return { ok: false, reason: "No recognizable column headers found — may be a summary or form sheet" };
  return { ok: true, reason: "" };
}

/**
 * Last-resort recovery for sheets whose headers don't match any known slug set.
 * Uses the sheet NAME as a type hint and scans raw cell values to find the
 * actual data column, then synthesises a minimal section.
 */
function tryContentRecovery(sheetName: string, rawRows: any[][]): ImportSection | null {
  // Infer intended type from the sheet name
  const sn = sheetName.toLowerCase().replace(/[^a-z]/g, "");
  let syntheticHeader = "";
  if (/item|part|product|material|component/.test(sn))  syntheticHeader = "Item Name";
  else if (/reject|defect|failure|ncr/.test(sn))        syntheticHeader = "Rejection Code";
  else if (/rework|rw/.test(sn))                        syntheticHeader = "Rework Code";
  else return null; // can't determine type — give up

  // Treat EVERY non-empty row (including the "header" row) as candidate data
  const allRows = rawRows
    .filter((r) => Array.isArray(r) && r.some((c) => c !== undefined && c !== null && String(c).trim() !== ""))
    .map((r) => {
      const obj: Row = {};
      (r as any[]).forEach((cell, idx) => { obj[`_c${idx}`] = cell !== undefined && cell !== null ? String(cell).trim() : ""; });
      return obj;
    });
  if (allRows.length === 0) return null;

  const allColKeys = Object.keys(allRows[0]);
  // For parts use the text-dominant column; for codes use ANY column with text values
  const bestTextCol = findBestTextColumn(allColKeys, allRows);
  if (!bestTextCol) return null;

  // Optional: adjacent numeric column as rate/price
  const bestNumCol = findBestNumericColumn(allColKeys, allRows, [bestTextCol]);
  const recoveredHeaders = bestNumCol ? [syntheticHeader, "Rate"] : [syntheticHeader];

  const recoveredRows = allRows
    .map((r) => {
      const obj: Row = {};
      obj[syntheticHeader] = r[bestTextCol] ?? "";
      if (bestNumCol) obj["Rate"] = r[bestNumCol] ?? "";
      return obj;
    })
    .filter((r) => {
      const v = r[syntheticHeader]?.trim() ?? "";
      return v && !isSummaryRow(v) && isPartNameLike(v);
    });

  if (recoveredRows.length === 0) return null;
  return buildSection(sheetName, recoveredHeaders, recoveredRows, 0);
}

// ─── Parts-specific column helpers ───────────────────────────────────────────

/** True if the string contains at least one letter (i.e. is not a pure number/blank). */
function isPartNameLike(v: string): boolean {
  return /[a-zA-Z]/.test(v.trim());
}

/** True for common Excel summary/pivot footer rows that should never become part names. */
function isSummaryRow(v: string): boolean {
  return /^(sum[\s(]|grand\s*total|sub[\s-]?total|total\b|average|count|minimum|maximum)/i.test(v.trim());
}

/**
 * Among the provided headers, return the one whose data values are most
 * "text-like" (contain letters, spaces, brackets, hyphens).
 * Used to auto-detect the real part-name column when header matching fails
 * or when the header-matched column turns out to be numeric.
 */
function findBestTextColumn(headers: string[], rows: Row[]): string | null {
  let bestHeader: string | null = null;
  let bestScore = -1;
  for (const h of headers) {
    const samples = rows.slice(0, 40).map((r) => (r[h] ?? "").trim()).filter(Boolean);
    if (samples.length === 0) continue;
    const textCount = samples.filter((v) => isPartNameLike(v) && !isSummaryRow(v)).length;
    const textRatio = textCount / samples.length;
    const avgLen = samples.reduce((s, v) => s + v.length, 0) / samples.length;
    // Prefer high text-ratio AND longer average values (short codes score lower)
    const score = textRatio * Math.log1p(avgLen);
    if (score > bestScore) { bestScore = score; bestHeader = h; }
  }
  return bestScore > 0.3 ? bestHeader : null;
}

/**
 * Find the first column (not in excludeHeaders) whose sampled values
 * are predominantly numeric — used to find the price/rate column for parts.
 */
function findBestNumericColumn(headers: string[], rows: Row[], excludeHeaders: (string | null | undefined)[]): string | null {
  const excl = new Set(excludeHeaders.filter(Boolean) as string[]);
  for (const h of headers) {
    if (excl.has(h)) continue;
    const samples = rows.slice(0, 20).map((r) => (r[h] ?? "").trim()).filter(Boolean);
    if (samples.length === 0) continue;
    const numCount = samples.filter((v) => !isNaN(parseFloat(v.replace(/,/g, "")))).length;
    if (numCount / samples.length > 0.7) return h;
  }
  return null;
}

// ─── Code vs Reason split / Date normalizer / Row model ──────────────────────

function splitCodeAndReason(raw: string): { code: string; reason: string } {
  const trimmed = raw.trim();
  // Pattern 1: "CODE - Reason text" or "CODE: Reason text" (code separated by dash/colon)
  const sepMatch = trimmed.match(/^([A-Z0-9][A-Z0-9\-_.]{0,19})\s*[-:]\s*(.+)$/i);
  if (sepMatch) return { code: sepMatch[1].trim().toUpperCase(), reason: sepMatch[2].trim() };
  // Pattern 2: short alphanumeric code (≤20 chars, ≤3 words, no sentence punctuation)
  const words = trimmed.split(/\s+/).filter(Boolean);
  const looksLikeCode = trimmed.length <= 20 && words.length <= 3 && !/[,;.]/.test(trimmed);
  if (looksLikeCode) return { code: trimmed.toUpperCase(), reason: trimmed };
  // Pattern 3: it's descriptive text — auto-generate initialism code
  const autoCode = words.slice(0, 4).map((w) => w[0].toUpperCase()).join("");
  return { code: autoCode || "UNK", reason: trimmed };
}

// ─── Date normalizer ──────────────────────────────────────────────────────────

function normalizeDate(raw: string | null): string | null {
  if (!raw) return null;
  // "2024-01-15 00:00" / "2024-01-15T00:00:00" → "2024-01-15"
  const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  // "15/01/2024" or "15-01-2024" (DD/MM/YYYY)
  const dmyMatch = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // "01/15/2024" (MM/DD/YYYY) — if month > 12 it must be day first
  return raw.split("T")[0].split(" ")[0] || null;
}

let _rowCounter = 0;
function normalizeToModel(row: Row, cm: ColumnMap, sourceSheet: string): NormalizedRow {
  const get = (col: string | null) => (col && row[col]) ? row[col].trim() : null;
  const getNum = (col: string | null) => {
    const v = get(col);
    if (!v) return null;
    const n = parseFloat(v.replace(/,/g, ""));
    return isNaN(n) ? null : n;
  };
  const rawDate = get(cm.date);
  let qty = getNum(cm.quantity);
  let rate = getNum(cm.rate);
  let amount = getNum(cm.amount);
  // Compute missing financial field from the other two
  if (qty && rate && !amount) amount = Math.round(qty * rate * 100) / 100;
  if (qty && amount && !rate) rate = Math.round((amount / qty) * 100) / 100;
  return {
    id: `row-${++_rowCounter}`,
    date: normalizeDate(rawDate),
    partNumber: get(cm.partNumber),
    rejectionCode: get(cm.rejectionCode) ?? get(cm.reworkCode),
    quantity: qty,
    process: get(cm.process),
    rate,
    amount,
    sourceSheet,
    _raw: row,
  };
}

// ─── Section builder ──────────────────────────────────────────────────────────

function buildSection(sheetName: string, headers: string[], dataRows: Row[], headerRowIndex: number): ImportSection {
  const type = detectType(headers);
  const columnMap = buildColumnMap(headers);
  const columnMeta = buildColumnMeta(headers, dataRows);
  const confidence = computeConfidence(columnMap, type);
  return { sheet: sheetName, type, rows: dataRows, allHeaders: headers, columnMap, columnMeta, confidence, headerRowIndex };
}

// ─── Parser ───────────────────────────────────────────────────────────────────

async function parseFileToSections(file: File): Promise<ParseResult> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  const sections: ImportSection[] = [];
  const skipped: SkippedSheet[] = [];

  if (ext === "xlsx" || ext === "xls" || ext === "xlsm") {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });

    for (const sheetName of workbook.SheetNames) {
      try {
        const sheet = workbook.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, raw: false, dateNF: "yyyy-mm-dd hh:mm" });

        if (rawRows.length < 2) {
          skipped.push({ name: sheetName, reason: "Sheet has fewer than 2 rows" });
          continue;
        }

        const headerIdx = findHeaderRowIndex(rawRows);
        const rawHeaders = rawRows[headerIdx] as any[];
        const headers = rawHeaders.map((h) => String(h ?? "").trim()).filter(Boolean);

        const dataRaw = (rawRows.slice(headerIdx + 1) as any[][])
          .filter((r) => Array.isArray(r) && r.some((c) => c !== undefined && c !== null && String(c).trim() !== ""));
        const rows = dataRaw.map((r) => {
          const obj: Row = {};
          headers.forEach((h, i) => { obj[h] = r[i] !== undefined && r[i] !== null ? String(r[i]).trim() : ""; });
          return obj;
        });

        const quality = checkDataSheet(headers, rows);
        if (!quality.ok) {
          // Try content-based recovery using the sheet name as a type hint
          const recovered = tryContentRecovery(sheetName, rawRows);
          if (recovered) {
            sections.push(recovered);
          } else {
            skipped.push({ name: sheetName, reason: quality.reason });
          }
          continue;
        }

        sections.push(buildSection(sheetName, headers, rows, headerIdx));
      } catch (err) {
        skipped.push({ name: sheetName, reason: "Failed to parse — sheet may be malformed" });
      }
    }

    sections.sort((a, b) => {
      const order = { parts: 0, "rejection-reasons": 1, "rework-types": 2, entries: 3, unknown: 4 };
      return order[a.type] - order[b.type];
    });
  } else {
    const text = await file.text();
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return { sections, skipped };

    const candidates = lines.slice(0, 15).map((l) => l.split(",").map((h) => h.replace(/^"|"$/g, "").trim()));
    const headerIdx = candidates.reduce((best, row, i) =>
      scoreHeaderRow(row) > scoreHeaderRow(candidates[best]) ? i : best, 0);

    const headers = candidates[headerIdx];
    const rows: Row[] = lines.slice(headerIdx + 1).map((line) => {
      const values = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g) ?? line.split(",");
      const obj: Row = {};
      headers.forEach((h, i) => { obj[h] = (values[i] ?? "").replace(/^"|"$/g, "").trim(); });
      return obj;
    }).filter((r) => Object.values(r).some((v) => v !== ""));

    const quality = checkDataSheet(headers, rows);
    if (quality.ok) {
      sections.push(buildSection(file.name, headers, rows, headerIdx));
    } else {
      skipped.push({ name: file.name, reason: quality.reason });
    }
  }

  return { sections, skipped };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CANONICAL_FIELDS: { key: keyof ColumnMap; label: string }[] = [
  { key: "partNumber",    label: "Part Number" },
  { key: "rejectionCode", label: "Rejection / Rework Code" },
  { key: "reworkCode",    label: "Rework Code" },
  { key: "description",   label: "Description / Name" },
  { key: "quantity",      label: "Quantity" },
  { key: "process",       label: "Process / Purpose" },
  { key: "date",          label: "Date" },
  { key: "rate",          label: "Rate / Price" },
  { key: "amount",        label: "Amount / Value" },
  { key: "remarks",       label: "Remarks / Notes" },
];

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  date: "Date", number: "Number", currency: "Currency", quantity: "Qty",
  partNumber: "Part #", rejectionCode: "Rej. Code", process: "Process", text: "Text",
};

// ─── UI helpers ───────────────────────────────────────────────────────────────

function typeBadge(type: ImportSection["type"]) {
  const map = {
    "parts":             { label: "Parts",             className: "bg-primary/10 text-primary border-primary/20" },
    "rejection-reasons": { label: "Rejection Reasons", className: "bg-destructive/10 text-destructive border-destructive/20" },
    "rework-types":      { label: "Rework Types",      className: "bg-blue-500/10 text-blue-600 border-blue-400/30" },
    "entries":           { label: "Log Entries",       className: "bg-green-500/10 text-green-700 border-green-400/30" },
    "unknown":           { label: "Unknown",            className: "bg-muted text-muted-foreground border-border" },
  };
  const { label, className } = map[type];
  return <Badge variant="outline" className={className}>{label}</Badge>;
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  if (confidence >= 0.75) return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-400/30 text-xs">High confidence</Badge>;
  if (confidence >= 0.4)  return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-400/30 text-xs">Partial match</Badge>;
  return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-xs">Low confidence</Badge>;
}

function FieldTypePill({ type }: { type: FieldType }) {
  const colours: Record<FieldType, string> = {
    date: "bg-violet-500/10 text-violet-600",
    number: "bg-blue-500/10 text-blue-600",
    currency: "bg-emerald-500/10 text-emerald-600",
    quantity: "bg-orange-500/10 text-orange-600",
    partNumber: "bg-primary/10 text-primary",
    rejectionCode: "bg-destructive/10 text-destructive",
    process: "bg-sky-500/10 text-sky-600",
    text: "bg-muted text-muted-foreground",
  };
  return <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${colours[type]}`}>{FIELD_TYPE_LABELS[type]}</span>;
}

// ─── Column mapping editor ────────────────────────────────────────────────────

function ColumnMappingEditor({
  section,
  onApply,
  onCancel,
}: {
  section: ImportSection;
  onApply: (cm: ColumnMap) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<ColumnMap>({ ...section.columnMap });
  const headers = ["(none)", ...section.allHeaders];
  const set = (field: keyof ColumnMap, val: string) =>
    setDraft((prev) => ({ ...prev, [field]: val === "(none)" ? null : val }));

  return (
    <div className="space-y-4 pt-2">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-0.5 text-xs mb-2">
        <div className="font-medium text-muted-foreground pb-1 border-b border-border col-span-1">Your column</div>
        <div className="font-medium text-muted-foreground pb-1 border-b border-border col-span-1 sm:col-span-2">Maps to standard field</div>
        {section.allHeaders.map((h) => {
          const meta = section.columnMeta.find((m) => m.original === h);
          return (
            <div key={h} className="col-span-2 sm:col-span-3 grid grid-cols-2 sm:grid-cols-3 items-center gap-2 py-1 border-b border-border/40">
              <div className="flex items-center gap-1.5 truncate">
                {meta && <FieldTypePill type={meta.fieldType} />}
                <span className="font-mono text-foreground truncate">{h}</span>
              </div>
              <Select
                value={Object.entries(draft).find(([, v]) => v === h)?.[0] ?? "(none)"}
                onValueChange={(field) => {
                  const newDraft = { ...draft };
                  (Object.keys(newDraft) as (keyof ColumnMap)[]).forEach((k) => { if (newDraft[k] === h) newDraft[k] = null; });
                  if (field !== "(none)") newDraft[field as keyof ColumnMap] = h;
                  setDraft(newDraft);
                }}
              >
                <SelectTrigger className="h-7 text-xs sm:col-span-2" data-testid={`select-map-${slug(h)}`}>
                  <SelectValue placeholder="(skip)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="(none)" className="text-xs">(skip)</SelectItem>
                  {CANONICAL_FIELDS.map(({ key, label }) => (
                    <SelectItem key={key} value={key} className="text-xs">{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={() => onApply(draft)} data-testid="button-apply-mapping">Apply Mapping</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

// ─── Normalized data table ────────────────────────────────────────────────────

type BucketSortKey = "date" | "rejectionCode" | "quantity" | "amount" | "process";

const NORM_COLS: { key: SortKey; label: string }[] = [
  { key: "date",          label: "Date" },
  { key: "partNumber",    label: "Part Number" },
  { key: "rejectionCode", label: "Rej. / Rework Code" },
  { key: "quantity",      label: "Qty" },
  { key: "process",       label: "Process" },
  { key: "rate",          label: "Rate" },
  { key: "amount",        label: "Amount" },
  { key: "sourceSheet",   label: "Sheet" },
];

const BUCKET_SORT_OPTIONS: { key: BucketSortKey; label: string }[] = [
  { key: "date",          label: "Date" },
  { key: "rejectionCode", label: "Rejection Code" },
  { key: "quantity",      label: "Quantity" },
  { key: "amount",        label: "Amount" },
  { key: "process",       label: "Process" },
];

function sortRows(rows: NormalizedRow[], key: BucketSortKey | SortKey, dir: "asc" | "desc"): NormalizedRow[] {
  return [...rows].sort((a, b) => {
    const av = a[key as keyof NormalizedRow];
    const bv = b[key as keyof NormalizedRow];
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    const cmp = typeof av === "number" && typeof bv === "number"
      ? av - bv
      : String(av).localeCompare(String(bv));
    return dir === "asc" ? cmp : -cmp;
  });
}

function DatasetSummary({ rows }: { rows: NormalizedRow[] }) {
  const stats = useMemo(() => {
    const dates = rows.map((r) => r.date).filter(Boolean) as string[];
    const parts = new Set(rows.map((r) => normalizeItemKey(r.partNumber)));
    const codes = new Set(rows.map((r) => r.rejectionCode).filter(Boolean));
    const totalQty = rows.reduce((s, r) => s + (r.quantity ?? 0), 0);
    const sortedDates = [...dates].sort();
    return {
      earliest: sortedDates[0] ?? null,
      latest: sortedDates[sortedDates.length - 1] ?? null,
      distinctItems: parts.size,
      distinctCodes: codes.size,
      totalQty,
    };
  }, [rows]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
      {[
        { label: "Total rows",   value: rows.length },
        { label: "Distinct items", value: stats.distinctItems },
        { label: "Rejection codes", value: stats.distinctCodes },
        { label: "Total qty rejected", value: stats.totalQty.toLocaleString() },
        { label: "Date range", value: stats.earliest ? `${stats.earliest} → ${stats.latest}` : "—" },
      ].map(({ label, value }) => (
        <div key={label} className="bg-muted/40 border border-border rounded-lg px-3 py-2">
          <div className="text-muted-foreground">{label}</div>
          <div className="font-semibold text-foreground mt-0.5 tabular-nums">{value}</div>
        </div>
      ))}
    </div>
  );
}

function ItemBucket({ itemKey, displayLabel, rows }: {
  itemKey: string;
  displayLabel: string;
  rows: NormalizedRow[];
}) {
  const [open, setOpen] = useState(false);
  const [sortKey, setSortKey] = useState<BucketSortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const sorted = useMemo(() => sortRows(rows, sortKey, sortDir), [rows, sortKey, sortDir]);
  const totalQty = rows.reduce((s, r) => s + (r.quantity ?? 0), 0);
  const totalAmt = rows.reduce((s, r) => s + (r.amount ?? 0), 0);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/40 hover:bg-muted/60 text-left"
        onClick={() => setOpen((v) => !v)}
        data-testid={`bucket-${itemKey}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {open ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
          <span className="font-medium text-sm text-foreground truncate">{displayLabel}</span>
          {itemKey === "(no part)" && <Badge variant="outline" className="text-[10px] px-1.5 py-0">unmapped</Badge>}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0 ml-2">
          <span>{rows.length} row{rows.length !== 1 ? "s" : ""}</span>
          {totalQty > 0 && <span>qty {totalQty.toLocaleString()}</span>}
          {totalAmt > 0 && <span>amt {totalAmt.toLocaleString()}</span>}
        </div>
      </button>

      {open && (
        <div className="p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Sort by</span>
            <Select value={sortKey} onValueChange={(v) => setSortKey(v as BucketSortKey)}>
              <SelectTrigger className="h-7 w-36 text-xs" data-testid={`bucket-sort-${itemKey}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUCKET_SORT_OPTIONS.map(({ key, label }) => (
                  <SelectItem key={key} value={key} className="text-xs">{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              data-testid={`bucket-sort-dir-${itemKey}`}
            >
              {sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
            </Button>
            <span className="text-xs text-muted-foreground ml-auto">{rows.length} rows</span>
          </div>
          <div className="overflow-x-auto rounded border border-border">
            <table className="text-xs w-full">
              <thead>
                <tr className="bg-muted/50">
                  <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Date</th>
                  <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Rejection Code</th>
                  <th className="px-3 py-1.5 text-right font-medium text-muted-foreground">Qty</th>
                  <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Process</th>
                  <th className="px-3 py-1.5 text-right font-medium text-muted-foreground">Rate</th>
                  <th className="px-3 py-1.5 text-right font-medium text-muted-foreground">Amount</th>
                  <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Sheet</th>
                </tr>
              </thead>
              <tbody>
                {sorted.slice(0, 50).map((row) => (
                  <tr key={row.id} className="border-t border-border hover:bg-muted/20">
                    <td className="px-3 py-1 whitespace-nowrap">{row.date ?? <span className="opacity-30">—</span>}</td>
                    <td className="px-3 py-1 max-w-[160px] truncate">{row.rejectionCode ?? <span className="opacity-30">—</span>}</td>
                    <td className="px-3 py-1 text-right tabular-nums">{row.quantity ?? <span className="opacity-30">—</span>}</td>
                    <td className="px-3 py-1 max-w-[110px] truncate">{row.process ?? <span className="opacity-30">—</span>}</td>
                    <td className="px-3 py-1 text-right tabular-nums">{row.rate ?? <span className="opacity-30">—</span>}</td>
                    <td className="px-3 py-1 text-right tabular-nums">{row.amount ?? <span className="opacity-30">—</span>}</td>
                    <td className="px-3 py-1 text-muted-foreground whitespace-nowrap">{row.sourceSheet}</td>
                  </tr>
                ))}
                {sorted.length > 50 && (
                  <tr className="border-t border-border">
                    <td colSpan={7} className="px-3 py-2 text-center text-muted-foreground italic text-xs">
                      …{sorted.length - 50} more rows
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function NormalizedDataTable({ rows }: { rows: NormalizedRow[] }) {
  const [view, setView] = useState<"flat" | "grouped">("grouped");
  const [sortKey, setSortKey] = useState<SortKey>("partNumber");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const f = filter.toLowerCase();
    return f
      ? rows.filter((r) =>
          [r.date, r.partNumber, r.rejectionCode, r.process, r.sourceSheet]
            .some((v) => v?.toLowerCase().includes(f))
        )
      : rows;
  }, [rows, filter]);

  const sorted = useMemo(() => sortRows(filtered, sortKey, sortDir), [filtered, sortKey, sortDir]);

  const buckets = useMemo(() => {
    const map = new Map<string, NormalizedRow[]>();
    for (const row of filtered) {
      const k = normalizeItemKey(row.partNumber);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(row);
    }
    return [...map.entries()]
      .map(([key, bRows]) => ({
        key,
        displayLabel: bestDisplayLabel(bRows.map((r) => r.partNumber)),
        rows: bRows,
      }))
      .sort((a, b) => {
        if (a.key === "(no part)") return 1;
        if (b.key === "(no part)") return -1;
        return a.key.localeCompare(b.key);
      });
  }, [filtered]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
  };

  return (
    <div className="space-y-4">
      <DatasetSummary rows={rows} />

      <div className="flex items-center gap-2 flex-wrap">
        <Input
          placeholder="Filter rows…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-8 text-xs w-48"
          data-testid="input-norm-filter"
        />
        <div className="flex rounded border border-border overflow-hidden text-xs">
          <button
            className={`px-3 py-1.5 ${view === "grouped" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
            onClick={() => setView("grouped")}
            data-testid="button-view-grouped"
          >
            Grouped by part
          </button>
          <button
            className={`px-3 py-1.5 border-l border-border ${view === "flat" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
            onClick={() => setView("flat")}
            data-testid="button-view-flat"
          >
            Flat list
          </button>
        </div>
        <span className="text-xs text-muted-foreground ml-auto">
          {view === "grouped" ? `${buckets.length} items, ` : ""}{filtered.length} rows
        </span>
      </div>

      {view === "grouped" ? (
        <div className="space-y-2">
          {buckets.length === 0 && (
            <p className="text-sm text-muted-foreground italic text-center py-6">No rows match the filter</p>
          )}
          {buckets.map((b) => (
            <ItemBucket key={b.key} itemKey={b.key} displayLabel={b.displayLabel} rows={b.rows} />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-border">
          <table className="text-xs w-full">
            <thead>
              <tr className="bg-muted/60">
                {NORM_COLS.map(({ key, label }) => (
                  <th
                    key={key}
                    className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap cursor-pointer hover:text-foreground select-none"
                    onClick={() => toggleSort(key)}
                    data-testid={`th-${key}`}
                  >
                    <span className="flex items-center gap-1">{label} <SortIcon k={key} /></span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 100).map((row) => (
                <tr key={row.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-1.5 whitespace-nowrap">{row.date ?? <span className="text-muted-foreground/40">—</span>}</td>
                  <td className="px-3 py-1.5 max-w-[180px] truncate font-mono">{row.partNumber ?? <span className="text-muted-foreground/40">—</span>}</td>
                  <td className="px-3 py-1.5 max-w-[160px] truncate">{row.rejectionCode ?? <span className="text-muted-foreground/40">—</span>}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{row.quantity ?? <span className="text-muted-foreground/40">—</span>}</td>
                  <td className="px-3 py-1.5 max-w-[120px] truncate">{row.process ?? <span className="text-muted-foreground/40">—</span>}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{row.rate ?? <span className="text-muted-foreground/40">—</span>}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{row.amount ?? <span className="text-muted-foreground/40">—</span>}</td>
                  <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">{row.sourceSheet}</td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={NORM_COLS.length} className="px-3 py-6 text-center text-muted-foreground italic">No rows match the filter</td>
                </tr>
              )}
              {sorted.length > 100 && (
                <tr className="border-t border-border">
                  <td colSpan={NORM_COLS.length} className="px-3 py-2 text-center text-muted-foreground italic">
                    Showing first 100 of {sorted.length} rows
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ImportData() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sections, setSections] = useState<ImportSection[]>([]);
  const [skippedSheets, setSkippedSheets] = useState<SkippedSheet[]>([]);
  const [normalizedDataset, setNormalizedDataset] = useState<NormalizedRow[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [importing, setImporting] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());
  const [mappingSection, setMappingSection] = useState<number | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [gsheetUrl, setGsheetUrl] = useState("");
  const [gsheetLoading, setGsheetLoading] = useState(false);
  const [showNormalized, setShowNormalized] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: existingParts } = useParts();
  const { data: existingRejTypes } = useRejectionTypes();
  const { data: existingReworkTypes } = useReworkTypes();

  const createPart = useCreatePart();
  const createRejType = useCreateRejectionType();
  const createReworkType = useCreateReworkType();
  const createEntry = useCreateRejectionEntry();

  const buildNormalizedDataset = (sects: ImportSection[]) => {
    _rowCounter = 0;
    return sects.flatMap((s) => s.rows.map((r) => normalizeToModel(r, s.columnMap, s.sheet)));
  };

  const processFile = async (file: File) => {
    setFileName(file.name);
    setSections([]);
    setSkippedSheets([]);
    setNormalizedDataset([]);
    setResults([]);
    setMappingSection(null);
    setShowNormalized(false);
    setParsing(true);
    try {
      const { sections: parsed, skipped } = await parseFileToSections(file);
      setSections(parsed);
      setSkippedSheets(skipped);
      setNormalizedDataset(buildNormalizedDataset(parsed));
      if (!parsed.length) {
        toast({ title: "No importable data found", description: skipped.length ? `${skipped.length} sheet(s) were skipped — see details below.` : "The file appears to be empty or unreadable.", variant: "destructive" });
      } else {
        const lowConf = parsed.findIndex((s) => s.confidence < 0.4 || s.type === "unknown");
        if (lowConf !== -1) {
          setMappingSection(lowConf);
          setExpandedSections(new Set([lowConf]));
        }
      }
    } catch {
      toast({ title: "Parse error", description: "Could not read the file.", variant: "destructive" });
    }
    setParsing(false);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = "";
    processFile(file);
  };

  const handleGSheetImport = async () => {
    if (!gsheetUrl.trim()) return;
    setGsheetLoading(true);
    try {
      const res = await fetch(`/api/fetch-gsheet?url=${encodeURIComponent(gsheetUrl)}`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) { toast({ title: "Error", description: data.message, variant: "destructive" }); return; }
      const blob = new Blob([data.csv], { type: "text/csv" });
      const file = new File([blob], "google-sheet.csv", { type: "text/csv" });
      setGsheetUrl("");
      await processFile(file);
    } catch {
      toast({ title: "Error", description: "Failed to fetch Google Sheet.", variant: "destructive" });
    } finally {
      setGsheetLoading(false);
    }
  };

  const applyManualMapping = (idx: number, cm: ColumnMap) => {
    setSections((prev) => {
      const updated = prev.map((s, i) => {
        if (i !== idx) return s;
        return { ...s, columnMap: cm, confidence: computeConfidence(cm, s.type) };
      });
      setNormalizedDataset(buildNormalizedDataset(updated));
      return updated;
    });
    setMappingSection(null);
  };

  const toggleSection = (i: number) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const runImport = async () => {
    if (!sections.length) return;
    setImporting(true);
    const allResults: ImportResult[] = [];

    // Build mutable local caches so newly created records are findable within the same import
    const localParts = [...(existingParts ?? [])];
    const localRejTypes = [...(existingRejTypes ?? [])];
    const localReworkTypes = [...(existingReworkTypes ?? [])];

    // Helper: find or create a part; returns the part record or null on failure
    const findOrCreatePart = async (partNumber: string, description?: string | null): Promise<(typeof localParts)[0] | null> => {
      const norm = normalizeItemKey(partNumber);
      const existing = localParts.find((p) => normalizeItemKey(p.partNumber) === norm);
      if (existing) return existing;
      try {
        const created = await new Promise<(typeof localParts)[0]>((res, rej) => {
          createPart.mutate(
            { partNumber, description: description || partNumber, price: 0 },
            { onSuccess: (p) => res(p), onError: rej }
          );
        });
        localParts.push(created);
        return created;
      } catch { return null; }
    };

    // Helper: find or create a rejection type; handles code vs reason smartly
    const findOrCreateRejType = async (rawValue: string, purpose: "rejection" | "rework" = "rejection"): Promise<(typeof localRejTypes)[0] | null> => {
      const { code, reason } = splitCodeAndReason(rawValue);
      const existing = localRejTypes.find(
        (t) => t.rejectionCode.toLowerCase() === code.toLowerCase() || t.reason.toLowerCase() === reason.toLowerCase()
      );
      if (existing) return existing;
      try {
        const created = await new Promise<(typeof localRejTypes)[0]>((res, rej) => {
          createRejType.mutate(
            { rejectionCode: code, reason: reason || code, type: purpose },
            { onSuccess: (t) => res(t), onError: rej }
          );
        });
        localRejTypes.push(created);
        return created;
      } catch { return null; }
    };

    for (const section of sections) {
      const result: ImportResult = { section, added: 0, skipped: 0, errors: [] };
      const cm = section.columnMap;

      if (section.type === "parts") {
        // ── Step 1: resolve the part-name column ─────────────────────────────
        // Start with the header-matched column, but validate it is text-dominant.
        // If it is mostly numeric (e.g. a "Part No." serial-number column), discard it
        // and fall back to whichever column actually contains text-like values.
        let partNameCol: string | null = cm.partNumber;
        if (partNameCol) {
          const sampleVals = section.rows.slice(0, 40).map((r) => (r[partNameCol!] ?? "").trim()).filter(Boolean);
          const textCount = sampleVals.filter((v) => isPartNameLike(v)).length;
          if (sampleVals.length > 0 && textCount / sampleVals.length < 0.5) {
            partNameCol = null; // column is predominantly numeric — look harder
          }
        }
        if (!partNameCol) {
          partNameCol = findBestTextColumn(section.allHeaders, section.rows);
        }

        // ── Step 2: resolve the price column ─────────────────────────────────
        // Use the explicitly-mapped rate/amount column first; otherwise pick the
        // first numeric column that is not the part-name or quantity column.
        const priceCol: string | null =
          cm.rate ??
          cm.amount ??
          findBestNumericColumn(section.allHeaders, section.rows, [partNameCol, cm.quantity, cm.date]);

        // ── Step 3: import each row ───────────────────────────────────────────
        for (const row of section.rows) {
          // Read the part name from the best-detected text column
          const rawName = (partNameCol ? row[partNameCol]?.trim() : "") || "";

          // Fallback: try description column if part-name col gave nothing
          const rawDesc = (cm.description && cm.description !== partNameCol)
            ? (row[cm.description]?.trim() ?? "")
            : "";

          const partNumber = rawName || rawDesc;

          // Skip empty values
          if (!partNumber) { result.skipped++; continue; }
          // Skip summary/pivot footer rows ("Sum of Quantity Rejected", "Grand Total", etc.)
          if (isSummaryRow(partNumber)) { result.skipped++; continue; }
          // Skip purely-numeric values (serial numbers, quantities) — not real part names
          if (!isPartNameLike(partNumber)) { result.skipped++; continue; }

          // Read price from detected numeric column
          const rawPrice = priceCol ? (row[priceCol]?.trim() ?? "") : "";
          const price = parseFloat(rawPrice.replace(/,/g, "")) || 0;

          // Description: prefer separate description column if it differs from the name column
          const description = rawDesc || rawName;

          // Skip duplicates already in this org
          if (localParts.some((p) => p.partNumber.toLowerCase() === partNumber.toLowerCase())) { result.skipped++; continue; }

          try {
            const created = await new Promise<(typeof localParts)[0]>((res, rej) => {
              createPart.mutate({ partNumber, description: description || partNumber, price }, { onSuccess: (p) => res(p), onError: rej });
            });
            localParts.push(created);
            result.added++;
          } catch { result.errors.push(partNumber); result.skipped++; }
        }
      } else if (section.type === "rejection-reasons") {
        for (const row of section.rows) {
          const n = normalizeToModel(row, cm, section.sheet);
          const rawCode = n.rejectionCode || findCol(row, REJECTION_SLUGS) || findCol(row, CODE_SLUGS);
          if (!rawCode) { result.skipped++; continue; }
          const { code, reason: autoReason } = splitCodeAndReason(rawCode);
          const descRaw = (cm.description ? row[cm.description]?.trim() : "") || findCol(row, DESC_SLUGS);
          const reason = descRaw || autoReason;
          if (localRejTypes.some((t) => t.rejectionCode.toLowerCase() === code.toLowerCase())) { result.skipped++; continue; }
          try {
            const created = await new Promise<(typeof localRejTypes)[0]>((res, rej) => {
              createRejType.mutate({ rejectionCode: code, reason: reason || code, type: "rejection" }, { onSuccess: (t) => res(t), onError: rej });
            });
            localRejTypes.push(created);
            result.added++;
          } catch { result.errors.push(rawCode); result.skipped++; }
        }
      } else if (section.type === "rework-types") {
        for (const row of section.rows) {
          const n = normalizeToModel(row, cm, section.sheet);
          const code = (cm.reworkCode ? row[cm.reworkCode]?.trim() : null) || n.rejectionCode || findCol(row, REWORK_SLUGS);
          const reason = (cm.description ? row[cm.description]?.trim() : "") || findCol(row, DESC_SLUGS);
          if (!code) { result.skipped++; continue; }
          if (localReworkTypes.some((t) => t.reworkCode.toLowerCase() === code.toLowerCase())) { result.skipped++; continue; }
          try {
            const created = await new Promise<(typeof localReworkTypes)[0]>((res, rej) => {
              createReworkType.mutate({ reworkCode: code, reason: reason || "" }, { onSuccess: (t) => res(t), onError: rej });
            });
            localReworkTypes.push(created);
            result.added++;
          } catch { result.errors.push(code); result.skipped++; }
        }
      } else if (section.type === "entries") {
        // Transactional import: each row becomes a rejection_entries DB record
        const insertedKeys = new Set<string>();
        // Detect if this sheet is rework-oriented from column map or sheet name
        const sheetIsRework = !!cm.reworkCode || /rework|rw/i.test(section.sheet);

        for (const row of section.rows) {
          const n = normalizeToModel(row, cm, section.sheet);
          // Must have date and quantity
          if (!n.date || !n.quantity) { result.skipped++; continue; }
          // Must have a part number or rejection code
          const pnRaw = n.partNumber;
          const codeRaw = n.rejectionCode;
          if (!pnRaw && !codeRaw) { result.skipped++; continue; }

          // Reject part-name pollution: part names > 60 chars are likely descriptions, not part numbers
          if (pnRaw && pnRaw.length > 60) { result.skipped++; continue; }

          // 1. Find or create part
          const partForEntry = pnRaw
            ? await findOrCreatePart(pnRaw)
            : await findOrCreatePart("IMPORTED-" + section.sheet.replace(/\s+/g, "-").toUpperCase());
          if (!partForEntry) { result.errors.push(`Part: ${pnRaw ?? "?"}`); result.skipped++; continue; }

          // 2. Find or create rejection type
          const codeSource = codeRaw || pnRaw || "UNKNOWN";
          const isRework = sheetIsRework || /rework|rw\b|re-?work|repair/i.test(n.process ?? "");
          const rejTypeForEntry = await findOrCreateRejType(codeSource, isRework ? "rework" : "rejection");
          if (!rejTypeForEntry) { result.errors.push(`Type: ${codeSource}`); result.skipped++; continue; }

          // 3. Within-session dedup
          const dedupKey = `${n.date}|${partForEntry.id}|${rejTypeForEntry.id}|${n.quantity}`;
          if (insertedKeys.has(dedupKey)) { result.skipped++; continue; }
          insertedKeys.add(dedupKey);

          // 4. Compute missing financials
          let rate = n.rate ?? undefined;
          let amount = n.amount ?? undefined;
          if (rate && n.quantity && !amount) amount = Math.round(rate * n.quantity * 100) / 100;
          if (amount && n.quantity && !rate) rate = Math.round((amount / n.quantity) * 100) / 100;

          // 5. Direct fetch so 200 (cross-session duplicate) vs 201 (new) can be tracked
          try {
            const { code: rejCode, reason: rejReason } = splitCodeAndReason(codeSource);
            const fetchRes = await fetch(api.rejectionEntries.create.path, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                partId: partForEntry.id,
                rejectionTypeId: rejTypeForEntry.id,
                quantity: n.quantity,
                rate,
                amount,
                process: n.process ?? undefined,
                rejectionReasonCode: rejCode,
                rejectionReason: rejReason,
                entryDate: n.date,
              }),
            });
            if (fetchRes.status === 201) {
              result.added++;
            } else if (fetchRes.status === 200) {
              result.skipped++; // cross-session duplicate detected by server
            } else {
              const body = await fetchRes.json().catch(() => ({}));
              result.errors.push(`${n.date}/${pnRaw ?? codeRaw}: ${(body as { message?: string }).message ?? fetchRes.status}`);
              result.skipped++;
            }
          } catch {
            result.errors.push(`Entry ${n.date} / ${pnRaw ?? codeRaw}`);
            result.skipped++;
          }
        }
      } else {
        result.skipped = section.rows.length;
      }
      allResults.push(result);
    }

    // Invalidate all affected query caches
    queryClient.invalidateQueries({ queryKey: [api.parts.list.path] });
    queryClient.invalidateQueries({ queryKey: [api.rejectionTypes.list.path] });
    queryClient.invalidateQueries({ queryKey: ["/api/rework-types"] });
    queryClient.invalidateQueries({ queryKey: [api.rejectionEntries.list.path] });
    queryClient.invalidateQueries({ queryKey: [api.reports.summary.path] });
    queryClient.invalidateQueries({ queryKey: ["/api/analytics/by-part"] });
    queryClient.invalidateQueries({ queryKey: ["/api/analytics/by-month"] });
    queryClient.invalidateQueries({ queryKey: ["/api/analytics/by-cost"] });
    queryClient.invalidateQueries({ queryKey: ["/api/analytics/by-zone"] });
    setResults(allResults);
    setImporting(false);
    const totalAdded = allResults.reduce((s, r) => s + r.added, 0);
    const totalSkipped = allResults.reduce((s, r) => s + r.skipped, 0);
    const entrySheets = allResults.filter((r) => r.section.type === "entries").reduce((s, r) => s + r.added, 0);
    const desc = entrySheets > 0
      ? `${entrySheets} log entries saved, ${totalSkipped} skipped (duplicate or missing data).`
      : `${totalAdded} items added, ${totalSkipped} skipped (already exist or no data).`;
    toast({ title: "Import complete", description: desc });
  };

  const hasData = sections.length > 0 || skippedSheets.length > 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Import Data</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Upload a CSV or Excel file — the system automatically detects Parts, Rejection Reasons, and Rework Types by column headers.
        </p>
      </div>

      {/* ── Upload zone ── */}
      <Card className="border-dashed border-2 border-border/60 hover:border-primary/40 transition-colors">
        <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <FileSpreadsheet className="w-7 h-7 text-primary" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-foreground">Drop your file here or click to browse</p>
            <p className="text-sm text-muted-foreground mt-1">Supports .csv, .xlsx, .xls, .xlsm — multi-sheet Excel supported</p>
          </div>
          <Button onClick={() => fileInputRef.current?.click()} disabled={parsing || importing} data-testid="button-upload-file">
            <Upload className="w-4 h-4 mr-2" />
            {parsing ? "Reading file…" : "Choose File"}
          </Button>
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls,.xlsm" onChange={handleFile} className="hidden" data-testid="input-file-upload" />
          {fileName && <p className="text-xs text-muted-foreground">{fileName}</p>}
        </CardContent>
      </Card>

      <div className="relative flex items-center gap-3">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground">or</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* ── Google Sheets ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Link className="w-4 h-4 text-primary" />
            Import from Google Sheets
          </CardTitle>
          <CardDescription>Paste the URL of a publicly shared Google Sheet</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="https://docs.google.com/spreadsheets/d/..."
              value={gsheetUrl}
              onChange={(e) => setGsheetUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleGSheetImport()}
              disabled={gsheetLoading || parsing}
              data-testid="input-gsheet-url"
            />
            <Button onClick={handleGSheetImport} disabled={!gsheetUrl.trim() || gsheetLoading || parsing} data-testid="button-import-gsheet">
              {gsheetLoading ? <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : "Import"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            The sheet must be shared as <strong>Anyone with the link → Viewer</strong>. Only the first sheet tab is imported.
          </p>
        </CardContent>
      </Card>

      {/* ── Help text ── */}
      <div className="text-sm text-muted-foreground bg-muted/40 rounded-lg border border-border p-4 space-y-2">
        <p className="font-medium text-foreground">Auto-detection — accepted header variations:</p>
        <ul className="space-y-1 list-disc list-inside">
          <li>
            <strong>Parts</strong> — <span className="font-mono text-xs bg-muted px-1 rounded">Part Number</span> <span className="font-mono text-xs bg-muted px-1 rounded">Part No</span> <span className="font-mono text-xs bg-muted px-1 rounded">PN</span> <span className="font-mono text-xs bg-muted px-1 rounded">Product Name</span> <span className="font-mono text-xs bg-muted px-1 rounded">Component</span>
            <span className="ml-1 text-muted-foreground">· price column:</span> <span className="font-mono text-xs bg-muted px-1 rounded">Price</span> <span className="font-mono text-xs bg-muted px-1 rounded">Rate</span> <span className="font-mono text-xs bg-muted px-1 rounded">Unit Price</span> <span className="font-mono text-xs bg-muted px-1 rounded">Cost</span>
          </li>
          <li><strong>Rejection Reasons</strong> — <span className="font-mono text-xs bg-muted px-1 rounded">Rejection Code</span> <span className="font-mono text-xs bg-muted px-1 rounded">Reject Reason</span> <span className="font-mono text-xs bg-muted px-1 rounded">Defect</span> <span className="font-mono text-xs bg-muted px-1 rounded">NCR Code</span></li>
          <li><strong>Rework Types</strong> — <span className="font-mono text-xs bg-muted px-1 rounded">Rework Code</span> <span className="font-mono text-xs bg-muted px-1 rounded">RW Code</span> <span className="font-mono text-xs bg-muted px-1 rounded">Rework</span></li>
          <li>Title rows, blank rows, and merged cells above the real headers are skipped automatically</li>
          <li>If columns can't be detected, a manual mapping prompt appears</li>
        </ul>
      </div>

      {/* ── Results area ── */}
      {hasData && (
        <div className="space-y-4">

          {/* Section list header + import button */}
          {sections.length > 0 && (
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {sections.length} importable sheet{sections.length > 1 ? "s" : ""} detected
                {skippedSheets.length > 0 && (
                  <span className="text-sm font-normal text-muted-foreground ml-2">
                    ({skippedSheets.length} skipped)
                  </span>
                )}
              </h2>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowNormalized((v) => !v)}
                  data-testid="button-toggle-normalized"
                >
                  {showNormalized ? "Hide" : "Show"} normalized view
                </Button>
                <Button onClick={runImport} disabled={importing || sections.every(s => s.type === "unknown")} data-testid="button-run-import">
                  {importing ? "Importing…" : "Import All"}
                </Button>
              </div>
            </div>
          )}

          {/* Normalized data table */}
          {showNormalized && normalizedDataset.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Normalized Dataset — {normalizedDataset.length} rows</CardTitle>
                <CardDescription>All sheets merged into a single sortable, filterable table. Click any column header to sort.</CardDescription>
              </CardHeader>
              <CardContent>
                <NormalizedDataTable rows={normalizedDataset} />
              </CardContent>
            </Card>
          )}

          {/* Per-section cards */}
          {sections.map((section, i) => {
            const result = results.find((r) => r.section === section);
            const expanded = expandedSections.has(i);
            const showMapping = mappingSection === i;
            const normRows = normalizedDataset.filter((r) => r.sourceSheet === section.sheet);
            return (
              <Card key={i} className="overflow-hidden" data-testid={`card-section-${i}`}>
                <button className="w-full text-left" onClick={() => toggleSection(i)}>
                  <CardHeader className="py-3 px-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        {result ? (
                          result.added > 0
                            ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                            : <AlertCircle className="w-4 h-4 text-muted-foreground shrink-0" />
                        ) : (
                          section.type === "unknown"
                            ? <XCircle className="w-4 h-4 text-muted-foreground shrink-0" />
                            : <FileSpreadsheet className="w-4 h-4 text-primary shrink-0" />
                        )}
                        <span className="font-medium text-sm truncate">{section.sheet}</span>
                        {typeBadge(section.type)}
                        <ConfidenceBadge confidence={section.confidence} />
                        <span className="text-xs text-muted-foreground shrink-0">{section.rows.length} rows · header row {section.headerRowIndex + 1}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {result && <span className="text-xs text-muted-foreground">+{result.added} added, {result.skipped} skipped</span>}
                        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                      </div>
                    </div>
                  </CardHeader>
                </button>

                {expanded && (
                  <CardContent className="pt-0 px-4 pb-4 space-y-4">

                    {/* Low confidence warning */}
                    {(section.confidence < 0.4 || section.type === "unknown") && !showMapping && (
                      <div className="flex items-start gap-3 bg-yellow-500/5 border border-yellow-400/20 rounded-lg p-3">
                        <AlertCircle className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">Columns not confidently detected</p>
                          <p className="text-xs text-muted-foreground mt-0.5">The system couldn't reliably map all columns. Fix the mapping manually before importing.</p>
                        </div>
                        <Button size="sm" variant="outline" className="shrink-0 h-7 text-xs gap-1" onClick={(e) => { e.stopPropagation(); setMappingSection(i); }} data-testid={`button-map-columns-${i}`}>
                          <Wand2 className="w-3 h-3" />
                          Map Columns
                        </Button>
                      </div>
                    )}

                    {/* Column mapping editor */}
                    {showMapping && (
                      <ColumnMappingEditor
                        section={section}
                        onApply={(cm) => applyManualMapping(i, cm)}
                        onCancel={() => setMappingSection(null)}
                      />
                    )}

                    {!showMapping && (
                      <>
                        {/* Column meta table */}
                        <div>
                          <p className="text-xs font-medium text-foreground mb-2">Detected columns</p>
                          <div className="flex flex-wrap gap-1.5">
                            {section.columnMeta.map((m) => (
                              <div key={m.original} className="flex items-center gap-1 bg-muted/60 border border-border rounded px-2 py-1">
                                <FieldTypePill type={m.fieldType} />
                                <span className="text-xs font-mono text-foreground">{m.original}</span>
                                {m.canonical && (
                                  <span className="text-[10px] text-muted-foreground">→ {m.canonical}</span>
                                )}
                              </div>
                            ))}
                          </div>
                          {!showMapping && section.confidence >= 0.4 && (
                            <button
                              className="text-xs text-primary mt-2 underline-offset-2 hover:underline"
                              onClick={(e) => { e.stopPropagation(); setMappingSection(i); }}
                            >
                              Edit mapping
                            </button>
                          )}
                        </div>

                        {/* Preview: first 5 normalized rows */}
                        {normRows.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-foreground mb-2">Preview — first 5 normalized rows</p>
                            <div className="overflow-x-auto rounded border border-border">
                              <table className="text-xs w-full">
                                <thead>
                                  <tr className="bg-muted/50">
                                    {NORM_COLS.filter((c) => c.key !== "sourceSheet").map(({ key, label }) => (
                                      <th key={key} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{label}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {normRows.slice(0, 5).map((row) => (
                                    <tr key={row.id} className="border-t border-border">
                                      <td className="px-3 py-1.5 whitespace-nowrap">{row.date ?? <span className="text-muted-foreground/40">—</span>}</td>
                                      <td className="px-3 py-1.5 font-mono max-w-[160px] truncate">{row.partNumber ?? <span className="text-muted-foreground/40">—</span>}</td>
                                      <td className="px-3 py-1.5 max-w-[140px] truncate">{row.rejectionCode ?? <span className="text-muted-foreground/40">—</span>}</td>
                                      <td className="px-3 py-1.5 text-right tabular-nums">{row.quantity ?? <span className="text-muted-foreground/40">—</span>}</td>
                                      <td className="px-3 py-1.5 max-w-[100px] truncate">{row.process ?? <span className="text-muted-foreground/40">—</span>}</td>
                                      <td className="px-3 py-1.5 text-right tabular-nums">{row.rate ?? <span className="text-muted-foreground/40">—</span>}</td>
                                      <td className="px-3 py-1.5 text-right tabular-nums">{row.amount ?? <span className="text-muted-foreground/40">—</span>}</td>
                                    </tr>
                                  ))}
                                  {normRows.length > 5 && (
                                    <tr className="border-t border-border">
                                      <td colSpan={7} className="px-3 py-2 text-center text-muted-foreground italic">…and {normRows.length - 5} more rows</td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}

          {/* Skipped sheets */}
          {skippedSheets.length > 0 && (
            <Card className="border-border/50">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
                  <SkipForward className="w-4 h-4" />
                  {skippedSheets.length} sheet{skippedSheets.length > 1 ? "s" : ""} skipped
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 px-4 pb-4">
                <div className="space-y-1.5">
                  {skippedSheets.map((s, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <XCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      <span className="font-mono font-medium text-foreground">{s.name}</span>
                      <span className="text-muted-foreground">— {s.reason}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
