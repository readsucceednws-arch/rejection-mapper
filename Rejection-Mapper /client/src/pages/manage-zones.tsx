import { useState } from "react";
import { useZones, useCreateZone, useUpdateZone, useDeleteZone, type Zone } from "@/hooks/use-zones";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MapPin, Plus, Pencil, Trash2 } from "lucide-react";

export default function ManageZones() {
  const { toast } = useToast();
  const { data: zones, isLoading } = useZones();
  const createMutation = useCreateZone();
  const updateMutation = useUpdateZone();
  const deleteMutation = useDeleteZone();

  const [newName, setNewName] = useState("");
  const [editZone, setEditZone] = useState<Zone | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteZone, setDeleteZone] = useState<Zone | null>(null);

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    createMutation.mutate(name, {
      onSuccess: () => {
        setNewName("");
        toast({ title: "Zone created", description: `Zone "${name}" has been added.` });
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err.message || "Failed to create zone", variant: "destructive" });
      },
    });
  };

  const handleUpdate = () => {
    if (!editZone) return;
    const name = editName.trim();
    if (!name) return;
    updateMutation.mutate({ id: editZone.id, name }, {
      onSuccess: () => {
        setEditZone(null);
        toast({ title: "Zone updated", description: `Zone renamed to "${name}".` });
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err.message || "Failed to update zone", variant: "destructive" });
      },
    });
  };

  const handleDelete = () => {
    if (!deleteZone) return;
    deleteMutation.mutate(deleteZone.id, {
      onSuccess: () => {
        setDeleteZone(null);
        toast({ title: "Zone deleted", description: `Zone "${deleteZone.name}" has been removed.` });
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err.message || "Failed to delete zone", variant: "destructive" });
      },
    });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Manage Zones</h1>
        <p className="text-muted-foreground mt-1 text-sm">Define production zones for grouping rejection and rework entries</p>
      </div>

      <Card className="border-border/50 shadow-md shadow-black/5">
        <CardHeader className="bg-muted/30 border-b border-border/50 rounded-t-xl">
          <CardTitle className="text-xl flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" />
            Add New Zone
          </CardTitle>
          <CardDescription>Enter a zone name and click Add.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Input
              placeholder="e.g. Assembly Line A, Paint Shop, QC Bay 2"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreate(); } }}
              className="flex-1 bg-background"
              data-testid="input-zone-name"
            />
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending || !newName.trim()}
              className="gap-2"
              data-testid="button-add-zone"
            >
              <Plus className="w-4 h-4" />
              {createMutation.isPending ? "Adding..." : "Add Zone"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 shadow-md shadow-black/5">
        <CardHeader className="bg-muted/30 border-b border-border/50 rounded-t-xl">
          <CardTitle className="text-xl flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" />
            Zones
            <Badge variant="secondary" className="ml-auto">{zones?.length ?? 0}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Loading zones...</div>
          ) : zones && zones.length > 0 ? (
            <div className="space-y-2">
              {zones.map((zone) => (
                <div
                  key={zone.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/10 hover:bg-muted/20 transition-colors"
                  data-testid={`zone-row-${zone.id}`}
                >
                  <div className="flex items-center gap-3">
                    <MapPin className="w-4 h-4 text-primary/60 shrink-0" />
                    <span className="font-medium text-sm">{zone.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => { setEditZone(zone); setEditName(zone.name); }}
                      data-testid={`button-edit-zone-${zone.id}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      onClick={() => setDeleteZone(zone)}
                      data-testid={`button-delete-zone-${zone.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center">
              <MapPin className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground text-sm">No zones configured yet. Add your first zone above.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editZone} onOpenChange={(open) => { if (!open) setEditZone(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Zone</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleUpdate(); }}
              placeholder="Zone name"
              className="bg-background"
              data-testid="input-edit-zone-name"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditZone(null)}>Cancel</Button>
            <Button
              onClick={handleUpdate}
              disabled={updateMutation.isPending || !editName.trim()}
              data-testid="button-save-zone-edit"
            >
              {updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteZone} onOpenChange={(open) => { if (!open) setDeleteZone(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete zone "{deleteZone?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the zone. Existing entries associated with this zone will keep their reference, but no new entries can be tagged to it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-zone"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
