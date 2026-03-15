import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertReworkTypeSchema } from "@shared/schema";
import { useReworkTypes, useCreateReworkType, useUpdateReworkType, useDeleteReworkType, useBulkDeleteReworkTypes } from "@/hooks/use-rework-types";
import { useUser } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import type { ReworkType } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { Plus, Wrench, Search, Pencil, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type FormValues = z.infer<typeof insertReworkTypeSchema>;

function ReworkTypeForm({
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
    resolver: zodResolver(insertReworkTypeSchema),
    defaultValues,
  });
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
        <FormField control={form.control} name="reworkCode" render={({ field }) => (
          <FormItem>
            <FormLabel>Rework Code *</FormLabel>
            <FormControl><Input placeholder="e.g. RW-001" {...field} data-testid="input-rework-code" /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="reason" render={({ field }) => (
          <input type="hidden" {...field} value={field.value || ""} />
        )} />
        <FormField control={form.control} name="zone" render={({ field }) => (
          <FormItem>
            <FormLabel>Zone</FormLabel>
            <FormControl>
              <Input
                placeholder="e.g. Zone A, Line 2, Cell 3..."
                {...field}
                value={field.value || ""}
                data-testid="input-rework-zone"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={isPending} data-testid="button-submit-rework-type">
            {isPending ? "Saving..." : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export default function ManageReworkTypes() {
  const { data: types, isLoading } = useReworkTypes();
  const { data: currentUser } = useUser();
  const createMutation = useCreateReworkType();
  const updateMutation = useUpdateReworkType();
  const deleteMutation = useDeleteReworkType();
  const bulkDeleteMutation = useBulkDeleteReworkTypes();
  const { toast } = useToast();

  const isAdmin = currentUser?.role === "admin";

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editType, setEditType] = useState<ReworkType | null>(null);
  const [deleteType, setDeleteType] = useState<ReworkType | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);

  const filtered = (types ?? []).filter(
    (t) => t.reworkCode.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const allSelected = filtered.length > 0 && filtered.every((t) => selectedIds.has(t.id));
  const someSelected = selectedIds.size > 0;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((t) => t.id)));
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
    createMutation.mutate({ ...data, reason: data.reworkCode }, {
      onSuccess: () => {
        toast({ title: "Rework Created", description: "Successfully added new rework code." });
        setIsAddOpen(false);
      },
      onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
    });
  };

  const handleUpdate = (data: FormValues) => {
    if (!editType) return;
    updateMutation.mutate({ id: editType.id, data: { ...data, reason: data.reworkCode } }, {
      onSuccess: () => {
        toast({ title: "Rework Updated", description: "Changes have been saved." });
        setEditType(null);
      },
      onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
    });
  };

  const handleDelete = () => {
    if (!deleteType) return;
    deleteMutation.mutate(deleteType.id, {
      onSuccess: () => {
        toast({ title: "Rework Deleted", description: `${deleteType.reworkCode} has been removed.` });
        setDeleteType(null);
      },
      onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
    });
  };

  const handleBulkDelete = () => {
    const ids = Array.from(selectedIds);
    bulkDeleteMutation.mutate(ids, {
      onSuccess: () => {
        toast({ title: "Deleted", description: `${ids.length} rework type${ids.length !== 1 ? "s" : ""} removed.` });
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Manage Rework</h1>
          <p className="text-muted-foreground mt-1 text-sm">Add and manage rework codes</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && someSelected && (
            <Button
              variant="destructive"
              onClick={() => setShowBulkConfirm(true)}
              data-testid="button-bulk-delete-rework-types"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Selected ({selectedIds.size})
            </Button>
          )}
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="shadow-md shadow-primary/20" data-testid="button-add-rework-type">
                <Plus className="w-4 h-4 mr-2" />Add Rework
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Rework</DialogTitle>
                <DialogDescription>Create a new rework code for logging entries.</DialogDescription>
              </DialogHeader>
              <ReworkTypeForm
                defaultValues={{ reworkCode: "", reason: "", zone: "" }}
                onSubmit={handleCreate}
                isPending={createMutation.isPending}
                onCancel={() => setIsAddOpen(false)}
                submitLabel="Create"
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="border-border/50 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border/50 bg-muted/20">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search rework..." value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 bg-background"
              data-testid="input-search-rework-types" />
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
                      data-testid="checkbox-select-all-rework-types"
                    />
                  </TableHead>
                )}
                <TableHead>Rework Code</TableHead>
                <TableHead>Zone</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(4)].map((_, i) => (
                  <TableRow key={i}><TableCell colSpan={isAdmin ? 5 : 4}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 5 : 4} className="text-center py-12">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <Wrench className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p>{searchTerm ? "No rework codes match your search." : "No rework codes added yet."}</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((t) => (
                  <TableRow
                    key={t.id}
                    className={`hover:bg-muted/30 transition-colors ${selectedIds.has(t.id) ? "bg-muted/40" : ""}`}
                    data-testid={`row-rework-type-${t.id}`}
                  >
                    {isAdmin && (
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(t.id)}
                          onCheckedChange={() => toggleSelect(t.id)}
                          aria-label={`Select ${t.reworkCode}`}
                          data-testid={`checkbox-rework-type-${t.id}`}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-mono font-medium">{t.reworkCode}</TableCell>
                    <TableCell>
                      {t.zone ? (
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                          {t.zone}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => setEditType(t)} data-testid={`button-edit-rework-type-${t.id}`}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteType(t)} data-testid={`button-delete-rework-type-${t.id}`}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editType} onOpenChange={(o) => !o && setEditType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Rework</DialogTitle>
            <DialogDescription>Update the rework code details.</DialogDescription>
          </DialogHeader>
          {editType && (
            <ReworkTypeForm
              defaultValues={{ reworkCode: editType.reworkCode, reason: editType.reason || editType.reworkCode, zone: editType.zone || "" }}
              onSubmit={handleUpdate}
              isPending={updateMutation.isPending}
              onCancel={() => setEditType(null)}
              submitLabel="Save Changes"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Single Delete Confirm */}
      <AlertDialog open={!!deleteType} onOpenChange={(o) => !o && setDeleteType(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Rework?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{deleteType?.reworkCode}</strong> and all log entries that use this rework code. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90" data-testid="button-confirm-delete-rework-type">
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
              You are about to delete <strong>{selectedIds.size}</strong> item{selectedIds.size !== 1 ? "s" : ""}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-bulk-delete-rework-types"
            >
              {bulkDeleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

  isPending: boolean;
  onCancel: () => void;
  submitLabel: string;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(insertReworkTypeSchema),
    defaultValues,
  });
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
        <FormField control={form.control} name="reworkCode" render={({ field }) => (
          <FormItem>
            <FormLabel>Rework Code *</FormLabel>
            <FormControl><Input placeholder="e.g. RW-001" {...field} data-testid="input-rework-code" /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="reason" render={({ field }) => (
          <FormItem>
            <FormLabel>Reason</FormLabel>
            <FormControl><Input placeholder="e.g. Surface defect rework" {...field} value={field.value || ""} data-testid="input-rework-reason" /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="zone" render={({ field }) => (
          <FormItem>
            <FormLabel>Zone</FormLabel>
            <FormControl>
              <Input
                placeholder="e.g. Zone A, Line 2, Cell 3..."
                {...field}
                value={field.value || ""}
                data-testid="input-rework-zone"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={isPending} data-testid="button-submit-rework-type">
            {isPending ? "Saving..." : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export default function ManageReworkTypes() {
  const { data: types, isLoading } = useReworkTypes();
  const { data: currentUser } = useUser();
  const createMutation = useCreateReworkType();
  const updateMutation = useUpdateReworkType();
  const deleteMutation = useDeleteReworkType();
  const bulkDeleteMutation = useBulkDeleteReworkTypes();
  const { toast } = useToast();

  const isAdmin = currentUser?.role === "admin";

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editType, setEditType] = useState<ReworkType | null>(null);
  const [deleteType, setDeleteType] = useState<ReworkType | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);

  const filtered = (types ?? []).filter(
    (t) => t.reworkCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.reason.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const allSelected = filtered.length > 0 && filtered.every((t) => selectedIds.has(t.id));
  const someSelected = selectedIds.size > 0;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((t) => t.id)));
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
        toast({ title: "Rework Type Created", description: "Successfully added new rework type." });
        setIsAddOpen(false);
      },
      onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
    });
  };

  const handleUpdate = (data: FormValues) => {
    if (!editType) return;
    updateMutation.mutate({ id: editType.id, data }, {
      onSuccess: () => {
        toast({ title: "Rework Type Updated", description: "Changes have been saved." });
        setEditType(null);
      },
      onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
    });
  };

  const handleDelete = () => {
    if (!deleteType) return;
    deleteMutation.mutate(deleteType.id, {
      onSuccess: () => {
        toast({ title: "Rework Type Deleted", description: `${deleteType.reworkCode} has been removed.` });
        setDeleteType(null);
      },
      onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
    });
  };

  const handleBulkDelete = () => {
    const ids = Array.from(selectedIds);
    bulkDeleteMutation.mutate(ids, {
      onSuccess: () => {
        toast({ title: "Deleted", description: `${ids.length} rework type${ids.length !== 1 ? "s" : ""} removed.` });
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Manage Rework Types</h1>
          <p className="text-muted-foreground mt-1 text-sm">Add and manage rework reason codes</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && someSelected && (
            <Button
              variant="destructive"
              onClick={() => setShowBulkConfirm(true)}
              data-testid="button-bulk-delete-rework-types"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Selected ({selectedIds.size})
            </Button>
          )}
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="shadow-md shadow-primary/20" data-testid="button-add-rework-type">
                <Plus className="w-4 h-4 mr-2" />Add Rework Type
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Rework Type</DialogTitle>
                <DialogDescription>Create a new rework reason code for logging entries.</DialogDescription>
              </DialogHeader>
              <ReworkTypeForm
                defaultValues={{ reworkCode: "", reason: "", zone: "" }}
                onSubmit={handleCreate}
                isPending={createMutation.isPending}
                onCancel={() => setIsAddOpen(false)}
                submitLabel="Create"
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="border-border/50 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border/50 bg-muted/20">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search rework types..." value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 bg-background"
              data-testid="input-search-rework-types" />
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
                      data-testid="checkbox-select-all-rework-types"
                    />
                  </TableHead>
                )}
                <TableHead>Rework Code</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Zone</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(4)].map((_, i) => (
                  <TableRow key={i}><TableCell colSpan={isAdmin ? 5 : 4}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 5 : 4} className="text-center py-12">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <Wrench className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p>{searchTerm ? "No rework types match your search." : "No rework types added yet."}</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((t) => (
                  <TableRow
                    key={t.id}
                    className={`hover:bg-muted/30 transition-colors ${selectedIds.has(t.id) ? "bg-muted/40" : ""}`}
                    data-testid={`row-rework-type-${t.id}`}
                  >
                    {isAdmin && (
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(t.id)}
                          onCheckedChange={() => toggleSelect(t.id)}
                          aria-label={`Select ${t.reworkCode}`}
                          data-testid={`checkbox-rework-type-${t.id}`}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-mono font-medium">{t.reworkCode}</TableCell>
                    <TableCell>{t.reason || "—"}</TableCell>
                    <TableCell>
                      {t.zone ? (
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                          {t.zone}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => setEditType(t)} data-testid={`button-edit-rework-type-${t.id}`}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteType(t)} data-testid={`button-delete-rework-type-${t.id}`}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editType} onOpenChange={(o) => !o && setEditType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Rework Type</DialogTitle>
            <DialogDescription>Update the rework type details.</DialogDescription>
          </DialogHeader>
          {editType && (
            <ReworkTypeForm
              defaultValues={{ reworkCode: editType.reworkCode, reason: editType.reason || "", zone: editType.zone || "" }}
              onSubmit={handleUpdate}
              isPending={updateMutation.isPending}
              onCancel={() => setEditType(null)}
              submitLabel="Save Changes"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Single Delete Confirm */}
      <AlertDialog open={!!deleteType} onOpenChange={(o) => !o && setDeleteType(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Rework Type?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{deleteType?.reworkCode}</strong> and all log entries that use this rework type. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90" data-testid="button-confirm-delete-rework-type">
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
              You are about to delete <strong>{selectedIds.size}</strong> item{selectedIds.size !== 1 ? "s" : ""}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-bulk-delete-rework-types"
            >
              {bulkDeleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
