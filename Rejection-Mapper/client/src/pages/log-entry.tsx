import { useState } from "react";
import { format } from "date-fns";
import { useCreateRejectionEntry } from "@/hooks/use-rejection-entries";
import { useCreateReworkEntry } from "@/hooks/use-rework-entries";
import { useParts } from "@/hooks/use-parts";
import { useRejectionTypes } from "@/hooks/use-rejection-types";
import { useReworkTypes } from "@/hooks/use-rework-types";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, RefreshCw, CheckCircle2, ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type EntryType = "rejection" | "rework";

interface LoggedEntry {
  id: number;
  type: EntryType;
  partNumber: string;
  code: string;
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
}: {
  options: { value: string; label: string; sublabel?: string }[];
  value: string;
  onValueChange: (val: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  testId?: string;
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
          className="w-full justify-between font-normal h-10 px-3"
          data-testid={testId}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
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

// ── Main component ─────────────────────────────────────────────────────────────
export default function LogEntry() {
  const { toast } = useToast();
  const { data: parts } = useParts();
  const { data: rejectionTypes } = useRejectionTypes();
  const { data: reworkTypes } = useReworkTypes();
  const createRejection = useCreateRejectionEntry();
  const createRework = useCreateReworkEntry();

  const [entryType, setEntryType] = useState<EntryType>("rework");
  // Restore last used partId from localStorage so it persists across page refreshes
  const [partId, setPartId] = useState<string>(() => {
    try { return localStorage.getItem("logEntry_lastPartId") || ""; } catch { return ""; }
  });
  const [typeId, setTypeId] = useState<string>(() => {
    try { return localStorage.getItem("logEntry_lastTypeId") || ""; } catch { return ""; }
  });
  const [quantity, setQuantity] = useState("1");
  const [remarks, setRemarks] = useState("");
  const [entryDate, setEntryDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [recentlyLogged, setRecentlyLogged] = useState<LoggedEntry[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleTabChange = (val: string) => {
    setEntryType(val as EntryType);
    setTypeId("");
    try { localStorage.removeItem("logEntry_lastTypeId"); } catch {}
  };

  const handleSubmit = async () => {
    if (!partId || !typeId || !quantity) {
      toast({ title: "Missing fields", description: "Please fill in part, type, and quantity.", variant: "destructive" });
      return;
    }
    const qty = parseInt(quantity);
    if (isNaN(qty) || qty < 1) {
      toast({ title: "Invalid quantity", description: "Quantity must be a positive number.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const part = parts?.find((p) => p.id === parseInt(partId));

      if (entryType === "rework") {
        const reworkType = reworkTypes?.find((t) => t.id === parseInt(typeId));
        await new Promise<void>((resolve, reject) => {
          createRework.mutate(
            { partId: parseInt(partId), reworkTypeId: parseInt(typeId), quantity: qty, remarks: remarks || undefined, entryDate: entryDate || undefined },
            {
              onSuccess: (created) => {
                setRecentlyLogged((prev) => [
                  { id: created.id, type: "rework", partNumber: part?.partNumber ?? "", code: reworkType?.reworkCode ?? "", quantity: qty, date: entryDate, remarks: remarks || undefined },
                  ...prev.slice(0, 9),
                ]);
                resolve();
              },
              onError: reject,
            }
          );
        });
      } else {
        const rejType = rejectionTypes?.find((t) => t.id === parseInt(typeId));
        await new Promise<void>((resolve, reject) => {
          createRejection.mutate(
            { partId: parseInt(partId), rejectionTypeId: parseInt(typeId), quantity: qty, remarks: remarks || undefined, entryDate: entryDate || undefined },
            {
              onSuccess: (created) => {
                setRecentlyLogged((prev) => [
                  { id: created.id, type: "rejection", partNumber: part?.partNumber ?? "", code: rejType?.rejectionCode ?? "", quantity: qty, date: entryDate, remarks: remarks || undefined },
                  ...prev.slice(0, 9),
                ]);
                resolve();
              },
              onError: reject,
            }
          );
        });
      }

      toast({ title: "Entry logged", description: `${qty} × ${parts?.find(p => p.id === parseInt(partId))?.partNumber} saved.` });
      // Keep partId and typeId so the next entry is pre-filled with the same part and type.
      // Only reset quantity and remarks.
      setQuantity("1");
      setRemarks("");
    } catch (err: any) {
      toast({ title: "Failed to log entry", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Build option lists for searchable selects
  const partOptions = [...(parts ?? [])]
    .sort((a, b) => a.partNumber.localeCompare(b.partNumber))
    .map((p) => ({ value: String(p.id), label: p.partNumber, sublabel: p.description ?? undefined }));

  const reworkOptions = (reworkTypes ?? [])
    .sort((a, b) => a.reworkCode.localeCompare(b.reworkCode))
    .map((t) => ({ value: String(t.id), label: t.reworkCode, sublabel: t.reason }));

  const rejectionOptions = (rejectionTypes ?? [])
    .sort((a, b) => a.rejectionCode.localeCompare(b.rejectionCode))
    .map((t) => ({ value: String(t.id), label: t.rejectionCode, sublabel: t.reason }));

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-2xl">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Log Entry</h1>
        <p className="text-muted-foreground mt-1 text-sm">Record a new rejection or rework entry</p>
      </div>

      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">New Entry</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <Tabs value={entryType} onValueChange={handleTabChange}>
            <TabsList className="w-full">
              <TabsTrigger value="rework" className="flex-1 gap-2" data-testid="tab-log-rework">
                <RefreshCw className="w-4 h-4 text-blue-500" />
                Rework
              </TabsTrigger>
              <TabsTrigger value="rejection" className="flex-1 gap-2" data-testid="tab-log-rejection">
                <AlertTriangle className="w-4 h-4 text-destructive" />
                Rejection
              </TabsTrigger>
            </TabsList>

            <div className="mt-5 space-y-4">
              {/* Part — searchable */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Part</label>
                <SearchableSelect
                  options={partOptions}
                  value={partId}
                  onValueChange={(val) => {
                    setPartId(val);
                    try { localStorage.setItem("logEntry_lastPartId", val); } catch {}
                  }}
                  placeholder="Search part number…"
                  searchPlaceholder="Type to search parts…"
                  testId="select-part"
                />
              </div>

              {/* Rework type — searchable */}
              <TabsContent value="rework" className="mt-0 p-0">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Rework Type</label>
                  <SearchableSelect
                    options={reworkOptions}
                    value={typeId}
                    onValueChange={(val) => {
                      setTypeId(val);
                      try { localStorage.setItem("logEntry_lastTypeId", val); } catch {}
                    }}
                    placeholder="Search rework type…"
                    searchPlaceholder="Type to search rework codes…"
                    testId="select-rework-type"
                  />
                </div>
              </TabsContent>

              {/* Rejection type — searchable */}
              <TabsContent value="rejection" className="mt-0 p-0">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Rejection Type</label>
                  <SearchableSelect
                    options={rejectionOptions}
                    value={typeId}
                    onValueChange={(val) => {
                      setTypeId(val);
                      try { localStorage.setItem("logEntry_lastTypeId", val); } catch {}
                    }}
                    placeholder="Search rejection type…"
                    searchPlaceholder="Type to search rejection codes…"
                    testId="select-rejection-type"
                  />
                </div>
              </TabsContent>

              {/* Quantity + Date */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Quantity</label>
                  <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="1" data-testid="input-quantity" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Date</label>
                  <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} data-testid="input-date" />
                </div>
              </div>

              {/* Remarks */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Remarks <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Any additional notes…" data-testid="input-remarks" />
              </div>

              <Button
                className="w-full"
                onClick={handleSubmit}
                disabled={isSubmitting || !partId || !typeId}
                data-testid="button-log-entry"
              >
                {isSubmitting
                  ? <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2" />
                  : <CheckCircle2 className="w-4 h-4 mr-2" />}
                {isSubmitting ? "Saving…" : "Log Entry"}
              </Button>
            </div>
          </Tabs>
        </CardContent>
      </Card>

      {/* Recently logged this session */}
      {recentlyLogged.length > 0 && (
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground">Logged this session</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentlyLogged.map((entry, i) => (
              <div key={`${entry.id}-${i}`} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className={entry.type === "rework" ? "bg-blue-500/10 text-blue-600 border-blue-400/30" : "bg-destructive/10 text-destructive border-destructive/20"}>
                    {entry.type === "rework" ? "Rework" : "Rejection"}
                  </Badge>
                  <span className="text-sm font-medium">{entry.partNumber}</span>
                  <span className="text-xs text-muted-foreground">{entry.code}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
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
