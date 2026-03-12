import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertRejectionTypeSchema } from "@shared/schema";
import { useRejectionTypes, useCreateRejectionType, useUpdateRejectionType, useDeleteRejectionType } from "@/hooks/use-rejection-types";
import { useToast } from "@/hooks/use-toast";
import type { RejectionType } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { Plus, Search, Pencil, Trash2, AlertTriangle } from "lucide-react";

type FormValues = z.infer<typeof insertRejectionTypeSchema>;

function isLegacyType(t: string | null | undefined) {
  return !t || t === "rejection" || t === "rework";
}

function RejectionTypeForm({
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
    resolver: zodResolver(insertRejectionTypeSchema),
    defaultValues,
  });
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
        <FormField control={form.control} name="rejectionCode" render={({ field }) => (
          <FormItem>
            <FormLabel>Rejection Code *</FormLabel>
            <FormControl><Input placeholder="e.g. R-01" {...field} data-testid="input-rejection-code" /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="reason" render={({ field }) => (
          <FormItem>
            <FormLabel>Reason / Description</FormLabel>
            <FormControl><Input placeholder="e.g. Dimensional out of spec" {...field} value={field.value || ""} data-testid="input-rejection-reason" /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="type" render={({ field }) => (
          <FormItem>
            <FormLabel>Zone</FormLabel>
            <FormControl>
              <Input
                placeholder="e.g. Zone A, Line 2, Cell 3..."
                {...field}
                value={isLegacyType(field.value) ? "" : (field.value || "")}
                onChange={(e) => field.onChange(e.target.value)}
                data-testid="input-rejection-zone"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={isPending} data-testid="button-submit-rejection-type">
            {isPending ? "Saving..." : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export default function ManageRejectionTypes() {
  const { data: types, isLoading } = useRejectionTypes();
  const createMutation = useCreateRejectionType();
  const updateMutation = useUpdateRejectionType();
  const deleteMutation = useDeleteRejectionType();
  const { toast } = useToast();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editType, setEditType] = useState<RejectionType | null>(null);
  const [deleteType, setDeleteType] = useState<RejectionType | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const filtered = (types ?? []).filter((t) =>
    t.rejectionCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.reason.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreate = (data: FormValues) => {
    createMutation.mutate(data, {
      onSuccess: () => {
        toast({ title: "Reason Created", description: "Successfully added new rejection reason." });
        setIsAddOpen(false);
      },
      onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
    });
  };

  const handleUpdate = (data: FormValues) => {
    if (!editType) return;
    updateMutation.mutate({ id: editType.id, data }, {
      onSuccess: () => {
        toast({ title: "Reason Updated", description: "Changes have been saved." });
        setEditType(null);
      },
      onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
    });
  };

  const handleDelete = () => {
    if (!deleteType) return;
    deleteMutation.mutate(deleteType.id, {
      onSuccess: () => {
        toast({ title: "Reason Deleted", description: `${deleteType.rejectionCode} has been removed.` });
        setDeleteType(null);
      },
      onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Manage Rejection Reasons</h1>
          <p className="text-muted-foreground mt-1 text-sm">Rejection reason codes</p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button className="shadow-md shadow-primary/20" data-testid="button-add-rejection-type">
              <Plus className="w-4 h-4 mr-2" />Add Reason
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Rejection Reason</DialogTitle>
              <DialogDescription>Create a new reason code for logging entries.</DialogDescription>
            </DialogHeader>
            <RejectionTypeForm
              defaultValues={{ rejectionCode: "", reason: "", type: "" }}
              onSubmit={handleCreate}
              isPending={createMutation.isPending}
              onCancel={() => setIsAddOpen(false)}
              submitLabel="Add Reason"
            />
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-border/50 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border/50 bg-muted/20">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input type="search" placeholder="Search reasons..." className="pl-9 bg-background"
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} data-testid="input-search-rejection-types" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Zone</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : filtered.length > 0 ? (
                filtered.map((t) => (
                  <TableRow key={t.id} className="hover:bg-muted/30 transition-colors" data-testid={`row-rejection-type-${t.id}`}>
                    <TableCell>
                      <Badge variant="outline" className="bg-muted/40 text-foreground border-border font-mono">
                        {t.rejectionCode}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{t.reason || "—"}</TableCell>
                    <TableCell>
                      {isLegacyType(t.type) ? (
                        <span className="text-muted-foreground text-sm">—</span>
                      ) : (
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                          {t.type}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => setEditType(t)} data-testid={`button-edit-rejection-type-${t.id}`}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteType(t)} data-testid={`button-delete-rejection-type-${t.id}`}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-12">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <AlertTriangle className="h-8 w-8 mb-2 opacity-20" /><p>No rejection reasons found</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={!!editType} onOpenChange={(o) => !o && setEditType(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Rejection Reason</DialogTitle>
            <DialogDescription>Update the reason code details.</DialogDescription>
          </DialogHeader>
          {editType && (
            <RejectionTypeForm
              defaultValues={{
                rejectionCode: editType.rejectionCode,
                reason: editType.reason || "",
                type: isLegacyType(editType.type) ? "" : (editType.type || ""),
              }}
              onSubmit={handleUpdate}
              isPending={updateMutation.isPending}
              onCancel={() => setEditType(null)}
              submitLabel="Save Changes"
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteType} onOpenChange={(o) => !o && setDeleteType(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Rejection Reason?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{deleteType?.rejectionCode}</strong>. Existing log entries will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90" data-testid="button-confirm-delete-rejection-type">
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
