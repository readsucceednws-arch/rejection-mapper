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
import { CheckCircle2, ChevronsUpDown, Check, ClipboardList } from "lucide-react";
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

// ── Searchable combobox ────────────────────────────────────────────────────────

function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder,
  searchPlaceholder,
  testId,
  disabled,
}: {
  options: { value: string; label: string; sublabel?: string; group?: string }[];
  value: string;
  onValueChange: (val: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  testId?: string;
  disabled?: boolean;
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
          disabled={disabled}
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
                        value={`${option.label} ${option.sublabel ?? ""} ${group}`}
                        onSelect={() => { onValueChange(option.value); setOpen(false); }}
                      >
                        <Check className={cn("mr-2 h-4 w-4 shrink-0", value === option.value ? "opacity-100" : "opacity-0")} />
                        <span className="truncate">{option.label}</span>
                        {option.sublabel && option.sublabel !== option.label && (
                          <span className="ml-2 text-xs text-muted-foreground truncate">{option.sublabel}</span>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))
              : [...(grouped.get("") ?? [])].map((option) => (
                  <CommandItem
                    key={option.value}
                    value={`${option.label} ${option.sublabel ?? ""}`}
                    onSelect={() => { onValueChange(option.value); setOpen(false); }}
                  >
                    <Check className={cn("mr-2 h-4 w-4 shrink-0", value === option.value ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{option.label}</span>
                    {option.sublabel && option.sublabel !== option.label && (
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

// ── Field wrapper ──────────────────────────────────────────────────────────────

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

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
  const [typeKey, setTypeKey] = useState<string>(() => {
    try { return localStorage.getItem("logEntry_lastTypeKey") || ""; } catch { return ""; }
  });
  const [quantity, setQuantity] = useState("1");
  const [remarks, setRemarks] = useState("");
  const [entryDate, setEntryDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [recentlyLogged, setRecentlyLogged] = useState<LoggedEntry[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Unified type list grouped by zone
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
      zone: null,
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
    allTypes.map((t) => ({
      value: t.id,
      label: t.code,
      sublabel: t.reason !== t.code ? t.reason : undefined,
      group: t.zone || (t.kind === "rejection" ? "Rejection" : "Rework"),
    })),
    [allTypes]
  );

  const selectedType = allTypes.find((t) => t.id === typeKey) ?? null;

  const handleSubmit = async () => {
    if (!partId || !typeKey || !quantity) {
      toast({ title: "Missing fields", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }
    const qty = parseInt(quantity);
    if (isNaN(qty) || qty < 1) {
      toast({ title: "Invalid quantity", description: "Quantity must be a positive number.", variant: "destructive" });
      return;
    }
    if (!selectedType) return;

    setIsSubmitting(true);
    try {
      const part = parts?.find((p) => p.id === parseInt(partId));

      if (selectedType.kind === "rework") {
        await new Promise<void>((resolve, reject) => {
          createRework.mutate(
            { partId: parseInt(partId), reworkTypeId: selectedType.rawId, quantity: qty, remarks: remarks || undefined, entryDate: entryDate || undefined },
            {
              onSuccess: (created) => {
                setRecentlyLogged((prev) => [
                  { id: created.id, kind: "rework", partNumber: part?.partNumber ?? "", code: selectedType.code, zone: selectedType.zone, quantity: qty, date: entryDate, remarks: remarks || undefined },
                  ...prev.slice(0, 9),
                ]);
                resolve();
              },
              onError: reject,
            }
          );
        });
      } else {
        await new Promise<void>((resolve, reject) => {
          createRejection.mutate(
            { partId: parseInt(partId), rejectionTypeId: selectedType.rawId, quantity: qty, remarks: remarks || undefined, entryDate: entryDate || undefined },
            {
              onSuccess: (created) => {
                setRecentlyLogged((prev) => [
                  { id: created.id, kind: "rejection", partNumber: part?.partNumber ?? "", code: selectedType.code, zone: selectedType.zone, quantity: qty, date: entryDate, remarks: remarks || undefined },
                  ...prev.slice(0, 9),
                ]);
                resolve();
              },
              onError: reject,
            }
          );
        });
      }

      toast({ title: "Entry logged", description: `${qty} × ${part?.partNumber} saved.` });
      setQuantity("1");
      setRemarks("");
    } catch (err: any) {
      toast({ title: "Failed to log entry", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-3xl">

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

      {/* Form grid */}
      <div className="space-y-6">

        {/* Row 1: Part + Purpose */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <Field label="Part Number" required hint="Select the part being logged">
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
          </Field>

          <Field label="Purpose" required hint="Select the rework or rejection reason">
            <SearchableSelect
              options={typeOptions}
              value={typeKey}
              onValueChange={(val) => {
                setTypeKey(val);
                try { localStorage.setItem("logEntry_lastTypeKey", val); } catch {}
              }}
              placeholder="Select purpose..."
              searchPlaceholder="Search purpose..."
              testId="select-purpose"
            />
            {selectedType && (
              <div className="flex items-center gap-2 mt-1">
                <Badge
                  variant="outline"
                  className={selectedType.kind === "rework"
                    ? "bg-blue-500/10 text-blue-600 border-blue-400/30 text-xs"
                    : "bg-destructive/10 text-destructive border-destructive/20 text-xs"}
                >
                  {selectedType.kind === "rework" ? "Rework" : "Rejection"}
                </Badge>
                {selectedType.zone && (
                  <span className="text-xs text-muted-foreground">{selectedType.zone}</span>
                )}
              </div>
            )}
          </Field>
        </div>

        {/* Row 2: Quantity + Date */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <Field label="Quantity" required hint="Number of units">
            <Input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="1"
              data-testid="input-quantity"
            />
          </Field>

          <Field label="Date" required hint="Date of the entry">
            <Input
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              data-testid="input-date"
            />
          </Field>
        </div>

        {/* Row 3: Remarks full width */}
        <Field label="Remarks" hint="Any additional notes or observations (optional)">
          <Input
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Enter any additional notes..."
            data-testid="input-remarks"
          />
        </Field>

        {/* Submit */}
        <div className="pt-2">
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !partId || !typeKey}
            className="w-full sm:w-auto px-8"
            data-testid="button-log-entry"
          >
            {isSubmitting
              ? <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2" />
              : <CheckCircle2 className="w-4 h-4 mr-2" />}
            {isSubmitting ? "Saving…" : "Log Entry"}
          </Button>
        </div>
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
