import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useParts, useCreatePart } from "@/hooks/use-parts";
import { useRejectionTypes, useCreateRejectionType } from "@/hooks/use-rejection-types";
import { useReworkTypes, useCreateReworkType } from "@/hooks/use-rework-types";
import { api } from "@shared/routes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertCircle, ChevronDown, ChevronUp, Link } from "lucide-react";

type Row = Record<string, string>;

type ImportSection = {
  sheet: string;
  type: "parts" | "rejection-reasons" | "rework-types" | "unknown";
  rows: Row[];
};

type ImportResult = {
  section: ImportSection;
  added: number;
  skipped: number;
  errors: string[];
};

function slug(val: string | undefined): string {
  return (val ?? "").toString().toLowerCase().replace(/[^a-z0-9]/g, "");
}

const PART_SLUGS = new Set([
  "partnumber", "partno", "partnum", "pn", "part", "itemno", "itemnum", "itemnumber",
  "partcode", "partid", "materialcode", "material", "materialno",
]);
const REWORK_SLUGS = new Set([
  "reworkcode", "rwcode", "rework", "reworktype", "rwtypecode", "reworkreason",
  "reworkno", "reworknum",
]);
const REJECTION_SLUGS = new Set([
  "rejectioncode", "rejcode", "rejectionreason", "rejreason", "rejection",
  "failurecode", "defectcode", "defect", "ncrcode", "nccode",
]);
const CODE_SLUGS = new Set(["code", "reasoncode", "typecode"]);
const DESC_SLUGS = new Set([
  "description", "desc", "name", "partname", "itemname", "reason", "details",
  "partdescription", "itemdescription",
]);
const PURPOSE_SLUGS = new Set(["purpose", "type", "category", "entrytype"]);
const QTY_SLUGS = new Set(["quantity", "qty", "count", "amount", "units", "pcs", "pieces", "nos"]);
const REMARKS_SLUGS = new Set(["remarks", "notes", "note", "comment", "comments", "observation", "observations"]);

function matchesAny(header: string, set: Set<string>): boolean {
  const s = slug(header);
  if (set.has(s)) return true;
  for (const key of set) {
    if (s.includes(key) || key.includes(s)) return true;
  }
  return false;
}

function findCol(row: Row, set: Set<string>): string {
  for (const key of Object.keys(row)) {
    if (matchesAny(key, set) && row[key]?.trim()) return row[key].trim();
  }
  return "";
}

function getCol(row: Row, ...keys: string[]): string {
  for (const k of keys) {
    const found = Object.keys(row).find((rk) => slug(rk) === slug(k) || matchesAny(rk, new Set([slug(k)])));
    if (found && row[found]?.trim()) return row[found].trim();
  }
  return "";
}

function detectType(headers: string[]): ImportSection["type"] {
  const hasPart = headers.some((h) => matchesAny(h, PART_SLUGS));
  const hasRework = headers.some((h) => matchesAny(h, REWORK_SLUGS));
  const hasRejection = headers.some((h) => matchesAny(h, REJECTION_SLUGS));
  const hasCode = headers.some((h) => matchesAny(h, CODE_SLUGS));
  const hasDesc = headers.some((h) => matchesAny(h, DESC_SLUGS));
  const hasPurpose = headers.some((h) => matchesAny(h, PURPOSE_SLUGS));
  const hasQty = headers.some((h) => matchesAny(h, QTY_SLUGS));

  if (hasRework) return "rework-types";
  if (hasRejection) return "rejection-reasons";
  if (hasPart && hasDesc && !hasCode && !hasQty) return "parts";
  if (hasPart && !hasCode && !hasQty) return "parts";
  if (hasPart && hasDesc && hasCode && !hasQty) return "parts";
  if (hasCode && (hasPurpose || hasDesc)) return "rejection-reasons";
  if (hasCode && !hasPart && !hasQty) return "rejection-reasons";
  if (hasPart && hasQty) return "rejection-reasons";
  if (hasCode) return "rejection-reasons";
  return "unknown";
}

async function parseFileToSections(file: File): Promise<ImportSection[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  const sections: ImportSection[] = [];

  if (ext === "xlsx" || ext === "xls" || ext === "xlsm") {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rawRows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, dateNF: "yyyy-mm-dd hh:mm" });
      if (rawRows.length < 2) continue;
      const headers = (rawRows[0] as string[]).map((h) => String(h ?? "").trim()).filter(Boolean);
      if (!headers.length) continue;
      const rows: Row[] = (rawRows.slice(1) as any[][])
        .filter((r) => r.some((c) => c !== undefined && c !== null && String(c).trim() !== ""))
        .map((r) => {
          const obj: Row = {};
          headers.forEach((h, i) => { obj[h] = r[i] !== undefined ? String(r[i]).trim() : ""; });
          return obj;
        });
      if (!rows.length) continue;
      sections.push({ sheet: sheetName, type: detectType(headers), rows });
    }
    sections.sort((a, b) => {
      const order = { parts: 0, "rejection-reasons": 1, "rework-types": 2, unknown: 3 };
      return order[a.type] - order[b.type];
    });
  } else {
    const text = await file.text();
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return sections;
    const headers = lines[0].split(",").map((h) => h.replace(/^"|"$/g, "").trim());
    const rows: Row[] = lines.slice(1).map((line) => {
      const values = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g) ?? line.split(",");
      const obj: Row = {};
      headers.forEach((h, i) => { obj[h] = (values[i] ?? "").replace(/^"|"$/g, "").trim(); });
      return obj;
    }).filter((r) => Object.values(r).some((v) => v !== ""));
    if (rows.length) sections.push({ sheet: file.name, type: detectType(headers), rows });
  }

  return sections;
}

function typeBadge(type: ImportSection["type"]) {
  const map = {
    "parts": { label: "Parts", className: "bg-primary/10 text-primary border-primary/20" },
    "rejection-reasons": { label: "Rejection Reasons", className: "bg-destructive/10 text-destructive border-destructive/20" },
    "rework-types": { label: "Rework Types", className: "bg-blue-500/10 text-blue-600 border-blue-400/30" },
    "unknown": { label: "Unknown", className: "bg-muted text-muted-foreground border-border" },
  };
  const { label, className } = map[type];
  return <Badge variant="outline" className={className}>{label}</Badge>;
}

export default function ImportData() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sections, setSections] = useState<ImportSection[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [importing, setImporting] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());
  const [fileName, setFileName] = useState<string | null>(null);
  const [gsheetUrl, setGsheetUrl] = useState("");
  const [gsheetLoading, setGsheetLoading] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: existingParts } = useParts();
  const { data: existingRejTypes } = useRejectionTypes();
  const { data: existingReworkTypes } = useReworkTypes();

  const createPart = useCreatePart();
  const createRejType = useCreateRejectionType();
  const createReworkType = useCreateReworkType();

  const processFile = async (file: File) => {
    setFileName(file.name);
    setSections([]);
    setResults([]);
    setParsing(true);
    try {
      const parsed = await parseFileToSections(file);
      setSections(parsed);
      if (!parsed.length) {
        toast({ title: "No data found", description: "The file appears to be empty or unreadable.", variant: "destructive" });
      }
    } catch (err) {
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

    for (const section of sections) {
      const result: ImportResult = { section, added: 0, skipped: 0, errors: [] };

      if (section.type === "parts") {
        for (const row of section.rows) {
          const partNumber = findCol(row, PART_SLUGS);
          const description = findCol(row, DESC_SLUGS);
          if (!partNumber) { result.skipped++; continue; }
          const exists = existingParts?.some(
            (p) => p.partNumber.toLowerCase() === partNumber.toLowerCase()
          );
          if (exists) { result.skipped++; continue; }
          try {
            await new Promise<void>((res, rej) => {
              createPart.mutate(
                { partNumber, description: description || partNumber, price: 0 },
                { onSuccess: () => res(), onError: rej }
              );
            });
            result.added++;
          } catch (err: any) {
            result.errors.push(partNumber);
            result.skipped++;
          }
        }
      } else if (section.type === "rejection-reasons") {
        for (const row of section.rows) {
          const code = findCol(row, REJECTION_SLUGS) || findCol(row, CODE_SLUGS);
          const reason = findCol(row, DESC_SLUGS);
          if (!code) { result.skipped++; continue; }
          const exists = existingRejTypes?.some(
            (t) => t.rejectionCode.toLowerCase() === code.toLowerCase()
          );
          if (exists) { result.skipped++; continue; }
          try {
            await new Promise<void>((res, rej) => {
              createRejType.mutate(
                { rejectionCode: code, reason: reason || "", type: "rejection" },
                { onSuccess: () => res(), onError: rej }
              );
            });
            result.added++;
          } catch (err: any) {
            result.errors.push(code);
            result.skipped++;
          }
        }
      } else if (section.type === "rework-types") {
        for (const row of section.rows) {
          const code = findCol(row, REWORK_SLUGS) || findCol(row, CODE_SLUGS);
          const reason = findCol(row, DESC_SLUGS);
          if (!code) { result.skipped++; continue; }
          const exists = existingReworkTypes?.some(
            (t) => t.reworkCode.toLowerCase() === code.toLowerCase()
          );
          if (exists) { result.skipped++; continue; }
          try {
            await new Promise<void>((res, rej) => {
              createReworkType.mutate(
                { reworkCode: code, reason: reason || "" },
                { onSuccess: () => res(), onError: rej }
              );
            });
            result.added++;
          } catch (err: any) {
            result.errors.push(code);
            result.skipped++;
          }
        }
      } else {
        result.skipped = section.rows.length;
      }

      allResults.push(result);
    }

    queryClient.invalidateQueries({ queryKey: [api.parts.list.path] });
    queryClient.invalidateQueries({ queryKey: [api.rejectionTypes.list.path] });
    queryClient.invalidateQueries({ queryKey: ["/api/rework-types"] });

    setResults(allResults);
    setImporting(false);
    const totalAdded = allResults.reduce((s, r) => s + r.added, 0);
    const totalSkipped = allResults.reduce((s, r) => s + r.skipped, 0);
    toast({
      title: "Import complete",
      description: `${totalAdded} items added, ${totalSkipped} skipped (already exist or no data).`,
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Import Data</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Upload a CSV or Excel file — the system automatically detects Parts, Rejection Reasons, and Rework Types by column headers.
        </p>
      </div>

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
            {parsing ? "Reading file..." : "Choose File"}
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

      <div className="text-sm text-muted-foreground bg-muted/40 rounded-lg border border-border p-4 space-y-2">
        <p className="font-medium text-foreground">Auto-detection — accepted header variations:</p>
        <ul className="space-y-1 list-disc list-inside">
          <li><strong>Parts</strong> — any of: <span className="font-mono text-xs bg-muted px-1 rounded">Part Number</span> <span className="font-mono text-xs bg-muted px-1 rounded">Part No</span> <span className="font-mono text-xs bg-muted px-1 rounded">PN</span> <span className="font-mono text-xs bg-muted px-1 rounded">Material</span> + a description column</li>
          <li><strong>Rejection Reasons</strong> — any of: <span className="font-mono text-xs bg-muted px-1 rounded">Rejection Code</span> <span className="font-mono text-xs bg-muted px-1 rounded">Rej Code</span> <span className="font-mono text-xs bg-muted px-1 rounded">Defect Code</span> <span className="font-mono text-xs bg-muted px-1 rounded">Code</span></li>
          <li><strong>Rework Types</strong> — any of: <span className="font-mono text-xs bg-muted px-1 rounded">Rework Code</span> <span className="font-mono text-xs bg-muted px-1 rounded">RW Code</span> <span className="font-mono text-xs bg-muted px-1 rounded">Rework</span></li>
          <li>Spaces, dots, dashes, and capitalisation in headers are all ignored</li>
          <li>Each sheet in an Excel file is processed separately</li>
          <li>Duplicates (already in the system) are skipped automatically</li>
        </ul>
      </div>

      {sections.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Preview — {sections.length} section{sections.length > 1 ? "s" : ""} detected
            </h2>
            <Button onClick={runImport} disabled={importing || sections.every(s => s.type === "unknown")} data-testid="button-run-import">
              {importing ? "Importing..." : `Import All`}
            </Button>
          </div>

          {sections.map((section, i) => {
            const result = results.find((r) => r.section === section);
            const expanded = expandedSections.has(i);
            return (
              <Card key={i} className="overflow-hidden" data-testid={`card-section-${i}`}>
                <button
                  className="w-full text-left"
                  onClick={() => toggleSection(i)}
                >
                  <CardHeader className="py-3 px-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
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
                        <span className="text-xs text-muted-foreground shrink-0">{section.rows.length} rows</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {result && (
                          <span className="text-xs text-muted-foreground">
                            +{result.added} added, {result.skipped} skipped
                          </span>
                        )}
                        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                      </div>
                    </div>
                  </CardHeader>
                </button>

                {expanded && (
                  <CardContent className="pt-0 px-4 pb-4">
                    {section.type === "unknown" ? (
                      <p className="text-sm text-muted-foreground italic">
                        Could not detect data type from column headers. Expected headers like "Part Number", "Rejection Code", or "Rework Code".
                      </p>
                    ) : (
                      <div className="overflow-x-auto rounded border border-border">
                        <table className="text-xs w-full">
                          <thead>
                            <tr className="bg-muted/50">
                              {Object.keys(section.rows[0] ?? {}).map((h) => (
                                <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {section.rows.slice(0, 5).map((row, ri) => (
                              <tr key={ri} className="border-t border-border">
                                {Object.values(row).map((v, vi) => (
                                  <td key={vi} className="px-3 py-1.5 text-foreground truncate max-w-[200px]">{v}</td>
                                ))}
                              </tr>
                            ))}
                            {section.rows.length > 5 && (
                              <tr className="border-t border-border">
                                <td colSpan={Object.keys(section.rows[0] ?? {}).length} className="px-3 py-2 text-center text-muted-foreground italic">
                                  ...and {section.rows.length - 5} more rows
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
