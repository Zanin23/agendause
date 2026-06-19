import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
};

export const CreateTrainingDialog = ({ open, onOpenChange, onCreated }: Props) => {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState(60);
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setTitle(""); setDescription(""); setDate(""); setTime("09:00");
    setDuration(60); setLocation("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    const scheduled_at = new Date(`${date}T${time}`).toISOString();
    const { error } = await supabase.from("trainings").insert({
      title,
      description: description || null,
      scheduled_at,
      duration_minutes: duration,
      location: location || null,
      created_by: user.id,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Treinamento criado!");
    reset();
    onOpenChange(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo treinamento</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="title">Título *</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="desc">Descrição</Label>
            <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="date">Data *</Label>
              <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="time">Hora *</Label>
              <Input id="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dur">Duração (min)</Label>
              <Input id="dur" type="number" min={5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loc">Local / Link</Label>
              <Input id="loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Sala 2 ou URL" />
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={loading}>{loading ? "Salvando..." : "Criar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};