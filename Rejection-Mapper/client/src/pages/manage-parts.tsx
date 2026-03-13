import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertPartSchema } from "@shared/schema";
import { useParts, useCreatePart, useUpdatePart, useDeletePart, useBulkDeleteParts } from "@/hooks/use-parts";
import { useUser } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import type { Part } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Plus, Package, Search, Pencil, Trash2 } from "lucide-react";

type FormValues = z.infer<typeof insertPartSchema>;

function PartForm({
  defaultValues,
  onSubmit,
  isPending,
  onCancel,
  submitLabel,
}: {
  defaultValues: FormValues;
  onSubmit: (data: FormValues) => void;
  isPending: boolean;
  onCancel: () => void;
  submitLabel: string;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(insertPartSchema),
    defaultValues,
  });
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
        <FormField control={form.control} name="partNumber" render={({ field }) => (
          <FormItem>
            <FormLabel>Part Number *</FormLabel>
            <FormControl><Input placeholder="e.g. PN-10045" {...field} data-testid="input-part-number" /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="description" render={({ field }) => (
          <FormItem>
            <FormLabel>Description (Optional)</FormLabel>
            <FormControl><Input placeholder="Brief description of the part" {...field} value={field.value || ""} data-testid="input-part-description" /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="price" render={({ field }) => (
          <FormItem>
            <FormLabel>Price *</FormLabel>
            <FormControl>
              <Input type="number" placeholder="0.00" step="0.01" min="0" {...field}
                onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                data-testid="input-part-price" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={isPending} data-testid="button-submit-part">
            {isPending ? "Saving..." : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export default function ManageParts() {
  const { data: parts, isLoading } = useParts();
  const { data: currentUser } = useUser();
  const createMutation = useCreatePart();
  const updateMutation = useUpdatePart();
  const deleteMutation = useDeletePart();
  const bulkDeleteMutation = useBulkDeleteParts();
  const { toast } = useToast();

  const isAdmin = currentUser?.role === "admin";

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editPart, setEditPart] = useState<Part | null>(null);
  const [deletePart, setDeletePart] = useState<Part | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);

  const filteredParts = (parts ?? []).filter(p =>
    p.partNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.description && p.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const allSelected = filteredParts.length > 0 && filteredParts.every((p) => selectedIds.has(p.id));
  const someSelected = selectedIds.size > 0;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredParts.map((p) => p.id)));
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleCreate = (data: FormValues) => {
    createMutation.mutate(data, {
      onSuccess: () => {
        toast({ title: "Part Created", description: "Successfully added new part." });
        setIsAddOpen(false);
      },
      onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
    });
  };

  const handleUpdate = (data: FormValues) => {
    if (!editPart) return;
    updateMutation.mutate({ id: editPart.id, data }, {
      onSuccess: () => {
        toast({ title: "Part Updated", description: "Part details have been saved." });
        setEditPart(null);
      },
      onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
    });
  };

  const handleDelete = () => {
    if (!deletePart) return;
    deleteMutation.mutate(deletePart.id, {
      onSuccess: () => {
        toast({ title: "Part Deleted", description: `${deletePart.partNumber} has been removed.` });
        setDeletePart(null);
      },
      onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
    });
  };

  const handleBulkDelete = () => {
    const ids = Array.from(selectedIds);
    bulkDeleteMutation.mutate(ids, {
      onSuccess: () => {
        toast({ title: "Deleted", description: `${ids.length} part${ids.length !== 1 ? "s" : ""} removed.` });
        setSelectedIds(new Set());
        setShowBulkConfirm(false);
      },
      onError: (err) => {
        toast({ title: "Error", description: err.message, variant: "destructive" });
        setShowBulkConfirm(false);
      },
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Manage Parts</h1>
          <p className="text-muted-foreground mt-1 text-sm">Database of manufactured items</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && someSelected && (
            <Button
              variant="destructive"
              onClick={() => setShowBulkConfirm(true)}
              data-testid="button-bulk-delete-parts"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Selected ({selectedIds.size})
            </Button>
          )}
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="shadow-md shadow-primary/20" data-testid="button-add-part">
                <Plus className="w-4 h-4 mr-2" />Add New Part
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add New Part</DialogTitle>
                <DialogDescription>Create a new part number for the rejection logger.</DialogDescription>
              </DialogHeader>
              <PartForm
                defaultValues={{ partNumber: "", description: "", price: 0 }}
                onSubmit={handleCreate}
                isPending={createMutation.isPending}
                onCancel={() => setIsAddOpen(false)}
                submitLabel="Save Part"
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="border-border/50 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border/50 bg-muted/20 flex items-center">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input type="search" placeholder="Search parts..." className="pl-9 bg-background"
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} data-testid="input-search-parts" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                {isAdmin && (
                  <TableHead className="w-[44px]">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all"
                      data-testid="checkbox-select-all-parts"
                    />
                  </TableHead>
                )}
                <TableHead>Part Number</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={isAdmin ? 5 : 4} className="text-center py-8 text-muted-foreground">Loading parts...</TableCell></TableRow>
              ) : filteredParts.length > 0 ? (
                filteredParts.map((part) => (
                  <TableRow
                    key={part.id}
                    className={`hover:bg-muted/30 transition-colors ${selectedIds.has(part.id) ? "bg-muted/40" : ""}`}
                    data-testid={`row-part-${part.id}`}
                  >
                    {isAdmin && (
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(part.id)}
                          onCheckedChange={() => toggleSelect(part.id)}
                          aria-label={`Select ${part.partNumber}`}
                          data-testid={`checkbox-part-${part.id}`}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-semibold text-primary">
                      <div className="flex items-center gap-2"><Package className="w-4 h-4 text-muted-foreground" />{part.partNumber}</div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{part.description || "—"}</TableCell>
                    <TableCell className="text-right font-medium">₹{Number(part.price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => setEditPart(part)} data-testid={`button-edit-part-${part.id}`}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeletePart(part)} data-testid={`button-delete-part-${part.id}`}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 5 : 4} className="text-center py-12">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <Package className="h-8 w-8 mb-2 opacity-20" /><p>No parts found</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editPart} onOpenChange={(o) => !o && setEditPart(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Part</DialogTitle>
            <DialogDescription>Update part details.</DialogDescription>
          </DialogHeader>
          {editPart && (
            <PartForm
              defaultValues={{ partNumber: editPart.partNumber, description: editPart.description || "", price: Number(editPart.price) }}
              onSubmit={handleUpdate}
              isPending={updateMutation.isPending}
              onCancel={() => setEditPart(null)}
              submitLabel="Save Changes"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Single Delete Confirm */}
      <AlertDialog open={!!deletePart} onOpenChange={(o) => !o && setDeletePart(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Part?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{deletePart?.partNumber}</strong> and all log entries associated with it. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90" data-testid="button-confirm-delete-part">
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirm */}
      <AlertDialog open={showBulkConfirm} onOpenChange={setShowBulkConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Selected Items?</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to delete <strong>{selectedIds.size}</strong> part{selectedIds.size !== 1 ? "s" : ""}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-bulk-delete-parts"
            >
              {bulkDeleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
