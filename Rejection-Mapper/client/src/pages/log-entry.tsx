import { useState } from "react";
import { format } from "date-fns";
import { useCreateRejectionEntry } from "@/hooks/use-rejection-entries";
import { useCreateReworkEntry } from "@/hooks/use-rework-entries";
import { useParts } from "@/hooks/use-parts";
import { useRejectionTypes } from "@/hooks/use-rejection-types";
import { useReworkTypes } from "@/hooks/use-rework-types";
import { useZones } from "@/hooks/use-zones";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  ChevronsUpDown,
  Check,
  Plus,
  Trash2,
  CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";

type EntryType = "rejection" | "rework";

interface EntryRow {
  id: string;
  purpose: EntryType;
  partId: string;
  typeId: string;
  quantity: string;
  zoneId: string;
  remarks: string;
}

interface LoggedEntry {
  id: number;
  type: EntryType;
  partNumber: string;
  code: string;
  quantity: number;
  date: string;
  remarks?: string;
}

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
          className="w-full justify-between font-normal h-9 px-3 text-sm"
          data-testid={testId}
          disabled={disabled}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} className="h-9" />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={`${option.label} ${option.sublabel ?? ""}`}
                  onSelect={() => {
                    onValueChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="truncate">{option.label}</span>
                  {option.sublabel && (
                    <span className="ml-2 text-xs text-muted-foreground truncate">
                      {option.sublabel}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function makeRow(): EntryRow {
  return {
    id: Math.random().toString(36).slice(2),
    purpose: "rejection",
    partId: "",
    typeId: "",
    quantity: "1",
    zoneId: "",
    remarks: "",
  };
}

export default function LogEntry() {
  const { toast } = useToast();
  const { data: parts } = useParts();
  const { data: rejectionTypes } = useRejectionTypes();
  const { data: reworkTypes } = useReworkTypes();
  const { data: zones } = useZones();
  const createRejection = useCreateRejectionEntry();
  const createRework = useCreateReworkEntry();

  const [entryDate, setEntryDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [rows, setRows] = useState<EntryRow[]>([makeRow()]);
  const [recentlyLogged, setRecentlyLogged] = useState<LoggedEntry[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateRow = (id: string, patch: Partial<EntryRow>) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        if (patch.purpose && patch.purpose !== r.purpose) {
          return { ...r, ...patch, typeId: "" };
        }
        return { ...r, ...patch };
      })
    );
  };

  const addRow = () => setRows((prev) => [...prev, makeRow()]);

  const removeRow = (id: string) => {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  };

  const handleSubmit = async () => {
    for (const row of rows) {
      if (!row.partId || !row.typeId || !row.quantity) {
        toast({
          title: "Missing fields",
          description: "Please fill in Part, Type, and Quantity for every row.",
          variant: "destructive",
        });
        return;
      }
      const qty = parseInt(row.quantity);
      if (isNaN(qty) || qty < 1) {
        toast({
          title: "Invalid quantity",
          description: "Quantity must be a positive number.",
          variant: "destructive",
        });
        return;
      }
    }

    setIsSubmitting(true);
    const newLogged: LoggedEntry[] = [];

    try {
      for (const row of rows) {
        const qty = parseInt(row.quantity);
        const part = parts?.find((p) => p.id === parseInt(row.partId));
        const zoneIdNum = row.zoneId ? parseInt(row.zoneId) : undefined;

        if (row.purpose === "rework") {
          const reworkType = reworkTypes?.find((t) => t.id === parseInt(row.typeId));
          await new Promise<void>((resolve, reject) => {
            createRework.mutate(
              {
                partId: parseInt(row.partId),
                reworkTypeId: parseInt(row.typeId),
                quantity: qty,
                remarks: row.remarks || undefined,
                entryDate: entryDate || undefined,
                zoneId: zoneIdNum,
              },
              {
                onSuccess: (created) => {
                  newLogged.push({
                    id: created.id,
                    type: "rework",
                    partNumber: part?.partNumber ?? "",
                    code: reworkType?.reworkCode ?? "",
                    quantity: qty,
                    date: entryDate,
                    remarks: row.remarks || undefined,
                  });
                  resolve();
                },
                onError: reject,
              }
            );
          });
        } else {
          const rejType = rejectionTypes?.find((t) => t.id === parseInt(row.typeId));
          await new Promise<void>((resolve, reject) => {
            createRejection.mutate(
              {
                partId: parseInt(row.partId),
                rejectionTypeId: parseInt(row.typeId),
                quantity: qty,
                remarks: row.remarks || undefined,
                entryDate: entryDate || undefined,
                zoneId: zoneIdNum,
              },
              {
                onSuccess: (created) => {
                  newLogged.push({
                    id: created.id,
                    type: "rejection",
                    partNumber: part?.partNumber ?? "",
                    code: rejType?.rejectionCode ?? "",
                    quantity: qty,
                    date: entryDate,
                    remarks: row.remarks || undefined,
                  });
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
        description: newLogged.map((e) => `${e.quantity} × ${e.partNumber}`).join(", "),
      });
      setRows([makeRow()]);
    } catch (err: any) {
      toast({
        title: "Failed to log entry",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const partOptions = [...(parts ?? [])]
    .sort((a, b) => a.partNumber.localeCompare(b.partNumber))
    .map((p) => ({ value: String(p.id), label: p.partNumber, sublabel: p.description ?? undefined }));

  const reworkOptions = (reworkTypes ?? [])
    .sort((a, b) => a.reworkCode.localeCompare(b.reworkCode))
    .map((t) => ({ value: String(t.id), label: t.reworkCode, sublabel: t.reason }));

  const rejectionOptions = (rejectionTypes ?? [])
    .sort((a, b) => a.rejectionCode.localeCompare(b.rejectionCode))
    .map((t) => ({ value: String(t.id), label: t.rejectionCode, sublabel: t.reason }));

  const allValid = rows.every((r) => r.partId && r.typeId && parseInt(r.quantity) > 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Log Entry</h1>
        <p className="text-muted-foreground mt-1 text-sm">Record rejection or rework entries for one or more parts</p>
      </div>

      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-base font-semibold">New Entries</CardTitle>
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-muted-foreground" />
              <Label className="text-sm text-muted-foreground">Date</Label>
              <Input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="h-8 text-sm w-[145px]"
                data-testid="input-date"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Column headers — desktop only */}
          <div
            className="hidden md:grid gap-2 px-1 text-xs font-medium text-muted-foreground"
            style={{ gridTemplateColumns: "1.2fr 0.9fr 1.2fr 64px 1fr 36px" }}
          >
            <span>Part</span>
            <span>Purpose</span>
            <span>Type / Code</span>
            <span>Qty</span>
            <span>Remarks</span>
            <span />
          </div>

          {/* Entry rows */}
          {rows.map((row, idx) => {
            const typeOptions = row.purpose === "rework" ? reworkOptions : rejectionOptions;
            const typePlaceholder = row.purpose === "rework" ? "Search rework code…" : "Search rejection code…";
            const typeSearchPlaceholder = row.purpose === "rework" ? "Type to search rework…" : "Type to search rejection…";

            return (
              <div
                key={row.id}
                className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-3 md:space-y-0 md:grid md:gap-2 md:items-center"
                style={{ gridTemplateColumns: "1.2fr 0.9fr 1.2fr 64px 1fr 36px" }}
              >
                {/* Part */}
                <div className="space-y-1 md:space-y-0">
                  <Label className="text-xs text-muted-foreground md:hidden">Part</Label>
                  <SearchableSelect
                    options={partOptions}
                    value={row.partId}
                    onValueChange={(v) => updateRow(row.id, { partId: v })}
                    placeholder="Search part…"
                    searchPlaceholder="Type to search parts…"
                    testId={`select-part-${idx}`}
                  />
                </div>

                {/* Purpose */}
                <div className="space-y-1 md:space-y-0">
                  <Label className="text-xs text-muted-foreground md:hidden">Purpose</Label>
                  <Select
                    value={row.purpose}
                    onValueChange={(v) => updateRow(row.id, { purpose: v as EntryType })}
                  >
                    <SelectTrigger className="h-9 text-sm" data-testid={`select-purpose-${idx}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rejection">
                        <span className="flex items-center gap-2">
                          <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                          Rejection
                        </span>
                      </SelectItem>
                      <SelectItem value="rework">
                        <span className="flex items-center gap-2">
                          <RefreshCw className="w-3.5 h-3.5 text-blue-500" />
                          Rework
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Type / Code */}
                <div className="space-y-1 md:space-y-0">
                  <Label className="text-xs text-muted-foreground md:hidden">Type / Code</Label>
                  <SearchableSelect
                    options={typeOptions}
                    value={row.typeId}
                    onValueChange={(v) => updateRow(row.id, { typeId: v })}
                    placeholder={typePlaceholder}
                    searchPlaceholder={typeSearchPlaceholder}
                    testId={`select-type-${idx}`}
                  />
                </div>

                {/* Quantity */}
                <div className="space-y-1 md:space-y-0">
                  <Label className="text-xs text-muted-foreground md:hidden">Qty</Label>
                  <Input
                    type="number"
                    min={1}
                    value={row.quantity}
                    onChange={(e) => updateRow(row.id, { quantity: e.target.value })}
                    className="h-9 text-sm"
                    data-testid={`input-quantity-${idx}`}
                  />
                </div>

                {/* Remarks */}
                <div className="space-y-1 md:space-y-0">
                  <Label className="text-xs text-muted-foreground md:hidden">Remarks</Label>
                  <Input
                    value={row.remarks}
                    onChange={(e) => updateRow(row.id, { remarks: e.target.value })}
                    placeholder="Optional notes…"
                    className="h-9 text-sm"
                    data-testid={`input-remarks-${idx}`}
                  />
                </div>

                {/* Remove */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 justify-self-end"
                  onClick={() => removeRow(row.id)}
                  disabled={rows.length === 1}
                  title="Remove row"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            );
          })}

          {/* Footer actions */}
          <div className="flex items-center justify-between pt-1 flex-wrap gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={addRow}
              className="gap-2 text-muted-foreground hover:text-foreground"
              data-testid="button-add-row"
            >
              <Plus className="w-4 h-4" />
              Add Row
            </Button>

            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !allValid}
              className="gap-2 min-w-[140px]"
              data-testid="button-log-entry"
            >
              {isSubmitting ? (
                <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              {isSubmitting
                ? "Saving…"
                : rows.length === 1
                ? "Log Entry"
                : `Log ${rows.length} Entries`}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recently logged this session */}
      {recentlyLogged.length > 0 && (
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground">
              Logged this session
              <Badge variant="secondary" className="ml-2 text-xs">{recentlyLogged.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {recentlyLogged.map((entry, i) => (
              <div
                key={`${entry.id}-${i}`}
                className="flex items-center justify-between py-2 border-b border-border/40 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <Badge
                    variant="outline"
                    className={
                      entry.type === "rework"
                        ? "bg-blue-500/10 text-blue-600 border-blue-400/30"
                        : "bg-destructive/10 text-destructive border-destructive/20"
                    }
                  >
                    {entry.type === "rework" ? (
                      <><RefreshCw className="w-3 h-3 mr-1" />Rework</>
                    ) : (
                      <><AlertTriangle className="w-3 h-3 mr-1" />Rejection</>
                    )}
                  </Badge>
                  <span className="text-sm font-medium">{entry.partNumber}</span>
                  <span className="text-xs text-muted-foreground font-mono">{entry.code}</span>
                  {entry.remarks && (
                    <span className="text-xs text-muted-foreground italic truncate max-w-[160px]">{entry.remarks}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-sm shrink-0">
                  <span className="font-bold">{entry.quantity}</span>
                  <span className="text-xs text-muted-foreground">{entry.date}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
