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
import { CheckCircle2, ChevronsUpDown, Check, ClipboardList, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type EntryKind = "rework" | "rejection";

interface UnifiedType {
  id: string;
  kind: EntryKind;
  code: string;
  reason: string;
  zone: string | null;
  rawId: number;
}

interface ReasonRow {
  typeKey: string;
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

// ── Single searchable combobox ─────────────────────────────────────────────────

function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder,
  searchPlaceholder,
  testId,
}: {
  options: { value: string; label: string; sublabel?: string; group?: string }[];
  value: string;
  onValueChange: (val: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof options>();
    for (const opt of options) {
      const g = opt.group ?? "";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(opt);
    }
    return map;
  }, [options]);

  const hasGroups = [...grouped.keys()].some((k) => k !== "");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal h-10 px-3 text-left"
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
          <CommandList className="max-h-72">
            <CommandEmpty>No results found.</CommandEmpty>
            {hasGroups
              ? [...grouped.entries()].map(([group, opts]) => (
                  <CommandGroup key={group} heading={group || undefined}>
                    {opts.map((option) => (
                      <CommandItem
                        key={option.value}
                        value={`${option.label} ${option.sublabel ?? ""} ${option.group ?? ""}`}
                        onSelect={() => { onValueChange(option.value); setOpen(false); }}
                      >
                        <Check className={cn("mr-2 h-4 w-4 shrink-0", value === option.value ? "opacity-100" : "opacity-0")} />
                        <span className="truncate">{option.label}</span>
                        {option.sublabel && (
                          <span className="ml-2 text-xs text-muted-foreground truncate">{option.sublabel}</span>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))
              : options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={`${option.label} ${option.sublabel ?? ""}`}
                    onSelect={() => { onValueChange(option.value); setOpen(false); }}
                  >
                    <Check className={cn("mr-2 h-4 w-4 shrink-0", value === option.value ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{option.label}</span>
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

// ── Excel-style row ────────────────────────────────────────────────────────────

function ExcelRow({
  label,
  rowNum,
  labelColor,
  required,
  hint,
  children,
  action,
}: {
  label: string;
  rowNum?: number;
  labelColor: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[200px_1fr] items-stretch border-b border-border last:border-0">
      {/* Column A — label */}
      <div className={cn("flex items-center gap-2 px-3 py-3 border-r border-border min-h-[52px]", labelColor)}>
        {rowNum !== undefined && (
          <span className="text-[10px] font-mono text-muted-foreground/50 w-5 shrink-0 text-right">{rowNum}</span>
        )}
        <span className="text-sm font-semibold text-foreground leading-tight">
          {label}{required && <span className="text-destructive ml-0.5">*</span>}
        </span>
      </div>
      {/* Column B — input */}
      <div className="px-3 py-2.5 flex items-center gap-2 bg-background">
        <div className="flex-1 flex flex-col gap-0.5">
          {children}
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        {action}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

const EMPTY_ROW = (): ReasonRow => ({ typeKey: "", quantity: "1" });

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
  const [rows, setRows] = useState<ReasonRow[]>([EMPTY_ROW()]);
  const [remarks, setRemarks] = useState("");
  const [entryDate, setEntryDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [recentlyLogged, setRecentlyLogged] = useState<LoggedEntry[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const allTypes = useMemo<UnifiedType[]>(() => {
    const rw: UnifiedType[] = (reworkTypes ?? []).map((t) => ({
      id: `rw-${t.id}`,
      kind: "rework" as EntryKind,
      code: t.reworkCode,
      reason: t.reason,
      zone: t.zone ?? null,
      rawId: t.id,
    }));
    const rej: UnifiedType[] = (rejectionTypes ?? []).map((t) => ({
      id: `rej-${t.id}`,
      kind: "rejection" as EntryKind,
      code: t.rejectionCode,
      reason: t.reason,
      zone: t.type && t.type !== "rejection" && t.type !== "rework" ? t.type : null,
      rawId: t.id,
    }));
    return [...rw, ...rej].sort((a, b) => a.code.localeCompare(b.code));
  }, [reworkTypes, rejectionTypes]);

  const partOptions = useMemo(() =>
    [...(parts ?? [])]
      .sort((a, b) => a.partNumber.localeCompare(b.partNumber))
      .map((p) => ({ value: String(p.id), label: p.partNumber, sublabel: p.description ?? undefined })),
    [parts]
  );

  const typeOptions = useMemo(() =>
    allTypes
      .filter((t) => t.kind === kind)
      .map((t) => ({
        value: t.id,
        label: t.code,
        sublabel: t.reason !== t.code ? t.reason : undefined,
        group: t.zone || undefined,
      })),
    [allTypes, kind]
  );

  const updateRow = (index: number, patch: Partial<ReasonRow>) => {
    setRows((prev) => prev.map((r, i) => i === index ? { ...r, ...patch } : r));
  };

  const addRow = () => setRows((prev) => [...prev, EMPTY_ROW()]);

  const removeRow = (index: number) => {
    setRows((prev) => prev.length === 1 ? prev : prev.filter((_, i) => i !== index));
  };

  const handleKindChange = (newKind: EntryKind) => {
    setKind(newKind);
    setRows([EMPTY_ROW()]);
    try { localStorage.setItem("logEntry_lastKind", newKind); } catch {}
  };

  const handleSubmit = async () => {
    const filledRows = rows.filter((r) => r.typeKey !== "");
    if (!partId || filledRows.length === 0) {
      toast({ title: "Missing fields", description: "Please select a part and at least one reason code.", variant: "destructive" });
      return;
    }
    for (const r of filledRows) {
      const qty = parseInt(r.quantity);
      if (isNaN(qty) || qty < 1) {
        toast({ title: "Invalid quantity", description: "All quantities must be positive numbers.", variant: "destructive" });
        return;
      }
    }

    setIsSubmitting(true);
    const part = parts?.find((p) => p.id === parseInt(partId));
    const newLogged: LoggedEntry[] = [];

    try {
      for (const r of filledRows) {
        const t = allTypes.find((x) => x.id === r.typeKey)!;
        const qty = parseInt(r.quantity);

        if (t.kind === "rework") {
          await new Promise<void>((resolve, reject) => {
            createRework.mutate(
              { partId: parseInt(partId), reworkTypeId: t.rawId, quantity: qty, remarks: remarks || undefined, entryDate: entryDate || undefined },
              {
                onSuccess: (created) => {
                  newLogged.push({ id: created.id, kind: "rework", partNumber: part?.partNumber ?? "", code: t.code, zone: t.zone, quantity: qty, date: entryDate, remarks: remarks || undefined });
                  resolve();
                },
                onError: reject,
              }
            );
          });
        } else {
          await new Promise<void>((resolve, reject) => {
            createRejection.mutate(
              { partId: parseInt(partId), rejectionTypeId: t.rawId, quantity: qty, remarks: remarks || undefined, entryDate: entryDate || undefined },
              {
                onSuccess: (created) => {
                  newLogged.push({ id: created.id, kind: "rejection", partNumber: part?.partNumber ?? "", code: t.code, zone: t.zone, quantity: qty, date: entryDate, remarks: remarks || undefined });
                  resolve();
                },
                onError: reject,
              }
            );
          });
        }
      }

      setRecentlyLogged((prev) => [...newLogged, ...prev].slice(0, 20));
      toast({
        title: `${newLogged.length} entr${newLogged.length === 1 ? "y" : "ies"} logged`,
        description: `${part?.partNumber}`,
      });
      setRows([EMPTY_ROW()]);
      setRemarks("");
    } catch (err: any) {
      toast({ title: "Failed to log entry", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const filledCount = rows.filter((r) => r.typeKey !== "").length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-2xl">

      {/* Header */}
      <div className="flex items-center gap-3 pb-2 border-b border-border">
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <ClipboardList className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">New Entry Form</h1>
          <p className="text-xs text-muted-foreground mt-0.5">All fields marked with an asterisk are required.</p>
        </div>
      </div>

      {/* Excel-style table */}
      <div className="border border-border rounded-lg overflow-hidden shadow-sm">

        {/* Date */}
        <ExcelRow label="Date" rowNum={2} labelColor="bg-yellow-200/70 dark:bg-yellow-900/30" required hint="Date of the entry">
          <Input
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            className="h-9 max-w-[180px]"
            data-testid="input-date"
          />
        </ExcelRow>

        {/* Part Name */}
        <ExcelRow label="Part Name" rowNum={3} labelColor="bg-green-300/60 dark:bg-green-900/30" required hint="Select the part being logged">
          <SearchableSelect
            options={partOptions}
            value={partId}
            onValueChange={(val) => {
              setPartId(val);
              try { localStorage.setItem("logEntry_lastPartId", val); } catch {}
            }}
            placeholder="Select a part..."
            searchPlaceholder="Search part number..."
            testId="select-part"
          />
        </ExcelRow>

        {/* Purpose */}
        <ExcelRow label="Purpose" rowNum={4} labelColor="bg-orange-300/70 dark:bg-orange-900/30" required hint="Is this a rejection or a rework?">
          <div className="flex rounded-md border border-border overflow-hidden h-9 w-fit">
            <button
              type="button"
              onClick={() => handleKindChange("rejection")}
              className={`px-5 text-sm font-medium transition-colors ${kind === "rejection" ? "bg-destructive text-destructive-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
              data-testid="toggle-rejection"
            >
              Rejection
            </button>
            <button
              type="button"
              onClick={() => handleKindChange("rework")}
              className={`px-5 text-sm font-medium transition-colors border-l border-border ${kind === "rework" ? "bg-blue-500 text-white" : "bg-background text-muted-foreground hover:bg-muted"}`}
              data-testid="toggle-rework"
            >
              Rework
            </button>
          </div>
        </ExcelRow>

        {/* Dynamic Reason + Qty pairs */}
        {rows.map((row, i) => (
          <div key={i}>
            {/* Reason N */}
            <ExcelRow
              label={`${kind === "rejection" ? "Rejection" : "Rework"} Reason ${i + 1}`}
              rowNum={5 + i * 2}
              labelColor="bg-sky-200/70 dark:bg-sky-900/30"
              required
              action={
                rows.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                    title="Remove this reason"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                ) : undefined
              }
            >
              <SearchableSelect
                options={typeOptions}
                value={row.typeKey}
                onValueChange={(val) => updateRow(i, { typeKey: val })}
                placeholder={`Select ${kind} code...`}
                searchPlaceholder="Search codes..."
                testId={`select-reason-${i}`}
              />
            </ExcelRow>

            {/* Qty N */}
            <ExcelRow
              label={`Qty ${i + 1}`}
              rowNum={6 + i * 2}
              labelColor="bg-orange-100/70 dark:bg-orange-900/20"
              required
            >
              <Input
                type="number"
                min={1}
                value={row.quantity}
                onChange={(e) => updateRow(i, { quantity: e.target.value })}
                placeholder="1"
                className="h-9 max-w-[120px]"
                data-testid={`input-qty-${i}`}
              />
            </ExcelRow>
          </div>
        ))}

        {/* Add another reason */}
        <div className="grid grid-cols-[200px_1fr] items-stretch border-b border-border">
          <div className="border-r border-border bg-muted/20" />
          <div className="px-3 py-2.5 bg-background">
            <button
              type="button"
              onClick={addRow}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group"
            >
              <Plus className="w-3.5 h-3.5 group-hover:text-primary transition-colors" />
              Add another reason
            </button>
          </div>
        </div>

        {/* Remarks */}
        <ExcelRow label="Remarks" labelColor="bg-muted/40" hint="Any additional notes (optional)">
          <Input
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Enter any additional notes..."
            data-testid="input-remarks"
          />
        </ExcelRow>

      </div>

      {/* Submit */}
      <div className="pt-1">
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting || !partId || filledCount === 0}
          className="w-full sm:w-auto px-8"
          data-testid="button-log-entry"
        >
          {isSubmitting
            ? <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2" />
            : <CheckCircle2 className="w-4 h-4 mr-2" />}
          {isSubmitting
            ? "Saving…"
            : filledCount <= 1
            ? "Log Entry"
            : `Log ${filledCount} Entries`}
        </Button>
      </div>

      {/* Recently logged this session */}
      {recentlyLogged.length > 0 && (
        <div className="border-t border-border pt-6 space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Logged this session</h2>
          <div className="space-y-0 border border-border rounded-lg overflow-hidden">
            {recentlyLogged.map((entry, i) => (
              <div
                key={`${entry.id}-${i}`}
                className="flex items-center justify-between px-4 py-3 border-b border-border/50 last:border-0 hover:bg-muted/20"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Badge
                    variant="outline"
                    className={entry.kind === "rework"
                      ? "bg-blue-500/10 text-blue-600 border-blue-400/30 shrink-0 text-xs"
                      : "bg-destructive/10 text-destructive border-destructive/20 shrink-0 text-xs"}
                  >
                    {entry.kind === "rework" ? "Rework" : "Rejection"}
                  </Badge>
                  <span className="text-sm font-medium truncate">{entry.partNumber}</span>
                  <span className="text-sm text-muted-foreground truncate">{entry.code}</span>
                  {entry.zone && (
                    <span className="text-xs text-muted-foreground hidden sm:block truncate">· {entry.zone}</span>
                  )}
                </div>
                <div className="flex items-center gap-4 shrink-0 ml-3">
                  <span className="font-semibold text-sm">{entry.quantity}</span>
                  <span className="text-xs text-muted-foreground">{entry.date}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
