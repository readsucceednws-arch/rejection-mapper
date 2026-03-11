import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { useRejectionEntries, useCreateRejectionEntry } from "@/hooks/use-rejection-entries";
import { useReworkEntries } from "@/hooks/use-rework-entries";
import { useParts } from "@/hooks/use-parts";
import { useRejectionTypes } from "@/hooks/use-rejection-types";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ClipboardX, Filter, AlertTriangle, RefreshCw, ListOrdered, Download, Upload } from "lucide-react";
import type { RejectionEntryResponse, ReworkEntryResponse } from "@shared/schema";

async function parseFile(file: File): Promise<Record<string, string>[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "xlsx" || ext === "xls" || ext === "xlsm") {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
    if (rows.length < 2) return [];
    const headers = (rows[0] as string[]).map((h) => String(h ?? "").toLowerCase().trim());
    return (rows.slice(1) as any[][]).map((row) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? String(row[i]).trim() : ""; });
      return obj;
    });
  }
  const text = await file.text();
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.replace(/^"|"$/g, "").trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const values = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g) ?? line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (values[i] ?? "").replace(/^"|"$/g, "").trim(); });
    return row;
  });
}

type UnifiedEntry =
  | { source: "rejection"; data: RejectionEntryResponse }
  | { source: "rework"; data: ReworkEntryResponse };

function exportToCSV(entries: UnifiedEntry[], filename: string) {
  const headers = ["Date", "Part Number", "Code", "Reason", "Purpose", "Quantity", "Remarks"];
  const rows = entries.map((entry) => {
    if (entry.source === "rejection") {
      const e = entry.data;
      return [
        format(new Date(e.date), "yyyy-MM-dd HH:mm"),
        e.part.partNumber,
        e.rejectionType.rejectionCode,
        e.rejectionType.reason,
        e.rejectionType.type,
        e.quantity,
        e.remarks || "",
      ];
    } else {
      const e = entry.data;
      return [
        format(new Date(e.date), "yyyy-MM-dd HH:mm"),
        e.part.partNumber,
        e.reworkType.reworkCode,
        e.reworkType.reason,
        "rework",
        e.quantity,
        e.remarks || "",
      ];
    }
  });

  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function DateFilterBar({
  onApply,
  onClear,
  hasFilters,
}: {
  onApply: (start: string, end: string) => void;
  onClear: () => void;
  hasFilters: boolean;
}) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  return (
    <div className="flex items-center gap-2 bg-card p-1.5 rounded-lg border border-border/50 shadow-sm flex-wrap">
      <div className="flex items-center gap-2 px-2">
        <Input type="date" className="h-8 text-xs border-0 bg-transparent w-32" value={start} onChange={(e) => setStart(e.target.value)} />
        <span className="text-muted-foreground text-xs">to</span>
        <Input type="date" className="h-8 text-xs border-0 bg-transparent w-32" value={end} onChange={(e) => setEnd(e.target.value)} />
      </div>
      <Button size="sm" onClick={() => onApply(start, end)} className="h-8" data-testid="button-filter">
        <Filter className="w-3 h-3 mr-1" />
        Filter
      </Button>
      {hasFilters && (
        <Button size="sm" variant="ghost" onClick={() => { setStart(""); setEnd(""); onClear(); }} className="h-8 text-destructive">
          Clear
        </Button>
      )}
    </div>
  );
}

function EntriesTable({
  entries,
  isLoading,
}: {
  entries: UnifiedEntry[];
  isLoading: boolean;
}) {
  return (
    <Card className="border-border/50 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Part Number</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Purpose</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="max-w-[260px]">Remarks</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  <div className="flex flex-col items-center">
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mb-2"></div>
                    Loading entries...
                  </div>
                </TableCell>
              </TableRow>
            ) : entries.length > 0 ? (
              entries.map((entry) => {
                if (entry.source === "rejection") {
                  const e = entry.data;
                  const isRework = e.rejectionType.type === "rework";
                  return (
                    <TableRow key={`rej-${e.id}`} className="hover:bg-muted/20 transition-colors" data-testid={`row-entry-rej-${e.id}`}>
                      <TableCell className="whitespace-nowrap font-medium text-muted-foreground text-sm">
                        {format(new Date(e.date), "MMM d, yyyy h:mm a")}
                      </TableCell>
                      <TableCell className="font-semibold text-primary">{e.part.partNumber}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={isRework ? "bg-blue-500/10 text-blue-600 border-blue-400/30" : "bg-destructive/10 text-destructive border-destructive/20"}>
                          {e.rejectionType.rejectionCode}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm font-medium">{e.rejectionType.reason}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={isRework ? "bg-blue-500/10 text-blue-600 border-blue-400/30 capitalize" : "bg-destructive/10 text-destructive border-destructive/20 capitalize"}>
                          {e.rejectionType.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-display font-bold text-lg">{e.quantity}</TableCell>
                      <TableCell className="text-sm text-muted-foreground truncate max-w-[260px]" title={e.remarks || ""}>
                        {e.remarks || "—"}
                      </TableCell>
                    </TableRow>
                  );
                } else {
                  const e = entry.data;
                  return (
                    <TableRow key={`rw-${e.id}`} className="hover:bg-muted/20 transition-colors" data-testid={`row-entry-rw-${e.id}`}>
                      <TableCell className="whitespace-nowrap font-medium text-muted-foreground text-sm">
                        {format(new Date(e.date), "MMM d, yyyy h:mm a")}
                      </TableCell>
                      <TableCell className="font-semibold text-primary">{e.part.partNumber}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-400/30">
                          {e.reworkType.reworkCode}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm font-medium">{e.reworkType.reason}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-400/30">
                          Rework
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-display font-bold text-lg">{e.quantity}</TableCell>
                      <TableCell className="text-sm text-muted-foreground truncate max-w-[260px]" title={e.remarks || ""}>
                        {e.remarks || "—"}
                      </TableCell>
                    </TableRow>
                  );
                }
              })
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-16">
                  <div className="flex flex-col items-center justify-center text-muted-foreground">
                    <ClipboardX className="h-10 w-10 mb-3 opacity-20" />
                    <p className="text-lg font-medium">No entries found</p>
                    <p className="text-sm mt-1">Try adjusting your date filters or log a new entry.</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

export default function RecentEntries() {
  const [filters, setFilters] = useState<{ startDate?: string; endDate?: string }>({});
  const [activeTab, setActiveTab] = useState("all");
  const [isImporting, setIsImporting] = useState(false);
  const [gsheetUrl, setGsheetUrl] = useState("");
  const [gsheetLoading, setGsheetLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const { data: parts } = useParts();
  const { data: rejectionTypes } = useRejectionTypes();
  const createMutation = useCreateRejectionEntry();

  const { data: rejectionEntries, isLoading: rejLoading } = useRejectionEntries(filters);
  const { data: reworkEntries, isLoading: rwLoading } = useReworkEntries(filters);

  const isLoading = rejLoading || rwLoading;

  const allEntries: UnifiedEntry[] = [
    ...(rejectionEntries ?? []).map((d): UnifiedEntry => ({ source: "rejection", data: d })),
    ...(reworkEntries ?? []).map((d): UnifiedEntry => ({ source: "rework", data: d })),
  ].sort((a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime());

  const rejectionOnlyEntries = allEntries.filter(
    (e) => e.source === "rejection" && (e.data as RejectionEntryResponse).rejectionType.type === "rejection"
  );

  const reworkOnlyEntries = allEntries.filter(
    (e) =>
      e.source === "rework" ||
      (e.source === "rejection" && (e.data as RejectionEntryResponse).rejectionType.type === "rework")
  );

  const currentEntries =
    activeTab === "rejection" ? rejectionOnlyEntries :
    activeTab === "rework" ? reworkOnlyEntries :
    allEntries;

  const handleExport = () => {
    const dateStr = format(new Date(), "yyyy-MM-dd");
    const tabLabel = activeTab === "rejection" ? "rejections" : activeTab === "rework" ? "reworks" : "all";
    exportToCSV(currentEntries, `rejectmap-${tabLabel}-${dateStr}.csv`);
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = "";

    const rows = await parseFile(file);
    if (!rows.length) {
      toast({ title: "Import Failed", description: "File is empty or has no valid data rows.", variant: "destructive" });
      return;
    }

    setIsImporting(true);
    let successCount = 0;
    let failCount = 0;

    for (const row of rows) {
      const partNumber = row["part number"] || row["partnumber"] || row["part"];
      const codeOrReason = row["code"] || row["reason"] || row["rejection code"] || row["rework code"] || "";
      const quantity = parseInt(row["quantity"] || row["qty"] || "1") || 1;
      const remarks = row["remarks"] || row["notes"] || "";

      const part = parts?.find(p => p.partNumber.toLowerCase() === partNumber?.toLowerCase());
      const rejType = rejectionTypes?.find(
        t => t.rejectionCode.toLowerCase() === codeOrReason.toLowerCase() ||
             t.reason.toLowerCase() === codeOrReason.toLowerCase()
      );

      if (!part || !rejType) { failCount++; continue; }

      try {
        await new Promise<void>((resolve, reject) => {
          createMutation.mutate(
            { partId: part.id, rejectionTypeId: rejType.id, quantity, remarks: remarks || undefined },
            { onSuccess: () => resolve(), onError: reject }
          );
        });
        successCount++;
      } catch { failCount++; }
    }

    setIsImporting(false);
    await queryClient.invalidateQueries({ queryKey: ["/api/rejection-entries"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/rework-entries"] });

    if (successCount > 0) {
      toast({
        title: "Import Complete",
        description: `${successCount} entries imported${failCount > 0 ? `, ${failCount} skipped (unknown part/code)` : ""}.`,
      });
    } else {
      toast({
        title: "Import Failed",
        description: "No entries could be imported. Check that part numbers and reason codes match exactly.",
        variant: "destructive",
      });
    }
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
      const rows = await parseFile(file);
      if (!rows.length) { toast({ title: "Import Failed", description: "Sheet is empty or has no valid data rows.", variant: "destructive" }); return; }
      setIsImporting(true);
      let successCount = 0; let failCount = 0;
      for (const row of rows) {
        const partNumber = row["part number"] || row["partnumber"] || row["part"];
        const codeOrReason = row["code"] || row["reason"] || row["rejection code"] || row["rework code"] || "";
        const quantity = parseInt(row["quantity"] || row["qty"] || "1") || 1;
        const remarks = row["remarks"] || row["notes"] || "";
        const part = parts?.find(p => p.partNumber.toLowerCase() === partNumber?.toLowerCase());
        const rejType = rejectionTypes?.find(t => t.rejectionCode.toLowerCase() === codeOrReason.toLowerCase() || t.reason.toLowerCase() === codeOrReason.toLowerCase());
        if (!part || !rejType) { failCount++; continue; }
        try {
          await new Promise<void>((resolve, reject) => {
            createMutation.mutate({ partId: part.id, rejectionTypeId: rejType.id, quantity, remarks: remarks || undefined }, { onSuccess: () => resolve(), onError: reject });
          });
          successCount++;
        } catch { failCount++; }
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/rejection-entries"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/rework-entries"] });
      setIsImporting(false);
      toast({ title: successCount > 0 ? "Import complete" : "Nothing imported", description: `${successCount} entries imported${failCount > 0 ? `, ${failCount} skipped` : ""}.`, variant: successCount === 0 ? "destructive" : "default" });
    } catch {
      toast({ title: "Error", description: "Failed to fetch Google Sheet.", variant: "destructive" });
    } finally {
      setGsheetLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Recent Entries</h1>
          <p className="text-muted-foreground mt-1 text-sm">Detailed logs of all rejected and reworked parts</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DateFilterBar
            onApply={(start, end) => setFilters({ startDate: start || undefined, endDate: end || undefined })}
            onClear={() => setFilters({})}
            hasFilters={!!(filters.startDate || filters.endDate)}
          />
          <div className="flex items-center gap-1 border border-border rounded-lg px-2 bg-card h-9">
            <Input
              placeholder="Google Sheets URL..."
              value={gsheetUrl}
              onChange={(e) => setGsheetUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleGSheetImport()}
              className="h-7 border-0 bg-transparent text-xs w-52 focus-visible:ring-0 px-1"
              disabled={gsheetLoading || isImporting}
              data-testid="input-gsheet-url"
            />
            <Button variant="ghost" size="sm" onClick={handleGSheetImport} disabled={!gsheetUrl.trim() || gsheetLoading || isImporting} className="h-7 px-2 text-xs" data-testid="button-import-gsheet">
              {gsheetLoading ? <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" /> : "Import"}
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.xlsm"
            className="hidden"
            onChange={handleImportCSV}
            data-testid="input-import-csv"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="h-9 gap-2"
            data-testid="button-import-csv"
          >
            <Upload className="w-4 h-4" />
            {isImporting ? "Importing..." : "Import CSV"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={currentEntries.length === 0}
            className="h-9 gap-2"
            data-testid="button-export-csv"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <Tabs defaultValue="all" onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all" className="gap-2" data-testid="tab-all">
            <ListOrdered className="w-4 h-4" />
            All
            <Badge variant="secondary" className="ml-1 text-xs">{allEntries.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="rejection" className="gap-2" data-testid="tab-rejections">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            Rejections
            <Badge variant="secondary" className="ml-1 text-xs text-destructive">{rejectionOnlyEntries.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="rework" className="gap-2" data-testid="tab-reworks">
            <RefreshCw className="w-4 h-4 text-blue-500" />
            Reworks
            <Badge variant="secondary" className="ml-1 text-xs text-blue-500">{reworkOnlyEntries.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <EntriesTable entries={allEntries} isLoading={isLoading} />
        </TabsContent>
        <TabsContent value="rejection" className="mt-4">
          <EntriesTable entries={rejectionOnlyEntries} isLoading={isLoading} />
        </TabsContent>
        <TabsContent value="rework" className="mt-4">
          <EntriesTable entries={reworkOnlyEntries} isLoading={isLoading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
