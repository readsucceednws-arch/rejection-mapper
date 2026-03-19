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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, RefreshCw, CheckCircle2 } from "lucide-react";

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

export default function LogEntry() {
  const { toast } = useToast();
  const { data: parts } = useParts();
  const { data: rejectionTypes } = useRejectionTypes();
  const { data: reworkTypes } = useReworkTypes();
  const createRejection = useCreateRejectionEntry();
  const createRework = useCreateReworkEntry();

  const [entryType, setEntryType] = useState<EntryType>("rework");
  const [partId, setPartId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [remarks, setRemarks] = useState("");
  const [entryDate, setEntryDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [recentlyLogged, setRecentlyLogged] = useState<LoggedEntry[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleTabChange = (val: string) => {
    setEntryType(val as EntryType);
    setTypeId("");
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
                setRecentlyLogged((prev) => [{ id: created.id, type: "rework", partNumber: part?.partNumber ?? "", code: reworkType?.reworkCode ?? "", quantity: qty, date: entryDate, remarks: remarks || undefined }, ...prev.slice(0, 9)]);
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
                setRecentlyLogged((prev) => [{ id: created.id, type: "rejection", partNumber: part?.partNumber ?? "", code: rejType?.rejectionCode ?? "", quantity: qty, date: entryDate, remarks: remarks || undefined }, ...prev.slice(0, 9)]);
                resolve();
              },
              onError: reject,
            }
          );
        });
      }

      toast({ title: "Entry logged", description: `${qty} × ${parts?.find(p => p.id === parseInt(partId))?.partNumber} saved.` });
      setQuantity("1");
      setRemarks("");
    } catch (err: any) {
      toast({ title: "Failed to log entry", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const sortedParts = [...(parts ?? [])].sort((a, b) => a.partNumber.localeCompare(b.partNumber));

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
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Part</label>
                <Select value={partId} onValueChange={setPartId} data-testid="select-part">
                  <SelectTrigger data-testid="select-trigger-part">
                    <SelectValue placeholder="Select part…" />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedParts.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)} data-testid={`option-part-${p.id}`}>
                        {p.partNumber}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <TabsContent value="rework" className="mt-0 p-0">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Rework Type</label>
                  <Select value={typeId} onValueChange={setTypeId} data-testid="select-rework-type">
                    <SelectTrigger data-testid="select-trigger-rework-type">
                      <SelectValue placeholder="Select rework type…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(reworkTypes ?? []).map((t) => (
                        <SelectItem key={t.id} value={String(t.id)} data-testid={`option-rw-${t.id}`}>
                          {t.reworkCode} — {t.reason}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>

              <TabsContent value="rejection" className="mt-0 p-0">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Rejection Type</label>
                  <Select value={typeId} onValueChange={setTypeId} data-testid="select-rejection-type">
                    <SelectTrigger data-testid="select-trigger-rejection-type">
                      <SelectValue placeholder="Select rejection type…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(rejectionTypes ?? []).map((t) => (
                        <SelectItem key={t.id} value={String(t.id)} data-testid={`option-rej-${t.id}`}>
                          {t.rejectionCode} — {t.reason}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>

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

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Remarks <span className="text-muted-foreground font-normal">(optional)</span></label>
                <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Any additional notes…" data-testid="input-remarks" />
              </div>

              <Button className="w-full" onClick={handleSubmit} disabled={isSubmitting || !partId || !typeId} data-testid="button-log-entry">
                {isSubmitting ? <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                {isSubmitting ? "Saving…" : "Log Entry"}
              </Button>
            </div>
          </Tabs>
        </CardContent>
      </Card>

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
