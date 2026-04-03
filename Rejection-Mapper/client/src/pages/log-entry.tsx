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
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────

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

// ── Multi-select ─────────────────────────────

function MultiSearchableSelect({
  options,
  values,
  onToggle,
  placeholder,
  searchPlaceholder,
}: any) {
  const [open, setOpen] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const opt of options) {
      const g = opt.group ?? "";
      if (!map.has(g)) map.set(g, []);
      map.get(g).push(opt);
    }
    return map;
  }, [options]);

  const renderItem = (option: any) => (
    <CommandItem
      key={option.value}
      value={`${option.label} ${option.sublabel ?? ""}`}
      onSelect={() => onToggle(option.value)}
    >
      <div
        className={cn(
          "mr-2 h-4 w-4 rounded border flex items-center justify-center",
          values.has(option.value)
            ? "bg-primary border-primary"
            : "bg-background"
        )}
      >
        {values.has(option.value) && (
          <Check className="h-3 w-3 text-white" />
        )}
      </div>
      <span>{option.label}</span>
    </CommandItem>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-between">
          {values.size === 0
            ? placeholder
            : `${values.size} selected`}
          <ChevronsUpDown className="ml-2 h-4 w-4 opacity-40" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>No results</CommandEmpty>
            {[...grouped.entries()].map(([group, opts]) => (
              <CommandGroup key={group} heading={group || undefined}>
                {opts.map(renderItem)}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ── Main ─────────────────────────────────────

export default function LogEntry() {
  const { toast } = useToast();
  const { data: parts } = useParts();
  const { data: rejectionTypes } = useRejectionTypes();
  const { data: reworkTypes } = useReworkTypes();
  const createRejection = useCreateRejectionEntry();
  const createRework = useCreateReworkEntry();

  const [partId, setPartId] = useState("");
  const [kind, setKind] = useState<EntryKind>("rejection");
  const [typeKeys, setTypeKeys] = useState<Set<string>>(new Set());
  const [quantity, setQuantity] = useState("1");
  const [remarks, setRemarks] = useState("");
  const [entryDate, setEntryDate] = useState(
    format(new Date(), "yyyy-MM-dd")
  );
  const [recentlyLogged, setRecentlyLogged] = useState<LoggedEntry[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ✅ Combined logic
  const allTypes = useMemo<UnifiedType[]>(() => {
    const rw = (reworkTypes ?? []).map((t: any) => ({
      id: `rw-${t.id}`,
      kind: "rework",
      code: t.reworkCode,
      reason: t.reason,
      zone: t.zone ?? null,
      rawId: t.id,
    }));

    const rej = (rejectionTypes ?? []).map((t: any) => ({
      id: `rej-${t.id}`,
      kind: "rejection",
      code: t.rejectionCode,
      reason: t.reason,

      // ✅ SMART ZONE LOGIC
      zone:
        t.type &&
        t.type !== "rejection" &&
        t.type !== "rework"
          ? t.type
          : null,

      rawId: t.id,
    }));

    return [...rw, ...rej];
  }, [reworkTypes, rejectionTypes]);

  const selectedTypes = allTypes.filter((t) =>
    typeKeys.has(t.id)
  );

  const toggleType = (id: string) => {
    setTypeKeys((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!partId || typeKeys.size === 0) return;

    setIsSubmitting(true);
    const qty = parseInt(quantity);

    try {
      const newLogged: LoggedEntry[] = [];

      for (const t of selectedTypes) {
        if (t.kind === "rework") {
          await new Promise<void>((resolve, reject) => {
            createRework.mutate(
              {
                partId: +partId,
                reworkTypeId: t.rawId,
                quantity: qty,
                remarks,
                entryDate,
              },
              {
                onSuccess: (res: any) => {
                  newLogged.push({
                    id: res.id,
                    kind: "rework",
                    partNumber: "",
                    code: t.code,
                    zone: t.zone,
                    quantity: qty,
                    date: entryDate,
                  });
                  resolve();
                },
                onError: reject,
              }
            );
          });
        } else {
          await new Promise<void>((resolve, reject) => {
            createRejection.mutate(
              {
                partId: +partId,
                rejectionTypeId: t.rawId,
                quantity: qty,
                remarks,
                entryDate,
              },
              {
                onSuccess: (res: any) => {
                  newLogged.push({
                    id: res.id,
                    kind: "rejection",
                    partNumber: "",
                    code: t.code,
                    zone: t.zone,
                    quantity: qty,
                    date: entryDate,
                  });
                  resolve();
                },
                onError: reject,
              }
            );
          });
        }
      }

      setRecentlyLogged((prev) => [...newLogged, ...prev]);

      toast({ title: "Entries logged" });

      setTypeKeys(new Set());
      setQuantity("1");
      setRemarks("");
    } catch (e: any) {
      toast({ title: "Error", description: e.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-xl font-semibold">New Entry</h1>

      <MultiSearchableSelect
        options={allTypes.map((t) => ({
          value: t.id,
          label: t.code,
          group: t.zone || "",
        }))}
        values={typeKeys}
        onToggle={toggleType}
        placeholder="Select codes"
        searchPlaceholder="Search..."
      />

      <Input
        type="number"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
      />

      <Button onClick={handleSubmit} disabled={isSubmitting}>
        {isSubmitting ? "Saving..." : "Log Entry"}
      </Button>

      {recentlyLogged.map((e) => (
        <div key={e.id} className="flex justify-between">
          <span>{e.code}</span>
          <span>{e.quantity}</span>
        </div>
      ))}
    </div>
  );
}
