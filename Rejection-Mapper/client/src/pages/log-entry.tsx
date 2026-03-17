import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
import { insertRejectionEntrySchema } from "@shared/schema";
import { useParts } from "@/hooks/use-parts";
import { useRejectionTypes } from "@/hooks/use-rejection-types";
import { useReworkTypes } from "@/hooks/use-rework-types";
import { useCreateRejectionEntry } from "@/hooks/use-rejection-entries";
import { useCreateReworkEntry } from "@/hooks/use-rework-entries";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Save, AlertCircle, Plus, Trash2, Upload, ChevronDown, Package, AlertTriangle, RefreshCw, Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

interface EntryItem {
  id: string;
  purpose: "rejection" | "rework";
  rejectionTypeId: number;
  quantity: number;
}

const formSchema = z.object({
  partId: z.coerce.number().min(1, "Please select a part"),
  entryDate: z.string().optional(),
  remarks: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

async function parseFile(file: File): Promise<Record<string, string>[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "xlsx" || ext === "xls") {
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
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (values[i] ?? "").replace(/^"|"$/g, "").trim(); });
    return obj;
  });
}

export default function LogEntry() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [entries, setEntries] = useState<EntryItem[]>([]);
  const [newEntry, setNewEntry] = useState<Omit<EntryItem, "id">>({
    purpose: "rejection",
    rejectionTypeId: 0,
    quantity: 1,
  });
  const [refOpen, setRefOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [partOpen, setPartOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: parts, isLoading: isLoadingParts } = useParts();
  const { data: rejectionTypes, isLoading: isLoadingTypes } = useRejectionTypes();
  const { data: reworkTypes } = useReworkTypes();
  const createRejectionMutation = useCreateRejectionEntry();
  const createReworkMutation = useCreateReworkEntry();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      partId: 0,
      entryDate: new Date().toISOString().split("T")[0],
      remarks: "",
    },
  });

  const selectedPartId = form.watch("partId");
  const totalQuantity = entries.reduce((sum, e) => sum + e.quantity, 0);
  const isSaving = createRejectionMutation.isPending || createReworkMutation.isPending;
  const rejectionOnlyTypes = rejectionTypes?.filter((t) => t.type === "rejection") ?? [];
  const reworkOnlyTypes = rejectionTypes?.filter((t) => t.type === "rework") ?? [];

  const addEntry = () => {
    if (newEntry.rejectionTypeId === 0) {
      toast({ title: "Error", description: "Please select a reason", variant: "destructive" });
      return;
    }
    setEntries([...entries, { ...newEntry, id: Date.now().toString() }]);
    setNewEntry({ purpose: "rejection", rejectionTypeId: 0, quantity: 1 });
  };

  const removeEntry = (id: string) => {
    setEntries(entries.filter(e => e.id !== id));
  };

  const onSubmit = async (data: FormValues) => {
    if (entries.length === 0) {
      toast({ title: "Error", description: "Please add at least one entry", variant: "destructive" });
      return;
    }

    try {
      for (const entry of entries) {
        await new Promise((resolve, reject) => {
          if (entry.purpose === "rework") {
            createReworkMutation.mutate(
              {
                partId: data.partId,
                reworkTypeId: entry.rejectionTypeId,
                quantity: entry.quantity,
                remarks: data.remarks,
                entryDate: data.entryDate || undefined,
              },
              { onSuccess: resolve, onError: reject }
            );
            return;
          }

          createRejectionMutation.mutate(
            {
              partId: data.partId,
              rejectionTypeId: entry.rejectionTypeId,
              quantity: entry.quantity,
              remarks: data.remarks,
              entryDate: data.entryDate || undefined,
            },
            { onSuccess: resolve, onError: reject }
          );
        });
      }
      toast({ title: "Entries Logged", description: `${entries.length} entries have been recorded.` });
      form.reset();
      setEntries([]);
      setLocation("/entries");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to log entries";
      toast({ title: "Error", description: message, variant: "destructive" });
    }
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
      const purpose = (row["purpose"] || "rejection").toLowerCase() as "rejection" | "rework";
      const codeOrReason = row["code"] || row["reason"] || row["rejection code"] || row["rework code"] || "";
      const quantity = parseInt(row["quantity"] || row["qty"] || "1") || 1;
      const remarks = row["remarks"] || row["notes"] || "";
      const entryDate = row["date"] || row["entry date"] || row["entrydate"] || "";

      const part = parts?.find(
        p => p.partNumber.toLowerCase() === partNumber?.toLowerCase()
      );
      const rejType = purpose === "rework"
        ? reworkTypes?.find(
            t => t.reworkCode.toLowerCase() === codeOrReason.toLowerCase() ||
                 t.reason.toLowerCase() === codeOrReason.toLowerCase()
          )
        : rejectionTypes?.find(
            t => t.rejectionCode.toLowerCase() === codeOrReason.toLowerCase() ||
                 t.reason.toLowerCase() === codeOrReason.toLowerCase()
          );

      if (!part || !rejType) {
        failCount++;
        continue;
      }

      try {
        await new Promise<void>((resolve, reject) => {
          if (purpose === "rework") {
            createReworkMutation.mutate(
              {
                partId: part.id,
                reworkTypeId: rejType.id,
                quantity,
                remarks: remarks || undefined,
                entryDate: entryDate || undefined,
              },
              { onSuccess: () => resolve(), onError: reject }
            );
            return;
          }

          createRejectionMutation.mutate(
            {
              partId: part.id,
              rejectionTypeId: rejType.id,
              quantity,
              remarks: remarks || undefined,
              entryDate: entryDate || undefined,
            },
            { onSuccess: () => resolve(), onError: reject }
          );
        });
        successCount++;
      } catch {
        failCount++;
      }
    }

    setIsImporting(false);

    if (successCount > 0) {
      toast({
        title: "Import Complete",
        description: `${successCount} entries imported${failCount > 0 ? `, ${failCount} skipped (unknown part/code)` : ""}.`,
      });
      if (successCount > 0) setLocation("/entries");
    } else {
      toast({
        title: "Import Failed",
        description: "No entries could be imported. Check that part numbers and reason codes match exactly.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Log Entry</h1>
          <p className="text-muted-foreground mt-1 text-sm">Enter details for new part records</p>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={handleImportCSV}
            data-testid="input-import-csv"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting || isLoadingParts || isLoadingTypes}
            className="gap-2"
            data-testid="button-import-csv"
          >
            <Upload className="w-4 h-4" />
            {isImporting ? "Importing..." : "Import CSV"}
          </Button>
        </div>
      </div>

      <Card className="border-border/50 shadow-md shadow-black/5">
        <CardHeader className="bg-muted/30 border-b border-border/50 rounded-t-xl">
          <CardTitle className="text-xl flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-primary" />
            New Entry Form
          </CardTitle>
          <CardDescription>All fields marked with an asterisk are required.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="partId"
                render={({ field }) => {
                  const selectedPart = parts?.find((p) => p.id === Number(field.value));
                  return (
                    <FormItem className="flex flex-col">
                      <FormLabel>Part Number *</FormLabel>
                      <Popover open={partOpen} onOpenChange={setPartOpen}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={partOpen}
                              disabled={isLoadingParts}
                              data-testid="select-part"
                              className={cn(
                                "w-full justify-between font-normal bg-background focus:ring-primary/20",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {selectedPart ? (
                                <span>
                                  <span className="font-medium">{selectedPart.partNumber}</span>
                                  {selectedPart.description && (
                                    <span className="text-muted-foreground ml-2">- {selectedPart.description}</span>
                                  )}
                                </span>
                              ) : (
                                "Select a part..."
                              )}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Search by part number or description..." />
                            <CommandList>
                              <CommandEmpty>No part found.</CommandEmpty>
                              <CommandGroup>
                                {parts?.map((part) => (
                                  <CommandItem
                                    key={part.id}
                                    value={`${part.partNumber} ${part.description ?? ""}`}
                                    onSelect={() => {
                                      field.onChange(part.id.toString());
                                      setPartOpen(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4 shrink-0",
                                        Number(field.value) === part.id ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    <span className="font-medium">{part.partNumber}</span>
                                    {part.description && (
                                      <span className="text-muted-foreground ml-2 truncate">- {part.description}</span>
                                    )}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              <FormField
                control={form.control}
                name="entryDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        className="bg-background focus:ring-primary/20"
                        {...field}
                        value={field.value || ""}
                        data-testid="input-entry-date"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="border border-border/50 rounded-lg p-4 space-y-4 bg-muted/20">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">Entry Items</h3>
                  <div className="text-sm font-bold text-primary">Total Qty: {totalQuantity}</div>
                </div>

                {entries.length > 0 && (
                  <div className="space-y-2 border-t border-border/50 pt-4">
                    {entries.map((entry) => {
                      const rejType = entry.purpose === "rejection"
                        ? rejectionTypes?.find(t => t.id === entry.rejectionTypeId)
                        : null;
                      const rwType = entry.purpose === "rework"
                        ? reworkTypes?.find(t => t.id === entry.rejectionTypeId)
                        : null;
                      const displayCode = rejType?.rejectionCode ?? rwType?.reworkCode ?? "Unknown";
                      return (
                        <div key={entry.id} className="flex items-center justify-between p-3 bg-background rounded border border-border/30">
                          <div className="flex-1">
                            <div className="text-sm font-medium flex items-center gap-2">
                              <span className="font-mono">{displayCode}</span>
                              <span className="text-muted-foreground text-xs">({entry.purpose})</span>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              <span>Qty: {entry.quantity}</span>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeEntry(entry.id)}
                            className="text-destructive hover:text-destructive"
                            data-testid={`button-remove-entry-${entry.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="border-t border-border/50 pt-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Purpose *</label>
                      <Select
                        value={newEntry.purpose}
                        onValueChange={(value) => setNewEntry({ ...newEntry, purpose: value as "rejection" | "rework", rejectionTypeId: 0 })}
                      >
                        <SelectTrigger className="h-8 text-sm mt-1 bg-background focus:ring-primary/20" data-testid="select-purpose">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="rejection">Rejection</SelectItem>
                          <SelectItem value="rework">Rework</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Rejection Code *</label>
                      {(() => {
                        const codeOptions =
                          newEntry.purpose === "rejection"
                            ? (rejectionTypes ?? []).map((t) => ({
                                id: t.id,
                                code: t.rejectionCode,
                                reason: t.reason,
                              }))
                            : (reworkTypes ?? []).map((t) => ({
                                id: t.id,
                                code: t.reworkCode,
                                reason: t.reason,
                              }));
                        const selectedOption = codeOptions.find((o) => o.id === newEntry.rejectionTypeId);
                        return (
                          <Popover open={codeOpen} onOpenChange={setCodeOpen}>
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                role="combobox"
                                aria-expanded={codeOpen}
                                data-testid="select-reason"
                                className={cn(
                                  "w-full h-8 text-sm mt-1 justify-between font-normal bg-background focus:ring-primary/20",
                                  !selectedOption && "text-muted-foreground"
                                )}
                              >
                                {selectedOption ? (
                                  <span>
                                    <span className="font-mono font-medium">{selectedOption.code}</span>
                                    {selectedOption.reason && (
                                      <span className="text-muted-foreground ml-1 truncate"> – {selectedOption.reason}</span>
                                    )}
                                  </span>
                                ) : (
                                  "Select code..."
                                )}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                              <Command>
                                <CommandInput placeholder="Search code or reason..." />
                                <CommandList>
                                  <CommandEmpty>No code found.</CommandEmpty>
                                  <CommandGroup>
                                    {codeOptions.map((opt) => (
                                      <CommandItem
                                        key={opt.id}
                                        value={`${opt.code} ${opt.reason ?? ""}`}
                                        onSelect={() => {
                                          setNewEntry({ ...newEntry, rejectionTypeId: opt.id });
                                          setCodeOpen(false);
                                        }}
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-4 w-4 shrink-0",
                                            newEntry.rejectionTypeId === opt.id ? "opacity-100" : "opacity-0"
                                          )}
                                        />
                                        <span className="font-mono font-medium">{opt.code}</span>
                                        {opt.reason && (
                                          <span className="text-muted-foreground ml-2 truncate">– {opt.reason}</span>
                                        )}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        );
                      })()}
                    </div>

                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Quantity *</label>
                      <Input
                        type="number"
                        min="1"
                        value={newEntry.quantity}
                        onChange={(e) => setNewEntry({ ...newEntry, quantity: parseInt(e.target.value) || 1 })}
                        className="h-8 text-sm mt-1 bg-background focus:ring-primary/20"
                        data-testid="input-quantity"
                      />
                    </div>
                  </div>

                  <Button
                    type="button"
                    onClick={addEntry}
                    variant="outline"
                    className="w-full"
                    data-testid="button-add-entry"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Entry
                  </Button>
                </div>
              </div>

              <FormField
                control={form.control}
                name="remarks"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Remarks (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Add any additional context or operator notes here..."
                        className="resize-none h-24 bg-background focus:ring-primary/20"
                        {...field}
                        value={field.value || ""}
                        data-testid="input-remarks"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end pt-4 border-t border-border/50">
                <Button
                  type="submit"
                  disabled={isSaving || entries.length === 0}
                  className="px-8 shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300"
                  data-testid="button-save-entries"
                >
                  {isSaving ? (
                    "Saving..."
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Save {entries.length > 0 ? `${entries.length} Entries` : "Entries"}
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Collapsible open={refOpen} onOpenChange={setRefOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full flex items-center justify-between border border-border/50 rounded-lg px-4 py-3 h-auto bg-card hover:bg-muted/30"
            data-testid="button-reference-panel"
          >
            <span className="font-semibold text-sm">Reference — Parts, Rejection Reasons & Rework Types</span>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${refOpen ? "rotate-180" : ""}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 mt-2">
          <Card className="border-border/50">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Package className="w-4 h-4 text-primary" />
                Available Parts
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {parts && parts.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {parts.map((part) => (
                    <div key={part.id} className="flex items-start gap-2 p-2 rounded bg-muted/30 text-sm" data-testid={`ref-part-${part.id}`}>
                      <Badge variant="outline" className="shrink-0 text-xs font-mono">{part.partNumber}</Badge>
                      <span className="text-muted-foreground text-xs">{part.description || "—"}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No parts configured yet.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive" />
                Rejection Reasons
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {rejectionOnlyTypes.length > 0 ? (
                <div className="space-y-1.5">
                  {rejectionOnlyTypes.map((t) => (
                    <div key={t.id} className="flex items-center gap-3 p-2 rounded bg-muted/30 text-sm" data-testid={`ref-rejection-${t.id}`}>
                      <Badge variant="outline" className="shrink-0 text-xs font-mono bg-destructive/10 text-destructive border-destructive/20">{t.rejectionCode}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No rejection reasons configured yet.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-blue-500" />
                Rework Types
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {reworkTypes && reworkTypes.length > 0 ? (
                <div className="space-y-1.5">
                  {reworkTypes.map((t) => (
                    <div key={t.id} className="flex items-center gap-3 p-2 rounded bg-muted/30 text-sm" data-testid={`ref-rework-${t.id}`}>
                      <Badge variant="outline" className="shrink-0 text-xs font-mono bg-blue-500/10 text-blue-600 border-blue-400/30">{t.reworkCode}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No rework types configured yet.</p>
              )}
              {reworkOnlyTypes.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border/30 space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Also from Rejection Reasons (Rework purpose):</p>
                  {reworkOnlyTypes.map((t) => (
                    <div key={t.id} className="flex items-center gap-3 p-2 rounded bg-muted/30 text-sm" data-testid={`ref-rework-rej-${t.id}`}>
                      <Badge variant="outline" className="shrink-0 text-xs font-mono bg-blue-500/10 text-blue-600 border-blue-400/30">{t.rejectionCode}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
