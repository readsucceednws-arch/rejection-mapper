import { useRef, useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useParts, useCreatePart } from "@/hooks/use-parts";
import { useRejectionTypes, useCreateRejectionType } from "@/hooks/use-rejection-types";
import { useReworkTypes, useCreateReworkType } from "@/hooks/use-rework-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertCircle,
  ChevronDown, ChevronUp, Wand2, ArrowUpDown, ArrowUp, ArrowDown,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type Row = Record<string, string>;

type ColumnMap = {
  partNumber: string | null;
  rejectionCode: string | null;
  reworkCode: string | null;
  description: string | null;
  quantity: string | null;
  process: string | null;
  date: string | null;
  rate: string | null;
  amount: string | null;
  remarks: string | null;
  zone: string | null;
};

type FieldType =
  | "date"
  | "number"
  | "currency"
  | "quantity"
  | "partNumber"
  | "rejectionCode"
  | "process"
  | "text";

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
type BucketSortKey = "date" | "rejectionCode" | "quantity" | "amount" | "process";
type TabImportType = "parts" | "rejection-reasons" | "rework-types";

// ─── Normalization helpers ───────────────────────────────────────────────────

function cleanHeader(header: string | undefined): string {
  return (header ?? "").replace(/^\uFEFF/, "").trim();
}

function normalizeHeaderKey(header: string | undefined): string {
  return cleanHeader(header).toLowerCase().replace(/\s+/g, " ");
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLooseText(value: unknown): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[‐-‒–—]/g, "-")
    .replace(/[^\w\s\-./()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLooseKey(value: unknown): string {
  return normalizeLooseText(value).replace(/[\s\-./()]+/g, "");
}

function normalizeCode(value: unknown): string {
  return normalizeText(value)
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[‐-‒–—]/g, "-");
}

function areLooselyEqual(a: unknown, b: unknown): boolean {
  return normalizeLooseKey(a) === normalizeLooseKey(b);
}

function isBlank(value: unknown): boolean {
  return normalizeText(value) === "";
}

function safeNumber(value: unknown): number | null {
  const raw = normalizeText(value);
  if (!raw) return null;

  const cleaned = raw
    .replace(/₹|\$/g, "")
    .replace(/,/g, "")
    .replace(/\(([^)]+)\)/, "-$1");

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function formatRowError(rowIndex: number, message: string, value?: string) {
  return `Row ${rowIndex}: ${message}${value ? ` (${value})` : ""}`;
}

// ─── Header helpers ──────────────────────────────────────────────────────────

function extractHeaderColumns(rawHeaders: any[]): { headers: string[]; indices: number[] } {
  const headers: string[] = [];
  const indices: number[] = [];
  const seen = new Set<string>();

  rawHeaders.forEach((cell, idx) => {
    const h = cleanHeader(String(cell ?? ""));
    if (!h || seen.has(h)) return;
    seen.add(h);
    headers.push(h);
    indices.push(idx);
  });

  return { headers, indices };
}

function getRowCell(row: Row, col: string | null): string | null {
  if (!col) return null;

  const exact = row[col];
  if (exact !== undefined && exact !== null) {
    const val = normalizeText(exact);
    return val || null;
  }

  const target = normalizeHeaderKey(col);
  for (const key of Object.keys(row)) {
    if (normalizeHeaderKey(key) === target) {
      const val = normalizeText(row[key]);
      return val || null;
    }
  }

  return null;
}

// ─── Slug sets ───────────────────────────────────────────────────────────────

function slug(val: string | undefined): string {
  return (val ?? "").toString().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizePhrase(val: string | undefined): string {
  return (val ?? "").toString().toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
}

const PART_SLUGS = new Set([
  "partnumber", "partno", "partnum", "pn", "part", "item", "itemno", "itemnum",
  "itemnumber", "partcode", "partid", "materialcode", "material", "materialno",
  "productname", "product", "component", "componentname", "itemdescription",
  "itemname", "componentno",
]);

const REWORK_SLUGS = new Set([
  "reworkcode", "rwcode", "rework", "reworktype", "rwtypecode", "reworkreason",
  "reworkno", "reworknum", "rwreason",
]);

const REJECTION_SLUGS = new Set([
  "rejectioncode", "rejectcode", "rejectionreason", "rejectreason", "rejcode",
  "rejreason", "rejection", "failurecode", "defectcode", "defect", "ncrcode",
  "nccode", "defecttype", "failurereason", "rejecttype", "rejectiontype",
]);

const CODE_SLUGS = new Set(["code", "reasoncode", "typecode", "defectcode"]);
const DESC_SLUGS = new Set([
  "description", "desc", "name", "partname", "itemname", "reason", "details",
  "partdescription", "remarks", "defectdescription", "failuredescription",
]);
const PURPOSE_SLUGS = new Set([
  "purpose", "process", "type", "category", "entrytype", "operation",
  "stage", "workstage", "operationtype",
]);
const QTY_SLUGS = new Set([
  "quantity", "qty", "count", "units", "pcs", "pieces", "nos",
  "quantityrejected", "rejectedqty", "rejqty", "totalqty", "noofpieces",
]);
const REMARKS_SLUGS = new Set([
  "remarks", "notes", "note", "comment", "comments", "observation",
  "observations", "remark",
]);
const DATE_SLUGS = new Set([
  "date", "entrydate", "transactiondate", "logdate", "entrydt", "dateofentry",
  "dateofrejection", "inspectiondate",
]);
const RATE_SLUGS = new Set([
  "rate", "unitrate", "price", "unitprice", "cost", "unitcost", "costperunit",
]);
const AMOUNT_SLUGS = new Set([
  "amount", "value", "total", "totalamount", "totalvalue", "totalcost", "linecost",
]);

const ZONE_SLUGS = new Set([
  "zone", "zonename", "area", "location", "section", "department", "dept",
  "workzone", "productionzone", "productionarea", "shopfloor", "plant",
  "supplier", "vendor", "outsource",
]);

const PHRASE_ALIASES: { phrase: string; weight: number }[] = [
  { phrase: "part number", weight: 3 },
  { phrase: "part no", weight: 3 },
  { phrase: "product name", weight: 3 },
  { phrase: "item name", weight: 2 },
  { phrase: "component name", weight: 2 },
  { phrase: "rejection code", weight: 3 },
  { phrase: "reject code", weight: 3 },
  { phrase: "rejection reason", weight: 3 },
  { phrase: "reject reason", weight: 3 },
  { phrase: "defect code", weight: 3 },
  { phrase: "rework code", weight: 3 },
  { phrase: "rework reason", weight: 3 },
  { phrase: "entry date", weight: 3 },
  { phrase: "transaction date", weight: 3 },
  { phrase: "date of rejection", weight: 3 },
  { phrase: "quantity rejected", weight: 3 },
  { phrase: "rejected qty", weight: 3 },
  { phrase: "unit rate", weight: 2 },
  { phrase: "unit price", weight: 2 },
  { phrase: "total amount", weight: 2 },
  { phrase: "date", weight: 2 },
  { phrase: "qty", weight: 2 },
  { phrase: "rate", weight: 2 },
  { phrase: "amount", weight: 2 },
  { phrase: "process", weight: 2 },
  { phrase: "purpose", weight: 2 },
  { phrase: "operation", weight: 2 },
  { phrase: "stage", weight: 1 },
  { phrase: "cost", weight: 1 },
];

const ALL_KNOWN_SLUGS = new Set([
  ...PART_SLUGS,
  ...REWORK_SLUGS,
  ...REJECTION_SLUGS,
  ...CODE_SLUGS,
  ...DESC_SLUGS,
  ...PURPOSE_SLUGS,
  ...QTY_SLUGS,
  ...REMARKS_SLUGS,
  ...DATE_SLUGS,
  ...RATE_SLUGS,
  ...AMOUNT_SLUGS,
  ...ZONE_SLUGS,
]);

function scoreCell(cell: string): number {
  const s = slug(cell);
  const p = normalizePhrase(cell);
  let score = 0;

  if (s.length >= 2 && ALL_KNOWN_SLUGS.has(s)) score += 3;
  else if (s.length >= 2) {
    for (const key of ALL_KNOWN_SLUGS) {
      if (s.includes(key) || key.includes(s)) {
        score += 1;
        break;
      }
    }
  }

  for (const { phrase, weight } of PHRASE_ALIASES) {
    if (p.includes(phrase)) {
      score += weight;
      break;
    }
  }

  return score;
}

// ─── Item normalization ──────────────────────────────────────────────────────

function normalizeItemKey(raw: string | null | undefined): string {
  if (!raw?.trim()) return "(no part)";
  return raw
    .replace(/\s*[\[(].*?[\])]\s*/g, " ")
    .replace(/[.\-_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

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

// ─── Matching helpers ────────────────────────────────────────────────────────

function matchesAny(header: string, set: Set<string>): boolean {
  const s = slug(header);
  const p = normalizePhrase(header);
  if (s.length === 0) return false;

  if (set.has(s)) return true;

  for (const key of set) {
    if (s.includes(key) || key.includes(s)) return true;
  }

  for (const key of set) {
    const phrase = key.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
    if (phrase.length > 2 && p.includes(phrase)) return true;
  }

  return false;
}

function findCol(row: Row, set: Set<string>): string {
  for (const key of Object.keys(row)) {
    if (matchesAny(key, set)) {
      const value = normalizeText(row[key]);
      if (value) return value;
    }
  }
  return "";
}

function findHeader(headers: string[], set: Set<string>): string | null {
  return headers.find((h) => matchesAny(h, set)) ?? null;
}

// ─── Field inference ─────────────────────────────────────────────────────────

function inferFieldType(header: string, sampleValues: string[]): FieldType {
  if (matchesAny(header, DATE_SLUGS)) return "date";
  if (matchesAny(header, QTY_SLUGS)) return "quantity";
  if (matchesAny(header, RATE_SLUGS) || matchesAny(header, AMOUNT_SLUGS)) return "currency";
  if (matchesAny(header, PART_SLUGS)) return "partNumber";
  if (matchesAny(header, REJECTION_SLUGS) || matchesAny(header, REWORK_SLUGS)) return "rejectionCode";
  if (matchesAny(header, PURPOSE_SLUGS)) return "process";

  const filled = sampleValues.filter(Boolean);
  if (filled.length > 0) {
    const numericCount = filled.filter((v) => !isNaN(parseFloat(v.replace(/,/g, "")))).length;
    if (numericCount / filled.length > 0.75) return "number";
  }

  return "text";
}

function canonicalForHeader(h: string): keyof ColumnMap | null {
  if (matchesAny(h, PART_SLUGS)) return "partNumber";
  if (matchesAny(h, REJECTION_SLUGS)) return "rejectionCode";
  if (matchesAny(h, REWORK_SLUGS)) return "reworkCode";
  if (matchesAny(h, DESC_SLUGS)) return "description";
  if (matchesAny(h, QTY_SLUGS)) return "quantity";
  if (matchesAny(h, PURPOSE_SLUGS)) return "process";
  if (matchesAny(h, DATE_SLUGS)) return "date";
  if (matchesAny(h, RATE_SLUGS)) return "rate";
  if (matchesAny(h, AMOUNT_SLUGS)) return "amount";
  if (matchesAny(h, REMARKS_SLUGS)) return "remarks";
  if (matchesAny(h, ZONE_SLUGS)) return "zone";
  return null;
}

// ─── Header detection ────────────────────────────────────────────────────────

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
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  return bestIdx;
}

// ─── Column map / confidence ────────────────────────────────────────────────

function buildColumnMap(headers: string[]): ColumnMap {
  return {
    partNumber: findHeader(headers, PART_SLUGS),
    rejectionCode: findHeader(headers, REJECTION_SLUGS) ?? findHeader(headers, CODE_SLUGS),
    reworkCode: findHeader(headers, REWORK_SLUGS),
    description: findHeader(headers, DESC_SLUGS),
    quantity: findHeader(headers, QTY_SLUGS),
    process: findHeader(headers, PURPOSE_SLUGS),
    date: findHeader(headers, DATE_SLUGS),
    rate: findHeader(headers, RATE_SLUGS),
    amount: findHeader(headers, AMOUNT_SLUGS),
    remarks: findHeader(headers, REMARKS_SLUGS),
    zone: findHeader(headers, ZONE_SLUGS),
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

// ─── Type detection ──────────────────────────────────────────────────────────

function detectType(headers: string[]): ImportSection["type"] {
  const hasPart = headers.some((h) => matchesAny(h, PART_SLUGS));
  const hasRework = headers.some((h) => matchesAny(h, REWORK_SLUGS));
  const hasRejection = headers.some((h) => matchesAny(h, REJECTION_SLUGS));
  const hasCode = headers.some((h) => matchesAny(h, CODE_SLUGS));
  const hasDesc = headers.some((h) => matchesAny(h, DESC_SLUGS));
  const hasPurpose = headers.some((h) => matchesAny(h, PURPOSE_SLUGS));
  const hasQty = headers.some((h) => matchesAny(h, QTY_SLUGS));
  const hasDate = headers.some((h) => matchesAny(h, DATE_SLUGS));

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

// ─── Sheet quality check ─────────────────────────────────────────────────────

function checkDataSheet(headers: string[], dataRows: Row[]): { ok: boolean; reason: string } {
  if (headers.length < 1) return { ok: false, reason: "No columns detected" };
  if (dataRows.length < 1) return { ok: false, reason: "No data rows found after the header row" };

  const known = headers.filter((h) =>
    matchesAny(h, PART_SLUGS) ||
    matchesAny(h, REJECTION_SLUGS) ||
    matchesAny(h, REWORK_SLUGS) ||
    matchesAny(h, CODE_SLUGS) ||
    matchesAny(h, DESC_SLUGS) ||
    matchesAny(h, QTY_SLUGS) ||
    matchesAny(h, DATE_SLUGS) ||
    matchesAny(h, PURPOSE_SLUGS) ||
    matchesAny(h, RATE_SLUGS) ||
    matchesAny(h, AMOUNT_SLUGS)
  );

  if (known.length === 0) {
    return { ok: false, reason: "No recognizable column headers found — may be a summary or form sheet" };
  }

  return { ok: true, reason: "" };
}

// ─── Recovery helpers ────────────────────────────────────────────────────────

function tryContentRecovery(sheetName: string, rawRows: any[][]): ImportSection | null {
  const sn = sheetName.toLowerCase().replace(/[^a-z]/g, "");
  let syntheticHeader = "";

  if (/item|part|product|material|component/.test(sn)) syntheticHeader = "Item Name";
  else if (/reject|defect|failure|ncr/.test(sn)) syntheticHeader = "Rejection Code";
  else if (/rework|rw/.test(sn)) syntheticHeader = "Rework Code";
  else return null;

  const allRows = rawRows
    .filter((r) => Array.isArray(r) && r.some((c) => c !== undefined && c !== null && String(c).trim() !== ""))
    .map((r) => {
      const obj: Row = {};
      (r as any[]).forEach((cell, idx) => {
        obj[`_c${idx}`] = cell !== undefined && cell !== null ? String(cell).trim() : "";
      });
      return obj;
    });

  if (allRows.length === 0) return null;

  const allColKeys = Object.keys(allRows[0]);
  const bestTextCol = findBestTextColumn(allColKeys, allRows);
  if (!bestTextCol) return null;

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

// ─── Parts-specific helpers ──────────────────────────────────────────────────

function isPartNameLike(v: string): boolean {
  return /[a-zA-Z]/.test(v.trim());
}

function isSummaryRow(v: string): boolean {
  return /^(sum[\s(]|grand\s*total|sub[\s-]?total|total\b|average|count|minimum|maximum)/i.test(v.trim());
}

function findBestTextColumn(headers: string[], rows: Row[]): string | null {
  let bestHeader: string | null = null;
  let bestScore = -1;

  for (const h of headers) {
    const samples = rows.slice(0, 40).map((r) => (r[h] ?? "").trim()).filter(Boolean);
    if (samples.length === 0) continue;

    const textCount = samples.filter((v) => isPartNameLike(v) && !isSummaryRow(v)).length;
    const textRatio = textCount / samples.length;
    const avgLen = samples.reduce((s, v) => s + v.length, 0) / samples.length;
    const score = textRatio * Math.log1p(avgLen);

    if (score > bestScore) {
      bestScore = score;
      bestHeader = h;
    }
  }

  return bestScore > 0.3 ? bestHeader : null;
}

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

// ─── Code/date/row normalizers ───────────────────────────────────────────────

function splitCodeAndReason(raw: string): { code: string; reason: string } {
  const trimmed = normalizeText(raw);
  if (!trimmed) return { code: "", reason: "" };

  const sepMatch = trimmed.match(/^([A-Z0-9][A-Z0-9\-_.\/]{0,29})\s*[-:|]\s*(.+)$/i);
  if (sepMatch) {
    return {
      code: normalizeCode(sepMatch[1]),
      reason: normalizeText(sepMatch[2]),
    };
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  const looksLikeCode =
    trimmed.length <= 30 &&
    words.length <= 4 &&
    !/[,;.!?]/.test(trimmed);

  if (looksLikeCode) {
    return {
      code: normalizeCode(trimmed),
      reason: trimmed,
    };
  }

  const autoCode = words
    .slice(0, 4)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return {
    code: autoCode || "UNK",
    reason: trimmed,
  };
}

function normalizeDate(raw: string | null): string | null {
  if (!raw) return null;

  const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];

  const dmyMatch = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return raw.split("T")[0].split(" ")[0] || null;
}

let _rowCounter = 0;

function normalizeToModel(row: Row, cm: ColumnMap, sourceSheet: string): NormalizedRow {
  const get = (col: string | null) => getRowCell(row, col);

  const rawDate = get(cm.date);
  let qty = safeNumber(get(cm.quantity));
  let rate = safeNumber(get(cm.rate));
  let amount = safeNumber(get(cm.amount));

  if (qty && rate && !amount) amount = Math.round(qty * rate * 100) / 100;
  if (qty && amount && !rate && qty !== 0) rate = Math.round((amount / qty) * 100) / 100;

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

// ─── Section builder ─────────────────────────────────────────────────────────

function buildSection(sheetName: string, headers: string[], dataRows: Row[], headerRowIndex: number): ImportSection {
  const type = detectType(headers);
  const columnMap = buildColumnMap(headers);
  const columnMeta = buildColumnMeta(headers, dataRows);
  const confidence = computeConfidence(columnMap, type);

  return {
    sheet: sheetName,
    type,
    rows: dataRows,
    allHeaders: headers,
    columnMap,
    columnMeta,
    confidence,
    headerRowIndex,
  };
}

// ─── Parser ──────────────────────────────────────────────────────────────────

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
        const rawRows = XLSX.utils.sheet_to_json<any[]>(sheet, {
          header: 1,
          raw: false,
          dateNF: "yyyy-mm-dd hh:mm",
        });

        if (rawRows.length < 2) {
          skipped.push({ name: sheetName, reason: "Sheet has fewer than 2 rows" });
          continue;
        }

        const headerIdx = findHeaderRowIndex(rawRows);
        const rawHeaders = rawRows[headerIdx] as any[];
        const { headers, indices } = extractHeaderColumns(rawHeaders);

        const dataRaw = (rawRows.slice(headerIdx + 1) as any[][]).filter(
          (r) => Array.isArray(r) && r.some((c) => c !== undefined && c !== null && String(c).trim() !== "")
        );

        const rows = dataRaw.map((r) => {
          const obj: Row = {};
          headers.forEach((h, i) => {
            const sourceIdx = indices[i];
            obj[h] = r[sourceIdx] !== undefined && r[sourceIdx] !== null ? String(r[sourceIdx]).trim() : "";
          });
          return obj;
        });

        const quality = checkDataSheet(headers, rows);
        if (!quality.ok) {
          const recovered = tryContentRecovery(sheetName, rawRows);
          if (recovered) sections.push(recovered);
          else skipped.push({ name: sheetName, reason: quality.reason });
          continue;
        }

        sections.push(buildSection(sheetName, headers, rows, headerIdx));
      } catch {
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

    const candidates = lines.slice(0, 15).map((l) =>
      l.split(",").map((h) => cleanHeader(h.replace(/^"|"$/g, "").trim()))
    );

    const headerIdx = candidates.reduce(
      (best, row, i) => (scoreHeaderRow(row) > scoreHeaderRow(candidates[best]) ? i : best),
      0
    );

    const { headers, indices } = extractHeaderColumns(candidates[headerIdx]);

    const rows: Row[] = lines
      .slice(headerIdx + 1)
      .map((line) => {
        const values = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g) ?? line.split(",");
        const obj: Row = {};
        headers.forEach((h, i) => {
          const sourceIdx = indices[i];
          obj[h] = (values[sourceIdx] ?? "").replace(/^"|"$/g, "").trim();
        });
        return obj;
      })
      .filter((r) => Object.values(r).some((v) => v !== ""));

    const quality = checkDataSheet(headers, rows);
    if (quality.ok) sections.push(buildSection(file.name, headers, rows, headerIdx));
    else skipped.push({ name: file.name, reason: quality.reason });
  }

  return { sections, skipped };
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CANONICAL_FIELDS: { key: keyof ColumnMap; label: string }[] = [
  { key: "partNumber", label: "Part Number" },
  { key: "rejectionCode", label: "Rejection / Rework Code" },
  { key: "reworkCode", label: "Rework Code" },
  { key: "description", label: "Description / Name" },
  { key: "quantity", label: "Quantity" },
  { key: "process", label: "Process / Purpose" },
  { key: "date", label: "Date" },
  { key: "rate", label: "Rate / Price" },
  { key: "amount", label: "Amount / Value" },
  { key: "remarks", label: "Remarks / Notes" },
  { key: "zone", label: "Zone / Area" },
];

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  date: "Date",
  number: "Number",
  currency: "Currency",
  quantity: "Qty",
  partNumber: "Part #",
  rejectionCode: "Rej. Code",
  process: "Process",
  text: "Text",
};

const NORM_COLS: { key: SortKey; label: string }[] = [
  { key: "date", label: "Date" },
  { key: "partNumber", label: "Part Number" },
  { key: "rejectionCode", label: "Rej. / Rework Code" },
  { key: "quantity", label: "Qty" },
  { key: "process", label: "Process" },
  { key: "rate", label: "Rate" },
  { key: "amount", label: "Amount" },
  { key: "sourceSheet", label: "Sheet" },
];

const BUCKET_SORT_OPTIONS: { key: BucketSortKey; label: string }[] = [
  { key: "date", label: "Date" },
  { key: "rejectionCode", label: "Rejection Code" },
  { key: "quantity", label: "Quantity" },
  { key: "amount", label: "Amount" },
  { key: "process", label: "Process" },
];

const TAB_CONFIG: Record<
  TabImportType,
  {
    label: string;
    primaryHeaders: string[];
    priceHeaders?: string[];
    helpNote: string;
  }
> = {
  parts: {
    label: "Parts",
    primaryHeaders: ["Part Number", "Part No", "PN", "Product Name", "Component", "Item Name"],
    priceHeaders: ["Price", "Rate", "Unit Price", "Cost"],
    helpNote: "Each row becomes one part. Duplicate part names are skipped automatically.",
  },
  "rejection-reasons": {
    label: "Rejection Reasons",
    primaryHeaders: ["Rejection Code", "Reject Code", "Code", "Defect Code", "NCR Code"],
    helpNote: "Each row becomes one rejection reason. Include a Code column, optionally a Reason/Description column, and optionally a Zone column.",
  },
  "rework-types": {
    label: "Rework Types",
    primaryHeaders: ["Rework Code", "RW Code", "Rework Type", "Rework Reason"],
    helpNote: "Each row becomes one rework type. Include a Rework Code column, optionally a Description column, and optionally a Zone column.",
  },
};

// ─── UI helpers ──────────────────────────────────────────────────────────────

function typeBadge(type: ImportSection["type"]) {
  const map = {
    parts: { label: "Parts", className: "bg-primary/10 text-primary border-primary/20" },
    "rejection-reasons": {
      label: "Rejection Reasons",
      className: "bg-destructive/10 text-destructive border-destructive/20",
    },
    "rework-types": {
      label: "Rework Types",
      className: "bg-blue-500/10 text-blue-600 border-blue-400/30",
    },
    entries: { label: "Log Entries", className: "bg-green-500/10 text-green-700 border-green-400/30" },
    unknown: { label: "Unknown", className: "bg-muted text-muted-foreground border-border" },
  };
  const { label, className } = map[type];
  return <Badge variant="outline" className={className}>{label}</Badge>;
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  if (confidence >= 0.75) {
    return (
      <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-400/30 text-xs">
        High confidence
      </Badge>
    );
  }
  if (confidence >= 0.4) {
    return (
      <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-400/30 text-xs">
        Partial match
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-xs">
      Low confidence
    </Badge>
  );
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

// ─── Column mapping editor ───────────────────────────────────────────────────

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

  return (
    <div className="space-y-4 pt-2">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-0.5 text-xs mb-2">
        <div className="font-medium text-muted-foreground pb-1 border-b border-border col-span-1">Your column</div>
        <div className="font-medium text-muted-foreground pb-1 border-b border-border col-span-1 sm:col-span-2">
          Maps to standard field
        </div>

        {section.allHeaders.map((h) => {
          const meta = section.columnMeta.find((m) => m.original === h);
          return (
            <div
              key={h}
              className="col-span-2 sm:col-span-3 grid grid-cols-2 sm:grid-cols-3 items-center gap-2 py-1 border-b border-border/40"
            >
              <div className="flex items-center gap-1.5 truncate">
                {meta && <FieldTypePill type={meta.fieldType} />}
                <span className="font-mono text-foreground truncate">{h}</span>
              </div>

              <Select
                value={Object.entries(draft).find(([, v]) => v === h)?.[0] ?? "(none)"}
                onValueChange={(field) => {
                  const newDraft = { ...draft };
                  (Object.keys(newDraft) as (keyof ColumnMap)[]).forEach((k) => {
                    if (newDraft[k] === h) newDraft[k] = null;
                  });
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
                    <SelectItem key={key} value={key} className="text-xs">
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={() => onApply(draft)} data-testid="button-apply-mapping">
          Apply Mapping
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ─── Sorting/table helpers ───────────────────────────────────────────────────

function sortRows(rows: NormalizedRow[], key: BucketSortKey | SortKey, dir: "asc" | "desc"): NormalizedRow[] {
  return [...rows].sort((a, b) => {
    const av = a[key as keyof NormalizedRow];
    const bv = b[key as keyof NormalizedRow];

    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;

    const cmp =
      typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv));

    return dir === "asc" ? cmp : -cmp;
  });
}

// ─── Summary/table components ────────────────────────────────────────────────

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
        { label: "Total rows", value: rows.length },
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
          {open ? (
            <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          )}
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
                  <SelectItem key={key} value={key} className="text-xs">
                    {label}
                  </SelectItem>
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
          [r.date, r.partNumber, r.rejectionCode, r.process, r.sourceSheet].some((v) =>
            v?.toLowerCase().includes(f)
          )
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
    else {
      setSortKey(key);
      setSortDir("asc");
    }
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
          {view === "grouped" ? `${buckets.length} items, ` : ""}
          {filtered.length} rows
        </span>
      </div>

      {view === "grouped" ? (
        <div className="space-y-2">
          {buckets.length === 0 && (
            <p className="text-sm text-muted-foreground italic text-center py-6">
              No rows match the filter
            </p>
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
                    <span className="flex items-center gap-1">
                      {label} <SortIcon k={key} />
                    </span>
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
                  <td colSpan={NORM_COLS.length} className="px-3 py-6 text-center text-muted-foreground italic">
                    No rows match the filter
                  </td>
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

// ─── Main panel ──────────────────────────────────────────────────────────────

function TypedImportPanel({ importType }: { importType: TabImportType }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sections, setSections] = useState<ImportSection[]>([]);
  const [skippedSheets, setSkippedSheets] = useState<SkippedSheet[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [importing, setImporting] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());
  const [mappingSection, setMappingSection] = useState<number | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: existingParts } = useParts();
  const { data: existingRejTypes } = useRejectionTypes();
  const { data: existingReworkTypes } = useReworkTypes();
  const createPart = useCreatePart();
  const createRejType = useCreateRejectionType();
  const createReworkType = useCreateReworkType();

  const config = TAB_CONFIG[importType];

  const processFile = async (file: File) => {
    setFileName(file.name);
    setSections([]);
    setSkippedSheets([]);
    setResults([]);
    setMappingSection(null);
    setParsing(true);

    try {
      const { sections: parsed, skipped } = await parseFileToSections(file);

      let matching = parsed.filter((s) => s.type === importType);
      if (matching.length === 0 && parsed.length > 0) {
        matching = parsed.map((s) => ({
          ...s,
          type: importType as ImportSection["type"],
          confidence: computeConfidence(s.columnMap, importType as ImportSection["type"]),
        }));
      }

      setSections(matching);
      setSkippedSheets(skipped);

      if (!matching.length) {
        toast({
          title: "No matching data",
          description: `No ${config.label} data detected in this file.`,
          variant: "destructive",
        });
      } else {
        const lowConf = matching.findIndex((s) => s.confidence < 0.4);
        if (lowConf !== -1) {
          setMappingSection(lowConf);
          setExpandedSections(new Set([lowConf]));
        } else {
          setExpandedSections(new Set(matching.map((_, i) => i)));
        }
      }
    } catch {
      toast({
        title: "Parse error",
        description: "Could not read the file.",
        variant: "destructive",
      });
    }

    setParsing(false);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = "";
    processFile(file);
  };

  const applyManualMapping = (idx: number, cm: ColumnMap) => {
    setSections((prev) =>
      prev.map((s, i) =>
        i !== idx ? s : { ...s, columnMap: cm, confidence: computeConfidence(cm, s.type) }
      )
    );
    setMappingSection(null);
  };

  const toggleSection = (i: number) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const runImport = async () => {
    if (!sections.length) return;

    setImporting(true);
    _rowCounter = 0;

    const allResults: ImportResult[] = [];
    const localParts = [...(existingParts ?? [])];
    const localRejTypes = [...(existingRejTypes ?? [])];
    const localReworkTypes = [...(existingReworkTypes ?? [])];

    const existingPartKeys = new Set(localParts.map((p) => normalizeLooseKey(p.partNumber)));
    const existingRejKeys = new Set(localRejTypes.map((t) => normalizeCode(t.rejectionCode)));
    const existingReworkKeys = new Set(localReworkTypes.map((t) => normalizeCode(t.reworkCode)));

    for (const section of sections) {
      const result: ImportResult = {
        section,
        added: 0,
        skipped: 0,
        errors: [],
      };

      const cm = section.columnMap;

      if (importType === "parts") {
        let partNameCol: string | null = cm.partNumber;

        if (partNameCol) {
          const sampleVals = section.rows
            .slice(0, 40)
            .map((r) => normalizeText(r[partNameCol!]))
            .filter(Boolean);

          const textCount = sampleVals.filter((v) => isPartNameLike(v)).length;
          if (sampleVals.length > 0 && textCount / sampleVals.length < 0.5) {
            partNameCol = null;
          }
        }

        if (!partNameCol) {
          partNameCol = findBestTextColumn(section.allHeaders, section.rows);
        }

        const priceCol: string | null =
          cm.rate ??
          cm.amount ??
          findBestNumericColumn(section.allHeaders, section.rows, [
            partNameCol,
            cm.quantity,
            cm.date,
          ]);

        for (let rowIndex = 0; rowIndex < section.rows.length; rowIndex++) {
          const row = section.rows[rowIndex];

          try {
            const rawName = normalizeText(getRowCell(row, partNameCol));
            const rawDesc =
              cm.description && cm.description !== partNameCol
                ? normalizeText(getRowCell(row, cm.description))
                : "";

            const candidateName = rawName || rawDesc;

            if (!candidateName) {
              result.skipped++;
              continue;
            }

            if (isSummaryRow(candidateName)) {
              result.skipped++;
              continue;
            }

            if (!isPartNameLike(candidateName)) {
              result.errors.push(formatRowError(rowIndex + 1, "Invalid part name", candidateName));
              result.skipped++;
              continue;
            }

            const partNumber = normalizeText(candidateName);
            const description = normalizeText(rawDesc || rawName || partNumber);
            const price = safeNumber(priceCol ? getRowCell(row, priceCol) : "") ?? 0;

            const normalizedKey = normalizeLooseKey(partNumber);
            if (!normalizedKey) {
              result.errors.push(formatRowError(rowIndex + 1, "Empty part after normalization"));
              result.skipped++;
              continue;
            }

            if (existingPartKeys.has(normalizedKey)) {
              result.skipped++;
              continue;
            }

            const created = await new Promise<(typeof localParts)[0]>((resolve, reject) => {
              createPart.mutate(
                {
                  partNumber,
                  description: description || partNumber,
                  price,
                },
                {
                  onSuccess: (p) => resolve(p),
                  onError: reject,
                }
              );
            });

            localParts.push(created);
            existingPartKeys.add(normalizedKey);
            result.added++;
          } catch (error) {
            result.errors.push(
              formatRowError(rowIndex + 1, "Failed to create part", String(error))
            );
            result.skipped++;
          }
        }
      } else if (importType === "rejection-reasons") {
        for (let rowIndex = 0; rowIndex < section.rows.length; rowIndex++) {
          const row = section.rows[rowIndex];

          try {
            const n = normalizeToModel(row, cm, section.sheet);

            const rawCodeValue =
              n.rejectionCode ||
              findCol(row, REJECTION_SLUGS) ||
              findCol(row, CODE_SLUGS);

            const descRaw =
              normalizeText(cm.description ? row[cm.description] : "") ||
              normalizeText(findCol(row, DESC_SLUGS));

            const rawZone =
              normalizeText(cm.zone ? row[cm.zone] : "") ||
              normalizeText(findCol(row, ZONE_SLUGS));

            if (!rawCodeValue && !descRaw) {
              result.skipped++;
              continue;
            }

            const split = splitCodeAndReason(rawCodeValue || descRaw);
            const code = normalizeCode(split.code);
            const reason = normalizeText(descRaw || split.reason || code);

            if (!code) {
              result.errors.push(formatRowError(rowIndex + 1, "Missing rejection code"));
              result.skipped++;
              continue;
            }

            if (existingRejKeys.has(code)) {
              result.skipped++;
              continue;
            }

            const created = await new Promise<(typeof localRejTypes)[0]>((resolve, reject) => {
              createRejType.mutate(
                {
                  rejectionCode: code,
                  reason: reason || code,
                  type: rawZone || "rejection",
                },
                {
                  onSuccess: (t) => resolve(t),
                  onError: reject,
                }
              );
            });

            localRejTypes.push(created);
            existingRejKeys.add(code);
            result.added++;
          } catch (error) {
            result.errors.push(
              formatRowError(rowIndex + 1, "Failed to create rejection reason", String(error))
            );
            result.skipped++;
          }
        }
      } else if (importType === "rework-types") {
        for (let rowIndex = 0; rowIndex < section.rows.length; rowIndex++) {
          const row = section.rows[rowIndex];

          try {
            const n = normalizeToModel(row, cm, section.sheet);

            const rawCode =
              normalizeText(cm.reworkCode ? row[cm.reworkCode] : "") ||
              normalizeText(n.rejectionCode) ||
              normalizeText(findCol(row, REWORK_SLUGS));

            const rawReason =
              normalizeText(cm.description ? row[cm.description] : "") ||
              normalizeText(findCol(row, DESC_SLUGS));

            const rawZone =
              normalizeText(cm.zone ? row[cm.zone] : "") ||
              normalizeText(findCol(row, ZONE_SLUGS));

            if (!rawCode && !rawReason) {
              result.skipped++;
              continue;
            }

            const split = splitCodeAndReason(rawCode || rawReason);
            const code = normalizeCode(split.code);
            const reason = normalizeText(rawReason || split.reason || code);

            if (!code) {
              result.errors.push(formatRowError(rowIndex + 1, "Missing rework code"));
              result.skipped++;
              continue;
            }

            if (existingReworkKeys.has(code)) {
              result.skipped++;
              continue;
            }

            const created = await new Promise<(typeof localReworkTypes)[0]>((resolve, reject) => {
              createReworkType.mutate(
                {
                  reworkCode: code,
                  reason: reason || "",
                  zone: rawZone || undefined,
                },
                {
                  onSuccess: (t) => resolve(t),
                  onError: reject,
                }
              );
            });

            localReworkTypes.push(created);
            existingReworkKeys.add(code);
            result.added++;
          } catch (error) {
            result.errors.push(
              formatRowError(rowIndex + 1, "Failed to create rework type", String(error))
            );
            result.skipped++;
          }
        }
      }

      allResults.push(result);
    }

    queryClient.invalidateQueries({ queryKey: ["/api/parts"] });
    queryClient.invalidateQueries({ queryKey: ["/api/rejection-types"] });
    queryClient.invalidateQueries({ queryKey: ["/api/rework-types"] });
    queryClient.invalidateQueries({ queryKey: ["/api/rejection-entries"] });
    queryClient.invalidateQueries({ queryKey: ["/api/reports/summary"] });

    setResults(allResults);
    setImporting(false);

    const totalAdded = allResults.reduce((sum, r) => sum + r.added, 0);
    const totalSkipped = allResults.reduce((sum, r) => sum + r.skipped, 0);
    const totalErrors = allResults.reduce((sum, r) => sum + r.errors.length, 0);

    toast({
      title: "Import complete",
      description: `${totalAdded} added, ${totalSkipped} skipped, ${totalErrors} errors.`,
      variant: totalErrors > 0 ? "destructive" : "default",
    });
  };

  const renderPreviewTable = (section: ImportSection) => {
    const cm = section.columnMap;
    const rows = section.rows.slice(0, 50);

    if (importType === "parts") {
      const partNameCol = cm.partNumber ?? findBestTextColumn(section.allHeaders, section.rows) ?? section.allHeaders[0];
      const descCol = cm.description !== partNameCol ? cm.description : null;
      const priceCol = cm.rate ?? cm.amount;

      return (
        <div className="overflow-x-auto rounded border border-border">
          <table className="text-xs w-full">
            <thead>
              <tr className="bg-muted/60">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Part Name</th>
                {descCol && <th className="px-3 py-2 text-left font-medium text-muted-foreground">Description</th>}
                {priceCol && <th className="px-3 py-2 text-right font-medium text-muted-foreground">Price</th>}
              </tr>
            </thead>
            <tbody>
              {rows
                .filter((r) => isPartNameLike((partNameCol ? r[partNameCol] : "") || ""))
                .map((row, i) => (
                  <tr key={i} className="border-t border-border hover:bg-muted/30">
                    <td className="px-3 py-1.5 max-w-[220px] truncate font-mono">
                      {(partNameCol ? row[partNameCol] : "") || <span className="opacity-30">—</span>}
                    </td>
                    {descCol && (
                      <td className="px-3 py-1.5 max-w-[200px] truncate">
                        {row[descCol] || <span className="opacity-30">—</span>}
                      </td>
                    )}
                    {priceCol && (
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {row[priceCol] || <span className="opacity-30">—</span>}
                      </td>
                    )}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (importType === "rejection-reasons") {
      const codeCol = cm.rejectionCode ?? cm.partNumber ?? section.allHeaders[0];
      const descCol = cm.description;
      const zoneCol = cm.zone;

      return (
        <div className="overflow-x-auto rounded border border-border">
          <table className="text-xs w-full">
            <thead>
              <tr className="bg-muted/60">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Code</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Reason / Description</th>
                {zoneCol && <th className="px-3 py-2 text-left font-medium text-muted-foreground">Zone</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const rawCode = (codeCol ? row[codeCol] : "") || "";
                const { code, reason } = splitCodeAndReason(rawCode);
                const desc = (descCol ? row[descCol] : "") || reason;
                const zone = zoneCol ? row[zoneCol] : "";

                return (
                  <tr key={i} className="border-t border-border hover:bg-muted/30">
                    <td className="px-3 py-1.5 font-mono font-medium w-32">
                      {code || <span className="opacity-30">—</span>}
                    </td>
                    <td className="px-3 py-1.5 max-w-[240px] truncate">
                      {desc || <span className="opacity-30">—</span>}
                    </td>
                    {zoneCol && (
                      <td className="px-3 py-1.5 max-w-[160px] truncate text-muted-foreground">
                        {zone || <span className="opacity-30">—</span>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    }

    if (importType === "rework-types") {
      const codeCol = cm.reworkCode ?? cm.rejectionCode ?? section.allHeaders[0];
      const descCol = cm.description;
      const zoneCol = cm.zone;

      return (
        <div className="overflow-x-auto rounded border border-border">
          <table className="text-xs w-full">
            <thead>
              <tr className="bg-muted/60">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Rework Code</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Reason / Description</th>
                {zoneCol && <th className="px-3 py-2 text-left font-medium text-muted-foreground">Zone</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const code = (codeCol ? row[codeCol] : "") || "";
                const desc = (descCol ? row[descCol] : "") || "";
                const zone = zoneCol ? row[zoneCol] : "";

                return (
                  <tr key={i} className="border-t border-border hover:bg-muted/30">
                    <td className="px-3 py-1.5 font-mono font-medium w-36">
                      {code || <span className="opacity-30">—</span>}
                    </td>
                    <td className="px-3 py-1.5 max-w-[240px] truncate">
                      {desc || <span className="opacity-30">—</span>}
                    </td>
                    {zoneCol && (
                      <td className="px-3 py-1.5 max-w-[160px] truncate text-muted-foreground">
                        {zone || <span className="opacity-30">—</span>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    }

    return null;
  };

  const hasData = sections.length > 0;

  return (
    <div className="space-y-6">
      <Card className="border-dashed border-2 border-border/60 hover:border-primary/40 transition-colors">
        <CardContent className="flex flex-col items-center justify-center py-10 gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <FileSpreadsheet className="w-6 h-6 text-primary" />
          </div>

          <div className="text-center">
            <p className="font-semibold text-foreground">Upload your {config.label} file</p>
            <p className="text-sm text-muted-foreground mt-1">
              Supports .csv, .xlsx, .xls, .xlsm — multi-sheet Excel supported
            </p>
          </div>

          <Button onClick={() => fileInputRef.current?.click()} disabled={parsing || importing} data-testid={`button-upload-${importType}`}>
            <Upload className="w-4 h-4 mr-2" />
            {parsing ? "Reading file…" : "Choose File"}
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.xlsm"
            onChange={handleFile}
            className="hidden"
            data-testid={`input-file-${importType}`}
          />

          {fileName && <p className="text-xs text-muted-foreground">{fileName}</p>}
        </CardContent>
      </Card>

      <div className="text-sm text-muted-foreground bg-muted/40 rounded-lg border border-border p-4 space-y-2">
        <p className="font-medium text-foreground">Accepted column headers:</p>
        <div className="flex flex-wrap gap-1">
          {config.primaryHeaders.map((h) => (
            <span key={h} className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
              {h}
            </span>
          ))}
        </div>
        {config.priceHeaders && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-muted-foreground text-xs">price column:</span>
            {config.priceHeaders.map((h) => (
              <span key={h} className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                {h}
              </span>
            ))}
          </div>
        )}
        <p className="text-xs">{config.helpNote}</p>
      </div>

      {hasData && (
        <div className="space-y-4">
          {sections.map((section, i) => (
            <Card key={i} className="border-border/50 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-border/50 bg-muted/20">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <button
                      className="flex items-center gap-2 font-medium text-foreground hover:text-primary"
                      onClick={() => toggleSection(i)}
                      data-testid={`button-toggle-section-${importType}-${i}`}
                    >
                      {expandedSections.has(i) ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      {section.sheet}
                    </button>
                    {typeBadge(section.type)}
                    <ConfidenceBadge confidence={section.confidence} />
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">{section.rows.length} rows</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => setMappingSection(mappingSection === i ? null : i)}
                      data-testid={`button-map-${importType}-${i}`}
                    >
                      <Wand2 className="w-3 h-3 mr-1" />
                      Map Columns
                    </Button>
                  </div>
                </div>
              </div>

              {mappingSection === i && (
                <div className="p-4 border-b border-border/50 bg-muted/10">
                  <p className="text-xs font-medium text-muted-foreground mb-3">Column Mapping</p>
                  <ColumnMappingEditor
                    section={section}
                    onApply={(cm) => applyManualMapping(i, cm)}
                    onCancel={() => setMappingSection(null)}
                  />
                </div>
              )}

              {expandedSections.has(i) && (
                <div className="p-4 space-y-2">
                  {renderPreviewTable(section)}
                  {section.rows.length > 50 && (
                    <p className="text-xs text-muted-foreground italic text-center">
                      Showing first 50 of {section.rows.length} rows
                    </p>
                  )}
                </div>
              )}
            </Card>
          ))}

          {!results.length && (
            <div className="flex justify-end">
              <Button
                onClick={runImport}
                disabled={importing || !sections.length}
                className="shadow-md shadow-primary/20"
                data-testid={`button-import-${importType}`}
              >
                {importing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2" />
                    Importing…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Import {config.label}
                  </>
                )}
              </Button>
            </div>
          )}

          {results.length > 0 && (
            <div className="space-y-3">
              {results.map((r, i) => (
                <Card
                  key={i}
                  className={`border-border/50 shadow-sm overflow-hidden ${r.errors.length > 0 ? "border-destructive/30" : ""}`}
                >
                  <div className="p-4 flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      {r.errors.length > 0 ? (
                        <XCircle className="w-5 h-5 text-destructive shrink-0" />
                      ) : r.added > 0 ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-yellow-500 shrink-0" />
                      )}

                      <div>
                        <p className="font-medium text-sm text-foreground">{r.section.sheet}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.added} added · {r.skipped} skipped
                          {r.errors.length > 0 && ` · ${r.errors.length} errors`}
                        </p>
                      </div>
                    </div>

                    <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-400/30">
                      {r.added} {config.label.toLowerCase()}
                    </Badge>
                  </div>

                  {r.errors.length > 0 && (
                    <div className="px-4 pb-3">
                      <p className="text-xs text-destructive font-medium mb-1">Failed rows and reasons:</p>
                      <ul className="text-xs text-destructive/80 space-y-0.5 max-h-24 overflow-y-auto">
                        {r.errors.slice(0, 10).map((e, j) => (
                          <li key={j}>• {e}</li>
                        ))}
                        {r.errors.length > 10 && <li className="italic">…{r.errors.length - 10} more</li>}
                      </ul>
                    </div>
                  )}
                </Card>
              ))}

              <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSections([]);
                    setResults([]);
                    setFileName(null);
                  }}
                  data-testid={`button-reset-${importType}`}
                >
                  Import Another File
                </Button>
              </div>
            </div>
          )}

          {skippedSheets.length > 0 && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer hover:text-foreground">
                {skippedSheets.length} sheet(s) skipped
              </summary>
              <ul className="mt-2 space-y-1 pl-4 list-disc list-inside">
                {skippedSheets.map((s, i) => (
                  <li key={i}>
                    <strong>{s.name}</strong>: {s.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function ImportData() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Import Data</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Select a category below and upload your file — each tab has its own independent import dataset.
        </p>
      </div>

      <Tabs defaultValue="parts" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:inline-flex">
          <TabsTrigger value="parts" data-testid="tab-import-parts">Parts</TabsTrigger>
          <TabsTrigger value="rejection-reasons" data-testid="tab-import-rejection-reasons">
            Rejection Reasons
          </TabsTrigger>
          <TabsTrigger value="rework-types" data-testid="tab-import-rework-types">Rework Types</TabsTrigger>
        </TabsList>

        <TabsContent value="parts">
          <TypedImportPanel importType="parts" />
        </TabsContent>

        <TabsContent value="rejection-reasons">
          <TypedImportPanel importType="rejection-reasons" />
        </TabsContent>

        <TabsContent value="rework-types">
          <TypedImportPanel importType="rework-types" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
