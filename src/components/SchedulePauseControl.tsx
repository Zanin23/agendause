import { useMemo, useState } from "react";
import { format, addDays, differenceInCalendarDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PauseCircle, PlayCircle, UserRoundX } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toBusinessDay } from "@/lib/schedule";

export const PAUSED_STATUSES = ["paused", "waiting_client"];
export const isPausedStatus = (s?: string | null) => !!s && PAUSED_STATUSES.includes(s);
export const PAUSE_LABELS: Record<string, string> = { paused: "Pausado", waiting_client: "Pendente pelo cliente" };

type Item = { id: string; planned_date: string | null; status: string };
type Props = {
  schedule: { id: string; status: string; paused_at?: string | null; pause_reason?: string | null };
  items: Item[];
  canEdit: boolean;
  onChanged: () => void;
};

const d0 = (s: string) => new Date(s.slice(0, 10) + "T00:00:00");
const iso = (d: Date) => format(d, "yyyy-MM-dd");

export function SchedulePauseControl({ schedule, items, canEdit, onChanged }: Props) {
  const paused = isPausedStatus(schedule.status);
  const [openPause, setOpenPause] = useState(false);
  const [openResume, setOpenResume] = useState(false);
  const [kind, setKind] = useState<"waiting_client" | "paused">("waiting_client");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const open = useMemo(() => items.filter((i) => i.planned_date && i.status !== "done" && i.status !== "not_applicable"), [items]);
  const currentEnd = useMemo(() => open.reduce<Date | null>((m, i) => { const d = d0(i.planned_date!); return !m || d > m ? d : m; }, null), [open]);
  const pausedDays = schedule.paused_at ? Math.max(0, differenceInCalendarDays(new Date(), d0(schedule.paused_at))) : 0;
  const [newEnd, setNewEnd] = useState("");

  const pause = async () => {
    setBusy(true);
    const { error } = await supabase.from("implementation_schedules")
      .update({ status: kind, paused_at: iso(new Date()), pause_reason: reason.trim() || null } as never).eq("id", schedule.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(kind === "waiting_client" ? "Cronograma marcado como pendente pelo cliente" : "Cronograma pausado");
    setOpenPause(false); setReason(""); onChanged();
  };

  const startResume = () => {
    setNewEnd(currentEnd ? iso(toBusinessDay(addDays(currentEnd, pausedDays))) : iso(new Date()));
    setOpenResume(true);
  };

  const shift = currentEnd && newEnd ? differenceInCalendarDays(d0(newEnd), currentEnd) : 0;

  const resume = async () => {
    setBusy(true);
    if (shift !== 0) {
      const results = await Promise.all(open.map((i) =>
        supabase.from("schedule_items").update({ planned_date: iso(toBusinessDay(addDays(d0(i.planned_date!), shift))) }).eq("id", i.id)));
      const err = results.find((r) => r.error)?.error;
      if (err) { setBusy(false); return toast.error(err.message); }
    }
    const { error } = await supabase.from("implementation_schedules")
      .update({ status: "active", paused_at: null, pause_reason: null } as never).eq("id", schedule.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(shift ? `Cronograma retomado — ${open.length} etapas remanejadas` : "Cronograma retomado");
    setOpenResume(false); onChanged();
  };

  return (
    <>
      {paused && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {schedule.status === "waiting_client" ? <UserRoundX className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" /> : <PauseCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />}
            <div className="min-w-0">
              <div className="text-sm font-semibold">{PAUSE_LABELS[schedule.status]}{schedule.paused_at && ` desde ${format(d0(schedule.paused_at), "dd/MM/yyyy")}`} <span className="font-normal text-muted-foreground">· {pausedDays} dia(s)</span></div>
              <p className="text-xs text-muted-foreground">{schedule.pause_reason || "Enquanto pausado, as etapas não contam como atrasadas nos relatórios."}</p>
            </div>
          </div>
          {canEdit && <Button size="sm" onClick={startResume}><PlayCircle className="h-4 w-4 mr-1.5" />Retomar cronograma</Button>}
        </div>
      )}
      {!paused && canEdit && schedule.status !== "completed" && (
        <Button variant="ghost" size="sm" className="px-2 sm:px-3" onClick={() => setOpenPause(true)}>
          <PauseCircle className="h-4 w-4" /> <span className="hidden sm:inline">Pausar</span>
        </Button>
      )}

      <Dialog open={openPause} onOpenChange={setOpenPause}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pausar cronograma</DialogTitle>
            <DialogDescription>As etapas deixam de aparecer como atrasadas até você retomar.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {(["waiting_client", "paused"] as const).map((k) => (
              <button key={k} onClick={() => setKind(k)} className={`rounded-lg border p-3 text-left text-sm transition-colors ${kind === k ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"}`}>
                <div className="font-medium flex items-center gap-2">{k === "waiting_client" ? <UserRoundX className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}{PAUSE_LABELS[k]}</div>
                <div className="text-xs text-muted-foreground mt-1">{k === "waiting_client" ? "Aguardando retorno, dados ou ação do cliente." : "Parado por outro motivo."}</div>
              </button>
            ))}
          </div>
          <Textarea placeholder="Motivo (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenPause(false)}>Cancelar</Button>
            <Button onClick={pause} disabled={busy}>Pausar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openResume} onOpenChange={setOpenResume}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Retomar cronograma</DialogTitle>
            <DialogDescription>Para quando quer remarcar a nova data de entrega? As etapas pendentes serão remanejadas mantendo o mesmo intervalo entre elas.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Entrega prevista atual</span><span className="font-medium">{currentEnd ? format(currentEnd, "dd 'de' MMM yyyy", { locale: ptBR }) : "—"}</span></div>
            <label className="block space-y-1"><span className="text-muted-foreground">Nova data de entrega</span><Input type="date" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} /></label>
            <p className="text-xs text-muted-foreground">
              {open.length} etapa(s) pendente(s) serão {shift > 0 ? `adiadas ${shift} dia(s)` : shift < 0 ? `antecipadas ${-shift} dia(s)` : "mantidas nas datas atuais"}. Fins de semana vão para segunda.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenResume(false)}>Cancelar</Button>
            <Button onClick={resume} disabled={busy || !newEnd}>Retomar e remanejar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
