import { useRef, useState, useEffect } from "react";
import { api } from "@shared/routes";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import {
  useRejectionEntries,
  useCreateRejectionEntry,
  useUpdateRejectionEntry,
  useBulkDeleteRejectionEntries,
} from "@/hooks/use-rejection-entries";
import {
  useReworkEntries,
  useCreateReworkEntry,
  useUpdateReworkEntry,
  useBulkDeleteReworkEntries,
} from "@/hooks/use-rework-entries";
import { useParts } from "@/hooks/use-parts";
import { useRejectionTypes } from "@/hooks/use-rejection-types";
import { useReworkTypes } from "@/hooks/use-rework-types";
import { useUser } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import {
  ClipboardX,
  Filter,
  AlertTriangle,
  RefreshCw,
  ListOrdered,
  Download,
  Upload,
  Trash2,
  Pencil,
} from "lucide-react";
import type { RejectionEntryResponse, ReworkEntryResponse } from "@shared/schema";

function slugify(val: string | undefined): string {
  return (val ?? "")
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const RE_PART = new Set([
  "partnumber",
  "partno",
  "partnum",
  "pn",
  "part",
  "itemno",
  "itemnumber",
  "partcode",
  "materialcode",
  "material",
  "materialno",
]);

const RE_CODE = new Set([
  "code",
  "rejectioncode",
  "rejcode",
  "reworkcode",
  "rwcode",
  "reasoncode",
  "typecode",
  "failurecode",
  "defectcode",
  // Also match "Reason" / "Purpose" column headers used in standard Excel exports
  "reason",
  "purpose",
  "reworkreason",
  "rejectionreason",
]);

const RE_QTY = new Set([
  "quantity",
  "qty",
  "count",
  "amount",
  "units",
  "pcs",
  "pieces",
  "nos",
]);

const RE_REM = new Set([
  "remarks",
  "notes",
  "note",
  "comment",
  "comments",
  "observation",
  "observations",
]);

const RE_DATE = new Set([
  "date",
  "entrydate",
  "logdate",
  "transactiondate",
  "dateofentry",
  "dateofrejection",
  "inspectiondate",
  "entrydt",
]);

function fuzzyFind(row: Record<string, string>, set: Set<string>): string {
  for (const key of Object.keys(row)) {
    const s = slugify(key);
    if (set.has(s) || [...set].some((k) => s.includes(k) || k.includes(s))) {
      if (row[key]?.trim()) return row[key].trim();
    }
  }
  return "";
}

// Safely convert an XLSX cell value to a plain string.
// When cellDates:true is used, date cells become JS Date objects — toString()
// on those gives a locale string like "Wed Apr 01 2026 00:00:00 GMT+0530".
// Instead we format them as "YYYY-MM-DD" so the server receives a clean date.
function xlsxCellToString(cell: any): string {
  if (cell === undefined || cell === null) return "";
  if (cell instanceof Date) {
    const y = cell.getFullYear();
    const m = String(cell.getMonth() + 1).padStart(2, "0");
    const d = String(cell.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(cell).trim();
}

async function parseFile(file: File): Promise<Record<string, string>[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "xlsx" || ext === "xls" || ext === "xlsm") {
    const buffer = await file.arrayBuffer();
    // cellDates:true → date cells become JS Date objects (avoids locale string issues)
    // raw:true → keeps numbers as numbers; we stringify ourselves via xlsxCellToString
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, {
      header: 1,
      raw: true,   // keep raw values so we control stringification
      cellDates: true,
    });

    if (rows.length < 2) return [];

    const headers = (rows[0] as any[])
      .map((h) => xlsxCellToString(h).toLowerCase())
      .filter(Boolean);

    return (rows.slice(1) as any[][])
      .filter((r) =>
        r.some((c) => c !== undefined && c !== null && String(c).trim() !== "")
      )
      .map((row) => {
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => {
          obj[h] = xlsxCellToString(row[i]);
        });
        return obj;
      });
  }

  const text = await file.text();
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0]
    .split(",")
    .map((h) => h.replace(/^"|"$/g, "").trim().toLowerCase());

  return lines.slice(1).map((line) => {
    const values =
      line.match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g) ?? line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (values[i] ?? "").replace(/^"|"$/g, "").trim();
    });
    return row;
  });
}

type UnifiedEntry =
  | { source: "rejection"; data: RejectionEntryResponse }
  | { source: "rework"; data: ReworkEntryResponse };

function getEntryKey(entry: UnifiedEntry): string {
  return entry.source === "rejection"
    ? `rej-${entry.data.id}`
    : `rw-${entry.data.id}`;
}

function resolveZone(val?: string | null): string {
  if (!val || val === "rejection" || val === "rework") return "General";
  return val;
}

function exportToCSV(entries: UnifiedEntry[], filename: string) {
  const headers = [
    "Date",
    "Part Number",
    "Code",
    "Purpose",
    "Zone",
    "Logged By",
    "Quantity",
    "Remarks",
  ];

  const rows = entries.map((entry) => {
    if (entry.source === "rejection") {
      const e = entry.data;
      return [
        format(new Date(e.date), "yyyy-MM-dd HH:mm"),
        e.part.partNumber,
        e.rejectionType.rejectionCode,
        e.rejectionType.type,
        resolveZone(e.rejectionType.type),
        e.loggedByUsername || "",
        e.quantity,
        e.remarks || "",
      ];
    } else {
      const e = entry.data;
      return [
        format(new Date(e.date), "yyyy-MM-dd HH:mm"),
        e.part.partNumber,
        e.reworkType.reworkCode,
        "rework",
        resolveZone(e.reworkType.zone),
        e.loggedByUsername || "",
        e.quantity,
        e.remarks || "",
      ];
    }
  });

  const csv = [headers, ...rows]
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
    )
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
        <Input
          type="date"
          className="h-8 text-xs border-0 bg-transparent w-32"
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
        <span className="text-muted-foreground text-xs">to</span>
        <Input
          type="date"
          className="h-8 text-xs border-0 bg-transparent w-32"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
        />
      </div>

      <Button
        size="sm"
        onClick={() => onApply(start, end)}
        className="h-8"
        data-testid="button-filter"
      >
        <Filter className="w-3 h-3 mr-1" />
        Filter
      </Button>

      {hasFilters && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setStart("");
            setEnd("");
            onClear();
          }}
          className="h-8 text-destructive"
        >
          Clear
        </Button>
      )}
    </div>
  );
}

function EntriesTable({
  entries,
  isLoading,
  isAdmin,
  selectedKeys,
  onToggle,
  onToggleAll,
  onEdit,
}: {
  entries: UnifiedEntry[];
  isLoading: boolean;
  isAdmin: boolean;
  selectedKeys: Set<string>;
  onToggle: (key: string) => void;
  onToggleAll: (entries: UnifiedEntry[]) => void;
  onEdit?: (entry: UnifiedEntry) => void;
}) {
  const allSelected =
    entries.length > 0 && entries.every((e) => selectedKeys.has(getEntryKey(e)));
  const colSpan = isAdmin ? 11 : 10;

  return (
    <Card className="border-border/50 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
              {isAdmin && (
                <TableHead className="w-[44px]">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={() => onToggleAll(entries)}
                    aria-label="Select all"
                    data-testid="checkbox-select-all-entries"
                  />
                </TableHead>
              )}
              <TableHead>Date</TableHead>
              <TableHead>Part Number</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Purpose</TableHead>
              <TableHead>Zone</TableHead>
              <TableHead>Logged By</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="max-w-[260px]">Remarks</TableHead>
              {isAdmin && <TableHead className="w-[60px]"></TableHead>}
            </TableRow>
          </TableHeader>

          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={colSpan}
                  className="text-center py-12 text-muted-foreground"
                >
                  <div className="flex flex-col items-center">
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mb-2"></div>
                    Loading entries...
                  </div>
                </TableCell>
              </TableRow>
            ) : entries.length > 0 ? (
              entries.map((entry) => {
                const key = getEntryKey(entry);
                const isSelected = selectedKeys.has(key);

                if (entry.source === "rejection") {
                  const e = entry.data;
                  const isRework = e.rejectionType.type === "rework";

                  return (
                    <TableRow
                      key={key}
                      className={`hover:bg-muted/20 transition-colors ${
                        isSelected ? "bg-muted/40" : ""
                      }`}
                      data-testid={`row-entry-rej-${e.id}`}
                    >
                      {isAdmin && (
                        <TableCell>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => onToggle(key)}
                            aria-label={`Select entry ${e.id}`}
                            data-testid={`checkbox-entry-rej-${e.id}`}
                          />
                        </TableCell>
                      )}

                      <TableCell className="whitespace-nowrap font-medium text-muted-foreground text-sm">
                        {format(new Date(e.date), "MMM d, yyyy h:mm a")}
                      </TableCell>

                      <TableCell className="font-semibold text-primary">
                        {e.part.partNumber}
                      </TableCell>

                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            isRework
                              ? "bg-blue-500/10 text-blue-600 border-blue-400/30"
                              : "bg-destructive/10 text-destructive border-destructive/20"
                          }
                        >
                          {isRework ? "Rework" : "Rejection"}
                        </Badge>
                      </TableCell>

                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            isRework
                              ? "bg-blue-500/10 text-blue-600 border-blue-400/30"
                              : "bg-destructive/10 text-destructive border-destructive/20"
                          }
                        >
                          {e.rejectionType.rejectionCode}
                        </Badge>
                      </TableCell>

                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            isRework
                              ? "bg-blue-500/10 text-blue-600 border-blue-400/30 capitalize"
                              : "bg-destructive/10 text-destructive border-destructive/20 capitalize"
                          }
                        >
                          {e.rejectionType.type}
                        </Badge>
                      </TableCell>

                      <TableCell className="text-sm text-muted-foreground">
                        {resolveZone(e.rejectionType.type)}
                      </TableCell>

                      <TableCell className="text-sm text-muted-foreground">
                        {e.loggedByUsername || "—"}
                      </TableCell>

                      <TableCell className="text-right font-display font-bold text-lg">
                        {e.quantity}
                      </TableCell>

                      <TableCell
                        className="text-sm text-muted-foreground truncate max-w-[260px]"
                        title={e.remarks || ""}
                      >
                        {e.remarks || "—"}
                      </TableCell>

                      {isAdmin && (
                        <TableCell>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => onEdit?.({ source: "rejection", data: e })}
                            data-testid={`btn-edit-rej-${e.id}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                }

                const e = entry.data;

                return (
                  <TableRow
                    key={key}
                    className={`hover:bg-muted/20 transition-colors ${
                      isSelected ? "bg-muted/40" : ""
                    }`}
                    data-testid={`row-entry-rw-${e.id}`}
                  >
                    {isAdmin && (
                      <TableCell>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => onToggle(key)}
                          aria-label={`Select rework entry ${e.id}`}
                          data-testid={`checkbox-entry-rw-${e.id}`}
                        />
                      </TableCell>
                    )}

                    <TableCell className="whitespace-nowrap font-medium text-muted-foreground text-sm">
                      {format(new Date(e.date), "MMM d, yyyy h:mm a")}
                    </TableCell>

                    <TableCell className="font-semibold text-primary">
                      {e.part.partNumber}
                    </TableCell>

                    <TableCell>
                      <Badge
                        variant="outline"
                        className="bg-blue-500/10 text-blue-600 border-blue-400/30"
                      >
                        Rework
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <Badge
                        variant="outline"
                        className="bg-blue-500/10 text-blue-600 border-blue-400/30"
                      >
                        {e.reworkType.reworkCode}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <Badge
                        variant="outline"
                        className="bg-blue-500/10 text-blue-600 border-blue-400/30"
                      >
                        Rework
                      </Badge>
                    </TableCell>

                    <TableCell className="text-sm text-muted-foreground">
                      {resolveZone(e.reworkType.zone)}
                    </TableCell>

                    <TableCell className="text-sm text-muted-foreground">
                      {e.loggedByUsername || "—"}
                    </TableCell>

                    <TableCell className="text-right font-display font-bold text-lg">
                      {e.quantity}
                    </TableCell>

                    <TableCell
                      className="text-sm text-muted-foreground truncate max-w-[260px]"
                      title={e.remarks || ""}
                    >
                      {e.remarks || "—"}
                    </TableCell>

                    {isAdmin && (
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => onEdit?.({ source: "rework", data: e })}
                          data-testid={`btn-edit-rw-${e.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={colSpan} className="text-center py-16">
                  <div className="flex flex-col items-center justify-center text-muted-foreground">
                    <ClipboardX className="h-10 w-10 mb-3 opacity-20" />
                    <p className="text-lg font-medium">No entries found</p>
                    <p className="text-sm mt-1">
                      Try adjusting your date filters or log a new entry.
                    </p>
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
  const ITEMS_PER_PAGE = 150;

  const [filters, setFilters] = useState<{ startDate?: string; endDate?: string }>(
    {}
  );
  const [activeTab, setActiveTab] = useState("all");
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    processed: number; total: number; successful: number; failed: number; message: string;
  } | null>(null);
  const [gsheetUrl, setGsheetUrl] = useState("");
  const [gsheetLoading, setGsheetLoading] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<UnifiedEntry | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileInputKey, setFileInputKey] = useState(0); // increment to force-reset the file input
  const cancelImportRef = useRef(false); // set to true to stop the import loop mid-flight
  const isMountedRef = useRef(true);    // set to false on unmount to guard all state setters
  const { toast } = useToast();

  const { data: currentUser } = useUser();
  const isAdmin = currentUser?.role === "admin";

  const { data: parts } = useParts();
  const { data: rejectionTypes } = useRejectionTypes();
  const { data: reworkTypes } = useReworkTypes();

  const createRejectionMutation = useCreateRejectionEntry();
  const createReworkMutation = useCreateReworkEntry();
  const updateRejectionMutation = useUpdateRejectionEntry();
  const updateReworkMutation = useUpdateReworkEntry();
  const bulkDeleteRejectionMutation = useBulkDeleteRejectionEntries();
  const bulkDeleteReworkMutation = useBulkDeleteReworkEntries();

  const { data: rejectionEntries, isLoading: rejLoading } =
    useRejectionEntries(filters);
  const { data: reworkEntries, isLoading: rwLoading } = useReworkEntries(filters);

  const isLoading = rejLoading || rwLoading;

  const allEntries: UnifiedEntry[] = [
    ...(rejectionEntries ?? []).map(
      (d): UnifiedEntry => ({ source: "rejection", data: d })
    ),
    ...(reworkEntries ?? []).map(
      (d): UnifiedEntry => ({ source: "rework", data: d })
    ),
  ].sort(
    (a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime()
  );

  const rejectionOnlyEntries = allEntries.filter(
    (e) =>
      e.source === "rejection" &&
      (e.data as RejectionEntryResponse).rejectionType.type === "rejection"
  );

  const reworkOnlyEntries = allEntries.filter(
    (e) =>
      e.source === "rework" ||
      (e.source === "rejection" &&
        (e.data as RejectionEntryResponse).rejectionType.type === "rework")
  );

  const currentEntries =
    activeTab === "rejection"
      ? rejectionOnlyEntries
      : activeTab === "rework"
      ? reworkOnlyEntries
      : allEntries;

  const filteredEntries =
    searchTerm.trim() === ""
      ? currentEntries
      : currentEntries.filter((entry) => {
          const searchLower = searchTerm.toLowerCase();
          const dateStr = format(new Date(entry.data.date), "yyyy-MM-dd");
          const timeStr = format(new Date(entry.data.date), "HH:mm");
          const partNumber = entry.data.part.partNumber.toLowerCase();
          const code =
            entry.source === "rejection"
              ? entry.data.rejectionType.rejectionCode.toLowerCase()
              : entry.data.reworkType.reworkCode.toLowerCase();
          const zone = resolveZone(
            entry.source === "rejection"
              ? entry.data.rejectionType.type
              : entry.data.reworkType.zone
          ).toLowerCase();
          const loggedBy = (entry.data.loggedByUsername || "").toLowerCase();

          return (
            dateStr.includes(searchLower) ||
            timeStr.includes(searchLower) ||
            partNumber.includes(searchLower) ||
            code.includes(searchLower) ||
            zone.includes(searchLower) ||
            loggedBy.includes(searchLower) ||
            entry.data.remarks?.toLowerCase().includes(searchLower)
          );
        });

  const totalPages = Math.ceil(filteredEntries.length / ITEMS_PER_PAGE);
  const validPage = Math.max(1, Math.min(currentPage, totalPages || 1));
  const startIndex = (validPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedEntries = filteredEntries.slice(startIndex, endIndex);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setSelectedKeys(new Set());
    setCurrentPage(1);
  };

  const someSelected = selectedKeys.size > 0;

  const toggleSelect = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAll = (entries: UnifiedEntry[]) => {
    const allKeys = entries.map(getEntryKey);
    const allSelectedOnPage = allKeys.every((k) => selectedKeys.has(k));

    if (allSelectedOnPage) {
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        allKeys.forEach((k) => next.delete(k));
        return next;
      });
    } else {
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        allKeys.forEach((k) => next.add(k));
        return next;
      });
    }
  };

  const handleBulkDelete = async () => {
    const rejIds: number[] = [];
    const rwIds: number[] = [];

    for (const key of selectedKeys) {
      if (key.startsWith("rej-")) rejIds.push(parseInt(key.slice(4)));
      else if (key.startsWith("rw-")) rwIds.push(parseInt(key.slice(3)));
    }

    try {
      if (rejIds.length > 0) {
        await bulkDeleteRejectionMutation.mutateAsync(rejIds);
      }
      if (rwIds.length > 0) {
        await bulkDeleteReworkMutation.mutateAsync(rwIds);
      }

      toast({
        title: "Deleted",
        description: `${selectedKeys.size} log entr${
          selectedKeys.size !== 1 ? "ies" : "y"
        } removed.`,
      });

      setSelectedKeys(new Set());
      setShowBulkConfirm(false);
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
      setShowBulkConfirm(false);
    }
  };

  const handleExport = () => {
    const dateStr = format(new Date(), "yyyy-MM-dd");
    const tabLabel =
      activeTab === "rejection"
        ? "rejections"
        : activeTab === "rework"
        ? "reworks"
        : "all";

    exportToCSV(filteredEntries, `rejectmap-${tabLabel}-${dateStr}.csv`);
  };

  // Flip isMountedRef on unmount so the import loops stop calling setState
  // and calling toast after the user has navigated away.
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cancelImportRef.current = true; // also stop the loop if mid-flight
    };
  }, []);

  // Always call this after any import attempt (success or failure) to ensure
  // the file input is fully reset and cannot re-fire onChange on re-render.
  const resetFileInput = () => {
    if (fileInputRef.current) fileInputRef.current.value = "";
    setFileInputKey(k => k + 1);
    setImportProgress(null);
  };

  const handleStopImport = () => {
    cancelImportRef.current = true;
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    cancelImportRef.current = false;
    resetFileInput();

    const rows = await parseFile(file);
    if (!rows.length) {
      resetFileInput();
      toast({ title: "Import Failed", description: "File is empty or has no valid data rows.", variant: "destructive" });
      return;
    }

    setIsImporting(true);

    // ── 1. Fire the import on the server and get back an importId immediately ──
    // The server processes everything in the background — tab switches, screen
    // lock, and computer sleep will NOT interrupt it.
    let importId: string;
    try {
      const startRes = await fetch("/api/import-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rows }),
      });
      if (!startRes.ok) {
        const err = await startRes.json();
        throw new Error(err.message || "Failed to start import");
      }
      const startData = await startRes.json();
      importId = startData.importId;
    } catch (err: any) {
      if (isMountedRef.current) {
        toast({ title: "Import Failed", description: err.message, variant: "destructive" });
        setIsImporting(false);
      }
      resetFileInput();
      return;
    }

    // ── 2. Poll for progress every 2 seconds ───────────────────────────────
    // Polling continues even if the user switches tabs — the browser keeps
    // running fetch() in the background. The import itself runs on the server.
    const pollInterval = 2000;
    let pollCount = 0;
    const poll = async (): Promise<void> => {
      pollCount++;
      // If the user clicked Stop Import, cancel on server and stop polling
      if (cancelImportRef.current) {
        await fetch(`/api/import-entries/${importId}/cancel`, {
          method: "POST",
          credentials: "include",
        }).catch(() => {});
        await queryClient.invalidateQueries({ queryKey: [api.rejectionEntries.list.path] });
        await queryClient.invalidateQueries({ queryKey: [api.reworkEntries.list.path] });
        if (isMountedRef.current) {
          toast({ title: "Import Stopped", description: "Import cancelled on the server." });
          setIsImporting(false);
          resetFileInput();
          cancelImportRef.current = false;
        }
        return;
      }

      try {
        const res = await fetch(`/api/import-entries/${importId}/progress`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Lost contact with import");
        const progress = await res.json();

        // Update progress display
        if (isMountedRef.current) {
          setImportProgress({
            processed: progress.processedRows,
            total: progress.totalRows,
            successful: progress.successfulImports,
            failed: progress.failedRows,
            message: progress.message,
          });
        }

        if (progress.status === "running" || progress.status === "pending") {
          // Refresh the table every 3rd poll (every ~6s) so imported rows appear live
          if (pollCount % 3 === 0) {
            queryClient.invalidateQueries({ queryKey: [api.rejectionEntries.list.path] });
            queryClient.invalidateQueries({ queryKey: [api.reworkEntries.list.path] });
          }
          setTimeout(poll, pollInterval);
          return;
        }

        // ── 3. Import finished (done / cancelled / failed) ──────────────────
        await queryClient.invalidateQueries({ queryKey: [api.rejectionEntries.list.path] });
        await queryClient.invalidateQueries({ queryKey: [api.reworkEntries.list.path] });

        if (!isMountedRef.current) return;

        setIsImporting(false);
        setImportProgress(null);
        resetFileInput();

        if (progress.status === "done") {
          const r = progress.result;
          toast({
            title: r?.summary?.successfulImports > 0 ? "Import Complete" : "Import Failed",
            description: r?.message || progress.message,
            variant: r?.summary?.successfulImports > 0 ? "default" : "destructive",
          });
        } else if (progress.status === "cancelled") {
          toast({ title: "Import Stopped", description: progress.message });
        } else {
          toast({ title: "Import Failed", description: progress.message, variant: "destructive" });
        }

      } catch {
        // Network blip — keep polling, don't give up
        setTimeout(poll, pollInterval * 2);
      }
    };

    // Start polling
    setTimeout(poll, pollInterval);
  };

    const handleGSheetImport = async () => {
    if (!gsheetUrl.trim()) return;

    cancelImportRef.current = false;
    setGsheetLoading(true);

    try {
      const res = await fetch(
        `/api/fetch-gsheet?url=${encodeURIComponent(gsheetUrl)}`,
        { credentials: "include" }
      );
      const data = await res.json();

      if (!res.ok) {
        toast({
          title: "Error",
          description: data.message,
          variant: "destructive",
        });
        return;
      }

      const blob = new Blob([data.csv], { type: "text/csv" });
      const file = new File([blob], "google-sheet.csv", { type: "text/csv" });

      setGsheetUrl("");

      const rows = await parseFile(file);
      if (!rows.length) {
        toast({
          title: "Import Failed",
          description: "Sheet is empty or has no valid data rows.",
          variant: "destructive",
        });
        return;
      }

      setIsImporting(true);
      let successCount = 0;
      let failCount = 0;

      for (const row of rows) {
        if (cancelImportRef.current) {
          toast({
            title: "Import Stopped",
            description: `Stopped after ${successCount} imported, ${failCount} skipped.`,
          });
          break;
        }

        const partNumber = fuzzyFind(row, RE_PART);
        const codeOrReason = fuzzyFind(row, RE_CODE);
        const quantity = parseInt(fuzzyFind(row, RE_QTY) || "1") || 1;
        const remarks = fuzzyFind(row, RE_REM);

        const norm = (v: string | null | undefined) =>
          (v ?? "").toLowerCase().replace(/\s+/g, " ").trim();
        const normCode = (v: string | null | undefined) =>
          (v ?? "").toUpperCase().replace(/\s+/g, "").replace(/[\u2010-\u2014]/g, "-");

        const part = parts?.find(
          (p) => norm(p.partNumber) === norm(partNumber)
        );

        const normalizedCodeOrReason = norm(codeOrReason);
        const normalizedCodeUpper = normCode(codeOrReason);

        const reworkType = reworkTypes?.find(
          (t) =>
            normCode(t.reworkCode) === normalizedCodeUpper ||
            norm(t.reason) === normalizedCodeOrReason
        );

        const rejType = rejectionTypes?.find(
          (t) =>
            normCode(t.rejectionCode) === normalizedCodeUpper ||
            norm(t.reason) === normalizedCodeOrReason
        );

        if (!part || (!reworkType && !rejType)) {
          failCount++;
          continue;
        }

        try {
          await new Promise<void>((resolve, reject) => {
            if (reworkType) {
              createReworkMutation.mutate(
                {
                  partId: part.id,
                  reworkTypeId: reworkType.id,
                  quantity,
                  remarks: remarks || undefined,
                },
                { onSuccess: () => resolve(), onError: reject }
              );
            } else if (rejType) {
              createRejectionMutation.mutate(
                {
                  partId: part.id,
                  rejectionTypeId: rejType.id,
                  quantity,
                  remarks: remarks || undefined,
                },
                { onSuccess: () => resolve(), onError: reject }
              );
            }
          });

          successCount++;
        } catch {
          failCount++;
        }
      }

      await queryClient.invalidateQueries({ queryKey: [api.rejectionEntries.list.path] });
      await queryClient.invalidateQueries({ queryKey: [api.reworkEntries.list.path] });

      if (!isMountedRef.current) return;

      setIsImporting(false);

      toast({
        title: successCount > 0 ? "Import complete" : "Nothing imported",
        description: `${successCount} entries imported${
          failCount > 0 ? `, ${failCount} skipped` : ""
        }.`,
        variant: successCount === 0 ? "destructive" : "default",
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to fetch Google Sheet.",
        variant: "destructive",
      });
    } finally {
      if (isMountedRef.current) {
        setGsheetLoading(false);
      }
    }
  };

  const isPendingDelete =
    bulkDeleteRejectionMutation.isPending || bulkDeleteReworkMutation.isPending;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">
            Recent Entries
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Detailed logs of all rejected and reworked parts
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && someSelected && (
            <Button
              variant="destructive"
              onClick={() => setShowBulkConfirm(true)}
              data-testid="button-bulk-delete-entries"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Selected ({selectedKeys.size})
            </Button>
          )}

          <DateFilterBar
            onApply={(start, end) => {
              setFilters({
                startDate: start || undefined,
                endDate: end || undefined,
              });
              setSelectedKeys(new Set());
              setCurrentPage(1);
            }}
            onClear={() => {
              setFilters({});
              setSelectedKeys(new Set());
              setCurrentPage(1);
            }}
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
            <Button
              variant="ghost"
              size="sm"
              onClick={handleGSheetImport}
              disabled={!gsheetUrl.trim() || gsheetLoading || isImporting}
              className="h-7 px-2 text-xs"
              data-testid="button-import-gsheet"
            >
              {gsheetLoading ? (
                <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              ) : (
                "Import"
              )}
            </Button>
          </div>

          <input
            key={fileInputKey}
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.xlsm"
            className="hidden"
            onChange={handleImportCSV}
            data-testid="input-import-csv"
          />

          {isImporting ? (
            <div className="flex items-center gap-2">
              {importProgress && (
                <div className="text-xs text-muted-foreground text-right">
                  <div className="font-medium">
                    {importProgress.processed}/{importProgress.total} rows
                  </div>
                  <div className="text-green-600">✓ {importProgress.successful} imported</div>
                </div>
              )}
              <Button
                variant="destructive"
                size="sm"
                onClick={handleStopImport}
                className="h-9 gap-2"
                data-testid="button-stop-import"
              >
                <span className="w-3 h-3 rounded-sm bg-white inline-block" />
                Stop Import
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="h-9 gap-2"
              data-testid="button-import-csv"
            >
              <Upload className="w-4 h-4" />
              Import CSV
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={filteredEntries.length === 0}
            className="h-9 gap-2"
            data-testid="button-export-csv"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <Tabs defaultValue="all" onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="all" className="gap-2" data-testid="tab-all">
            <ListOrdered className="w-4 h-4" />
            All
            <Badge variant="secondary" className="ml-1 text-xs">
              {allEntries.length}
            </Badge>
          </TabsTrigger>

          <TabsTrigger
            value="rejection"
            className="gap-2"
            data-testid="tab-rejections"
          >
            <AlertTriangle className="w-4 h-4 text-destructive" />
            Rejections
            <Badge
              variant="secondary"
              className="ml-1 text-xs text-destructive"
            >
              {rejectionOnlyEntries.length}
            </Badge>
          </TabsTrigger>

          <TabsTrigger value="rework" className="gap-2" data-testid="tab-reworks">
            <RefreshCw className="w-4 h-4 text-blue-500" />
            Reworks
            <Badge variant="secondary" className="ml-1 text-xs text-blue-500">
              {reworkOnlyEntries.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <div className="mt-4 mb-4">
          <Input
            placeholder="Search by date, time, part number, code, zone, or remarks..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full bg-background focus:ring-primary/20"
            data-testid="input-search-entries"
          />
          {searchTerm && (
            <p className="text-xs text-muted-foreground mt-2">
              Found {filteredEntries.length} matching entr
              {filteredEntries.length !== 1 ? "ies" : "y"} (
              {totalPages > 1 ? `page ${validPage}/${totalPages}` : "1 page"})
            </p>
          )}
        </div>

        <TabsContent value="all" className="mt-4 space-y-4">
          <EntriesTable
            entries={paginatedEntries}
            isLoading={isLoading}
            isAdmin={isAdmin}
            selectedKeys={selectedKeys}
            onToggle={toggleSelect}
            onToggleAll={toggleSelectAll}
            onEdit={setEditingEntry}
          />
          {totalPages > 1 && (
            <PaginationControls
              currentPage={validPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          )}
        </TabsContent>

        <TabsContent value="rejection" className="mt-4 space-y-4">
          <EntriesTable
            entries={paginatedEntries}
            isLoading={isLoading}
            isAdmin={isAdmin}
            selectedKeys={selectedKeys}
            onToggle={toggleSelect}
            onToggleAll={toggleSelectAll}
            onEdit={setEditingEntry}
          />
          {totalPages > 1 && (
            <PaginationControls
              currentPage={validPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          )}
        </TabsContent>

        <TabsContent value="rework" className="mt-4 space-y-4">
          <EntriesTable
            entries={paginatedEntries}
            isLoading={isLoading}
            isAdmin={isAdmin}
            selectedKeys={selectedKeys}
            onToggle={toggleSelect}
            onToggleAll={toggleSelectAll}
            onEdit={setEditingEntry}
          />
          {totalPages > 1 && (
            <PaginationControls
              currentPage={validPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          )}
        </TabsContent>
      </Tabs>

      <AlertDialog open={showBulkConfirm} onOpenChange={setShowBulkConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Selected Entries?</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to permanently delete <strong>{selectedKeys.size}</strong>{" "}
              log entr{selectedKeys.size !== 1 ? "ies" : "y"}. This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-bulk-delete-entries"
            >
              {isPendingDelete ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditEntryDialog
        entry={editingEntry}
        onClose={() => setEditingEntry(null)}
        rejectionTypes={rejectionTypes ?? []}
        reworkTypes={reworkTypes ?? []}
        updateRejection={updateRejectionMutation}
        updateRework={updateReworkMutation}
        toast={toast}
      />
    </div>
  );
}

function PaginationControls({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-2 mt-4 p-4 bg-card border border-border/50 rounded-lg">
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        data-testid="button-prev-page"
      >
        Previous
      </Button>

      <div className="flex items-center gap-1">
        {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
          let pageNum: number;

          if (totalPages <= 7) {
            pageNum = i + 1;
          } else if (currentPage <= 4) {
            pageNum = i + 1;
          } else if (currentPage >= totalPages - 3) {
            pageNum = totalPages - 6 + i;
          } else {
            pageNum = currentPage - 3 + i;
          }

          if (pageNum > totalPages) return null;

          return (
            <Button
              key={pageNum}
              variant={currentPage === pageNum ? "default" : "outline"}
              size="sm"
              onClick={() => onPageChange(pageNum)}
              className="w-10"
              data-testid={`button-page-${pageNum}`}
            >
              {pageNum}
            </Button>
          );
        })}
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        data-testid="button-next-page"
      >
        Next
      </Button>

      <span className="text-xs text-muted-foreground ml-2">
        Page {currentPage} of {totalPages}
      </span>
    </div>
  );
}

function EditEntryDialog({
  entry,
  onClose,
  rejectionTypes,
  reworkTypes,
  updateRejection,
  updateRework,
  toast,
}: {
  entry: UnifiedEntry | null;
  onClose: () => void;
  rejectionTypes: { id: number; rejectionCode: string; reason: string }[];
  reworkTypes: { id: number; reworkCode: string; reason: string }[];
  updateRejection: ReturnType<typeof useUpdateRejectionEntry>;
  updateRework: ReturnType<typeof useUpdateReworkEntry>;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const isRejection = entry?.source === "rejection";
  const e = entry?.data;

  const [typeId, setTypeId] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("");
  const [remarks, setRemarks] = useState<string>("");

  const prevEntry = useRef<UnifiedEntry | null>(null);
  if (entry !== prevEntry.current) {
    prevEntry.current = entry;

    if (entry) {
      if (entry.source === "rejection") {
        const d = entry.data as RejectionEntryResponse;
        setTypeId(String(d.rejectionTypeId));
        setQuantity(String(d.quantity));
        setRemarks(d.remarks ?? "");
      } else {
        const d = entry.data as ReworkEntryResponse;
        setTypeId(String(d.reworkTypeId));
        setQuantity(String(d.quantity));
        setRemarks(d.remarks ?? "");
      }
    }
  }

  const isPending = updateRejection.isPending || updateRework.isPending;

  function handleSave() {
    if (!entry) return;

    const qty = parseInt(quantity);
    if (!typeId || isNaN(qty) || qty < 1) {
      toast({
        title: "Validation Error",
        description: "Type and a positive quantity are required.",
        variant: "destructive",
      });
      return;
    }

    if (entry.source === "rejection") {
      const d = entry.data as RejectionEntryResponse;
      updateRejection.mutate(
        {
          id: d.id,
          data: {
            rejectionTypeId: parseInt(typeId),
            quantity: qty,
            remarks: remarks || null,
          },
        },
        {
          onSuccess: () => {
            toast({ title: "Entry updated" });
            onClose();
          },
          onError: (err: any) =>
            toast({
              title: "Error",
              description: err.message,
              variant: "destructive",
            }),
        }
      );
    } else {
      const d = entry.data as ReworkEntryResponse;
      updateRework.mutate(
        {
          id: d.id,
          data: {
            reworkTypeId: parseInt(typeId),
            quantity: qty,
            remarks: remarks || null,
          },
        },
        {
          onSuccess: () => {
            toast({ title: "Rework entry updated" });
            onClose();
          },
          onError: (err: any) =>
            toast({
              title: "Error",
              description: err.message,
              variant: "destructive",
            }),
        }
      );
    }
  }

  return (
    <Dialog
      open={!!entry}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Edit {isRejection ? "Rejection" : "Rework"} Entry
          </DialogTitle>
          <DialogDescription>
            {e
              ? `Part: ${(e as any).part?.partNumber} — ${format(
                  new Date(e.date),
                  "MMM d, yyyy"
                )}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              {isRejection ? "Rejection Type" : "Rework Type"}
            </label>
            <Select value={typeId} onValueChange={setTypeId} data-testid="select-edit-type">
              <SelectTrigger data-testid="select-trigger-edit-type">
                <SelectValue
                  placeholder={
                    isRejection ? "Select rejection type…" : "Select rework type…"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {isRejection
                  ? rejectionTypes.map((rt) => (
                      <SelectItem
                        key={rt.id}
                        value={String(rt.id)}
                        data-testid={`option-rej-type-${rt.id}`}
                      >
                        {rt.rejectionCode} — {rt.reason}
                      </SelectItem>
                    ))
                  : reworkTypes.map((rw) => (
                      <SelectItem
                        key={rw.id}
                        value={String(rw.id)}
                        data-testid={`option-rw-type-${rw.id}`}
                      >
                        {rw.reworkCode} — {rw.reason}
                      </SelectItem>
                    ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Quantity</label>
            <Input
              type="number"
              min={1}
              value={quantity}
              onChange={(ev) => setQuantity(ev.target.value)}
              data-testid="input-edit-quantity"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Remarks</label>
            <Input
              value={remarks}
              onChange={(ev) => setRemarks(ev.target.value)}
              placeholder="Optional remarks…"
              data-testid="input-edit-remarks"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isPending}
            data-testid="btn-edit-cancel"
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending} data-testid="btn-edit-save">
            {isPending ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
