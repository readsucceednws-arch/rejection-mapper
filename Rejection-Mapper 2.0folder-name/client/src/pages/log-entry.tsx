import { useState, useMemo } from "react";
import { format } from "date-fns";
import { useCreateRejectionEntry } from "@/hooks/use-rejection-entries";
import { useCreateReworkEntry } from "@/hooks/use-rework-entries";
import { useParts } from "@/hooks/use-parts";
import { useRejectionTypes } from "@/hooks/use-rejection-types";
import { useReworkTypes } from "@/hooks/use-rework-types";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  CheckCircle2,
  ChevronsUpDown,
  Check,
  ClipboardList,
  Plus,
  Trash2,
  Calendar,
  Tag,
  Hash,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Part } from "@shared/schema";
import type { RejectionType } from "@shared/schema";
import type { ReworkType } from "@shared/schema";

// ── Types ──────────────────────────────────────────────────────────────────────

type EntryKind = "rework" | "rejection";

interface UnifiedType {
  id: number;
  kind: EntryKind;
  code: string;
  reason: string;
  zone: string | null;
}

interface EntryRow {
  typeId: number | null;
  quantity: string;
}

interface LoggedEntry {
  id: number;
  kind: EntryKind;
  partNumber: string;
  code: string;
  zone: string | null;
  quantity: number;
  date: string;
  remarks?: string;
}

// ── Searchable Select ──────────────────────────────────────────────────────────

function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder,
  searchPlaceholder,
  testId,
  disabled,
}: {
  options: { value: string; label: string; sublabel?: string }[];
  value: string;
  onValueChange: (val: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  testId?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal h-10 px-3 text-left bg-background"
          data-testid={testId}
        >
          <span className={cn("truncate text-sm", !selected && "text-muted-foreground")}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-40" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} className="h-9" />
          <CommandList className="max-h-64">
            <CommandEmpty>No results found.</CommandEmpty>
            {options.map((option) => (
              <CommandItem
                key={option.value}
                value={`${option.label} ${option.sublabel ?? ""}`}
                onSelect={() => { onValueChange(option.value); setOpen(false); }}
              >
                <Check className={cn("mr-2 h-4 w-4 shrink-0", value === option.value ? "opacity-100" : "opacity-0")} />
                <span className="truncate font-medium">{option.label}</span>
                {option.sublabel && (
                  <span className="ml-2 text-xs text-muted-foreground truncate">{option.sublabel}</span>
                )}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ── Row accent colors ──────────────────────────────────────────────────────────

const ROW_ACCENTS = [
  { bg: "bg-sky-50 dark:bg-sky-950/30", border: "border-sky-200 dark:border-sky-800/50", num: "bg-sky-500 text-white" },
  { bg: "bg-violet-50 dark:bg-violet-950/30", border: "border-violet-200 dark:border-violet-800/50", num: "bg-violet-500 text-white" },
  { bg: "bg-emerald-50 dark:bg-emerald-950/30", border: "border-emerald-200 dark:border-emerald-800/50", num: "bg-emerald-500 text-white" },
  { bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-200 dark:border-amber-800/50", num: "bg-amber-500 text-white" },
  { bg: "bg-rose-50 dark:bg-rose-950/30", border: "border-rose-200 dark:border-rose-800/50", num: "bg-rose-500 text-white" },
  { bg: "bg-cyan-50 dark:bg-cyan-950/30", border: "border-cyan-200 dark:border-cyan-800/50", num: "bg-cyan-500 text-white" },
  { bg: "bg-indigo-50 dark:bg-indigo-950/30", border: "border-indigo-200 dark:border-indigo-800/50", num: "bg-indigo-500 text-white" },
  { bg: "bg-orange-50 dark:bg-orange-950/30", border: "border-orange-200 dark:border-orange-800/50", num: "bg-orange-500 text-white" },
];

// ── Main component ─────────────────────────────────────────────────────────────

export default function LogEntry() {
  const { toast } = useToast();
  const { data: parts } = useParts();
  const { data: rejectionTypes } = useRejectionTypes();
  const { data: reworkTypes } = useReworkTypes();
  const createRejection = useCreateRejectionEntry();
  const createRework = useCreateReworkEntry();

  const [partId, setPartId] = useState<string>(() => {
    try { return localStorage.getItem("logEntry_lastPartId") || ""; } catch { return ""; }
  });
  const [kind, setKind] = useState<EntryKind>(() => {
    try { return (localStorage.getItem("logEntry_lastKind") as EntryKind) || "rejection"; } catch { return "rejection"; }
  });
  const [entryDate, setEntryDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [remarks, setRemarks] = useState("");
  const [rows, setRows] = useState<EntryRow[]>([{ typeId: null, quantity: "1" }]);
  const [recentlyLogged, setRecentlyLogged] = useState<LoggedEntry[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const allTypes = useMemo<UnifiedType[]>(() => {
    const rw: UnifiedType[] = (reworkTypes ?? []).map((t: ReworkType) => ({
      id: t.id,
      kind: "rework" as EntryKind,
      code: t.reworkCode,
      reason: t.reason,
      zone: t.zone ?? null,
    }));
    const rej: UnifiedType[] = (rejectionTypes ?? []).map((t: RejectionType) => ({
      id: t.id,
      kind: "rejection" as EntryKind,
      code: t.rejectionCode,
      reason: t.reason,
      // Use t.type as zone label when it's not a generic entry-kind string
      zone: t.type && t.type !== "rejection" && t.type !== "rework" ? t.type : null,
    }));
    return kind === "rework" ? rw : rej;
  }, [reworkTypes, rejectionTypes, kind]);

  const typeOptions = useMemo(() =>
    allTypes.map((t) => ({
      value: String(t.id),
      label: t.code,
      sublabel: t.reason,
    })),
    [allTypes]
  );

  const partOptions = useMemo(() =>
    [...(parts ?? [])]
      .sort((a: Part, b: Part) => a.partNumber.localeCompare(b.partNumber))
      .map((p: Part) => ({ value: String(p.id), label: p.partNumber, sublabel: p.description ?? undefined })),
    [parts]
  );

  const addRow = () => {
    if (rows.length < 8) setRows((prev) => [...prev, { typeId: null, quantity: "1" }]);
  };

  const removeRow = (i: number) => {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  };

  const updateRow = (i: number, patch: Partial<EntryRow>) => {
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  };

  const handleSubmit = async () => {
    if (!partId) {
      toast({ title: "No part selected", description: "Please select a part number.", variant: "destructive" });
      return;
    }

    // FIX: validate quantity explicitly and show error instead of silently skipping
    for (const row of rows) {
      if (row.typeId === null) continue; // unfilled rows are skipped, that's fine
      const qty = parseInt(row.quantity, 10);
      if (isNaN(qty) || qty < 1) {
        toast({ title: "Invalid quantity", description: "All quantities must be a positive number.", variant: "destructive" });
        return;
      }
    }

    const validRows = rows.filter((r) => r.typeId !== null && parseInt(r.quantity, 10) >= 1);
    if (validRows.length === 0) {
      toast({ title: "No entries", description: "Add at least one reason with a valid quantity.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    const part = parts?.find((p: Part) => p.id === parseInt(partId, 10));
    const newLogged: LoggedEntry[] = [];

    try {
      for (const row of validRows) {
        const type = allTypes.find((t) => t.id === row.typeId)!;
        const qty = parseInt(row.quantity, 10);

        await new Promise<void>((resolve, reject) => {
          if (kind === "rework") {
            createRework.mutate(
              { partId: parseInt(partId, 10), reworkTypeId: row.typeId!, quantity: qty, remarks: remarks || undefined, entryDate },
              {
                onSuccess: (created) => {
                  newLogged.push({ id: created.id, kind: "rework", partNumber: part?.partNumber ?? "", code: type.code, zone: type.zone, quantity: qty, date: entryDate });
                  resolve();
                },
                onError: reject,
              }
            );
          } else {
            createRejection.mutate(
              { partId: parseInt(partId, 10), rejectionTypeId: row.typeId!, quantity: qty, remarks: remarks || undefined, entryDate },
              {
                onSuccess: (created) => {
                  newLogged.push({ id: created.id, kind: "rejection", partNumber: part?.partNumber ?? "", code: type.code, zone: type.zone, quantity: qty, date: entryDate });
                  resolve();
                },
                onError: reject,
              }
            );
          }
        });
      }

      setRecentlyLogged((prev) => [...newLogged, ...prev].slice(0, 20));
      toast({
        title: `${newLogged.length} entr${newLogged.length === 1 ? "y" : "ies"} saved`,
        description: `${part?.partNumber} — ${format(new Date(entryDate), "MMM d, yyyy")}`,
      });
      setRows([{ typeId: null, quantity: "1" }]);
      setRemarks("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      toast({ title: "Failed to save", description: message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const filledRows = rows.filter((r) => {
    const qty = parseInt(r.quantity, 10);
    return r.typeId !== null && !isNaN(qty) && qty >= 1;
  }).length;

  return (
    <div className="max-w-2xl space-y-0">

      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <ClipboardList className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-foreground leading-tight">New Entry</h1>
          <p className="text-xs text-muted-foreground">Log rejection or rework data per part</p>
        </div>
      </div>

      {/* Form card */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">

        {/* Section: Header fields */}
        <div className="border-b border-border bg-muted/30 px-5 py-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Entry Details</p>
        </div>

        <div className="p-5 space-y-0 divide-y divide-border/60">

          {/* Date row */}
          <div className="flex items-center gap-4 py-3.5">
            <div className="flex items-center gap-2 w-40 shrink-0">
              <Calendar className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span className="text-sm font-medium text-foreground">Date</span>
              <span className="text-destructive text-xs">*</span>
            </div>
            <Input
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className="h-9 max-w-[180px] text-sm"
              data-testid="input-date"
            />
          </div>

          {/* Part row */}
          <div className="flex items-center gap-4 py-3.5">
            <div className="flex items-center gap-2 w-40 shrink-0">
              <Tag className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span className="text-sm font-medium text-foreground">Part Number</span>
              <span className="text-destructive text-xs">*</span>
            </div>
            <div className="flex-1 max-w-sm">
              <SearchableSelect
                options={partOptions}
                value={partId}
                onValueChange={(val) => {
                  setPartId(val);
                  try { localStorage.setItem("logEntry_lastPartId", val); } catch {}
                }}
                placeholder="Select part..."
                searchPlaceholder="Search part number..."
                testId="select-part"
              />
            </div>
          </div>

          {/* Purpose toggle row */}
          <div className="flex items-center gap-4 py-3.5">
            <div className="flex items-center gap-2 w-40 shrink-0">
              <Hash className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <span className="text-sm font-medium text-foreground">Purpose</span>
              <span className="text-destructive text-xs">*</span>
            </div>
            <div className="flex rounded-lg border border-border overflow-hidden h-9 w-52">
              <button
                type="button"
                onClick={() => {
                  setKind("rejection");
                  setRows([{ typeId: null, quantity: "1" }]);
                  try { localStorage.setItem("logEntry_lastKind", "rejection"); } catch {}
                }}
                className={cn(
                  "flex-1 text-sm font-medium transition-all",
                  kind === "rejection"
                    ? "bg-destructive text-destructive-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted"
                )}
                data-testid="toggle-rejection"
              >
                Rejection
              </button>
              <button
                type="button"
                onClick={() => {
                  setKind("rework");
                  setRows([{ typeId: null, quantity: "1" }]);
                  try { localStorage.setItem("logEntry_lastKind", "rework"); } catch {}
                }}
                className={cn(
                  "flex-1 text-sm font-medium transition-all border-l border-border",
                  kind === "rework"
                    ? "bg-blue-500 text-white"
                    : "bg-background text-muted-foreground hover:bg-muted"
                )}
                data-testid="toggle-rework"
              >
                Rework
              </button>
            </div>
          </div>

          {/* Remarks row */}
          <div className="flex items-start gap-4 py-3.5">
            <div className="flex items-center gap-2 w-40 shrink-0 mt-2">
              <span className="w-3.5 h-3.5 shrink-0" />
              <span className="text-sm font-medium text-foreground">Remarks</span>
            </div>
            <Input
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Optional notes..."
              className="flex-1 max-w-sm h-9 text-sm"
              data-testid="input-remarks"
            />
          </div>
        </div>

        {/* Section: Reason rows */}
        <div className="border-t border-border bg-muted/30 px-5 py-3 flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {kind === "rejection" ? "Rejection" : "Rework"} Reasons
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addRow}
            disabled={rows.length >= 8}
            className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
            data-testid="button-add-row"
          >
            <Plus className="w-3.5 h-3.5" />
            Add row
          </Button>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[40px_1fr_110px_40px] gap-0 px-5 py-2 border-b border-border/60 bg-muted/10">
          <span className="text-xs font-semibold text-muted-foreground">#</span>
          <span className="text-xs font-semibold text-muted-foreground">
            {kind === "rejection" ? "Rejection Reason" : "Rework Reason"}
          </span>
          <span className="text-xs font-semibold text-muted-foreground text-center">Quantity</span>
          <span />
        </div>

        {/* Entry rows */}
        <div className="divide-y divide-border/40">
          {rows.map((row, i) => {
            const accent = ROW_ACCENTS[i % ROW_ACCENTS.length];
            return (
              <div
                key={i}
                data-testid={`entry-row-${i}`}
                className={cn(
                  "grid grid-cols-[40px_1fr_110px_40px] gap-0 items-center px-5 py-2.5 transition-colors",
                  accent.bg
                )}
              >
                {/* Row number */}
                <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0", accent.num)}>
                  {i + 1}
                </div>

                {/* Reason dropdown */}
                <div className="pr-3">
                  <SearchableSelect
                    options={typeOptions}
                    value={row.typeId !== null ? String(row.typeId) : ""}
                    onValueChange={(val) => updateRow(i, { typeId: parseInt(val, 10) })}
                    placeholder={kind === "rejection" ? "Select rejection reason..." : "Select rework reason..."}
                    searchPlaceholder="Search..."
                    testId={`select-reason-${i}`}
                  />
                </div>

                {/* Quantity */}
                <div className="pr-3">
                  <Input
                    type="number"
                    min={1}
                    value={row.quantity}
                    onChange={(e) => updateRow(i, { quantity: e.target.value })}
                    className="h-9 text-center font-semibold text-sm bg-background"
                    data-testid={`input-qty-${i}`}
                  />
                </div>

                {/* Remove button */}
                <div className="flex justify-center">
                  {rows.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      data-testid={`button-remove-${i}`}
                      className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <span className="w-7" />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer / submit */}
        <div className="border-t border-border px-5 py-4 flex items-center justify-between gap-4 bg-muted/20">
          <p className="text-xs text-muted-foreground">
            {filledRows > 0
              ? `${filledRows} row${filledRows !== 1 ? "s" : ""} ready to save`
              : "Fill in at least one reason and quantity"}
          </p>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !partId || filledRows === 0}
            className="px-6 gap-2"
            data-testid="button-log-entry"
          >
            {isSubmitting ? (
              <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            {isSubmitting ? "Saving…" : filledRows <= 1 ? "Save Entry" : `Save ${filledRows} Entries`}
          </Button>
        </div>
      </div>

      {/* Recently logged this session */}
      {recentlyLogged.length > 0 && (
        <div className="mt-6 space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2">Logged this session</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="rounded-xl border border-border overflow-hidden bg-card shadow-sm">
            {recentlyLogged.map((entry, i) => (
              <div
                key={`${entry.id}-${i}`}
                className="flex items-center justify-between px-4 py-3 border-b border-border/40 last:border-0 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Badge
                    variant="outline"
                    className={cn(
                      "shrink-0 text-xs font-semibold",
                      entry.kind === "rework"
                        ? "bg-blue-500/10 text-blue-600 border-blue-400/30 dark:text-blue-400"
                        : "bg-destructive/10 text-destructive border-destructive/20"
                    )}
                  >
                    {entry.kind === "rework" ? "Rework" : "Rejection"}
                  </Badge>
                  <span className="text-sm font-semibold truncate text-foreground">{entry.partNumber}</span>
                  <span className="text-sm text-muted-foreground truncate">{entry.code}</span>
                  {entry.zone && (
                    <span className="text-xs text-muted-foreground hidden sm:block">· {entry.zone}</span>
                  )}
                </div>
                <div className="flex items-center gap-4 shrink-0 ml-3">
                  <span className="text-sm font-bold tabular-nums">{entry.quantity}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{entry.date}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
