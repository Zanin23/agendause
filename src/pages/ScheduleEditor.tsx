import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowLeft, ArrowUp, ArrowDown, Plus, Trash2, Copy, Printer, Link2, Download, Save,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/schedule";

type Item = {
  id: string; phase_id: string; position: number; title: string;
  description: string | null; planned_date: string | null; done_date: string | null;
  status: string; assignee: string | null; notes: string | null;
};
type Phase = { id: string; schedule_id: string; position: number; title: string; description: string | null; items: Item[] };
type Schedule = {
  id: string; client_name: string; client_email: string | null; start_date: string;
  cadence: string; modality: string; use_team: string[]; status: string;
  observations: string | null; public_token: string | null; accepted_at: string | null; accepted_by: string | null;
};

export default function ScheduleEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const { data: s, error: e1 } = await supabase.from("implementation_schedules").select("*").eq("id", id).single();
    if (e1) { toast.error(e1.message); return; }
    setSchedule(s as Schedule);
    const { data: ps } = await supabase.from("schedule_phases").select("*").eq("schedule_id", id).order("position");
    const phaseIds = (ps || []).map((p: any) => p.id);
    const { data: its } = phaseIds.length
      ? await supabase.from("schedule_items").select("*").in("phase_id", phaseIds).order("position")
      : { data: [] as any };
    const byPhase: Record<string, Item[]> = {};
    (its || []).forEach((it: Item) => { (byPhase[it.phase_id] ||= []).push(it); });
    setPhases((ps || []).map((p: any) => ({ ...p, items: byPhase[p.id] || [] })));
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const progress = useMemo(() => {
    const items = phases.flatMap((p) => p.items).filter((i) => i.status !== "not_applicable");
    const done = items.filter((i) => i.status === "done").length;
    return { done, total: items.length, pct: items.length ? Math.round((done / items.length) * 100) : 0 };
  }, [phases]);

  // --- Schedule meta ---
  const updateSchedule = async (patch: Partial<Schedule>) => {
    if (!schedule) return;
    const next = { ...schedule, ...patch };
    setSchedule(next);
    const { error } = await supabase.from("implementation_schedules").update(patch as any).eq("id", schedule.id);
    if (error) toast.error(error.message);
  };

  // --- Phases ---
  const addPhase = async () => {
    if (!schedule) return;
    const { data, error } = await supabase.from("schedule_phases")
      .insert({ schedule_id: schedule.id, title: "Nova fase", position: phases.length })
      .select("*").single();
    if (error) return toast.error(error.message);
    setPhases([...phases, { ...(data as any), items: [] }]);
  };
  const updatePhase = async (phaseId: string, patch: Partial<Phase>) => {
    setPhases(phases.map((p) => p.id === phaseId ? { ...p, ...patch } : p));
    const { items, ...dbPatch } = patch as any;
    const { error } = await supabase.from("schedule_phases").update(dbPatch).eq("id", phaseId);
    if (error) toast.error(error.message);
  };
  const removePhase = async (phaseId: string) => {
    if (!confirm("Remover esta fase e todos os itens?")) return;
    const { error } = await supabase.from("schedule_phases").delete().eq("id", phaseId);
    if (error) return toast.error(error.message);
    setPhases(phases.filter((p) => p.id !== phaseId));
  };
  const movePhase = async (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= phases.length) return;
    const next = [...phases];
    [next[idx], next[j]] = [next[j], next[idx]];
    setPhases(next);
    await Promise.all(next.map((p, i) =>
      supabase.from("schedule_phases").update({ position: i }).eq("id", p.id)
    ));
  };

  // --- Items ---
  const addItem = async (phase: Phase) => {
    const { data, error } = await supabase.from("schedule_items")
      .insert({ phase_id: phase.id, title: "Novo item", position: phase.items.length })
      .select("*").single();
    if (error) return toast.error(error.message);
    setPhases(phases.map((p) => p.id === phase.id ? { ...p, items: [...p.items, data as Item] } : p));
  };
  const updateItem = async (phaseId: string, itemId: string, patch: Partial<Item>) => {
    setPhases(phases.map((p) => p.id === phaseId
      ? { ...p, items: p.items.map((i) => i.id === itemId ? { ...i, ...patch } : i) }
      : p));
    const { error } = await supabase.from("schedule_items").update(patch as any).eq("id", itemId);
    if (error) toast.error(error.message);
  };
  const removeItem = async (phaseId: string, itemId: string) => {
    const { error } = await supabase.from("schedule_items").delete().eq("id", itemId);
    if (error) return toast.error(error.message);
    setPhases(phases.map((p) => p.id === phaseId
      ? { ...p, items: p.items.filter((i) => i.id !== itemId) } : p));
  };
  const duplicateItem = async (phase: Phase, item: Item) => {
    const { data, error } = await supabase.from("schedule_items")
      .insert({
        phase_id: phase.id, title: item.title + " (cópia)", description: item.description,
        planned_date: item.planned_date, assignee: item.assignee, notes: item.notes,
        position: phase.items.length,
      })
      .select("*").single();
    if (error) return toast.error(error.message);
    setPhases(phases.map((p) => p.id === phase.id ? { ...p, items: [...p.items, data as Item] } : p));
  };
  const moveItem = async (phase: Phase, idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= phase.items.length) return;
    const next = [...phase.items];
    [next[idx], next[j]] = [next[j], next[idx]];
    setPhases(phases.map((p) => p.id === phase.id ? { ...p, items: next } : p));
    await Promise.all(next.map((it, i) =>
      supabase.from("schedule_items").update({ position: i }).eq("id", it.id)
    ));
  };

  const copyPublicLink = async () => {
    if (!schedule?.public_token) return;
    const url = `${window.location.origin}/c/${schedule.public_token}`;
    await navigator.clipboard.writeText(url);
    toast.success("Link copiado");
  };

  const exportCsv = () => {
    if (!schedule) return;
    const rows = [["Fase", "Item", "Data prevista", "Data conclusão", "Status", "Responsável", "Observações"]];
    phases.forEach((p) => p.items.forEach((i) => {
      rows.push([p.title, i.title, i.planned_date || "", i.done_date || "", STATUS_LABELS[i.status] || i.status, i.assignee || "", (i.notes || "").replace(/\n/g, " ")]);
    }));
    const csv = rows.map((r) => r.map((c) => `"${(c || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `cronograma-${schedule.client_name}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading || !schedule) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="max-w-5xl mx-auto px-4 py-10 text-sm text-muted-foreground">Carregando…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={`Cronograma — ${schedule.client_name}`}
        description={`Cronograma de implantação ERP USE para ${schedule.client_name}.`}
        path={`/cronogramas/${schedule.id}`}
      />
      <AppHeader />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/cronogramas")}>
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={copyPublicLink}>
              <Link2 className="h-4 w-4" /> Copiar link público
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Link to={`/cronogramas/${schedule.id}/imprimir`}>
              <Button variant="outline" size="sm"><Printer className="h-4 w-4" /> Imprimir / PDF</Button>
            </Link>
          </div>
        </div>

        {/* Header card */}
        <Card>
          <CardContent className="p-5 sm:p-6 space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs uppercase tracking-wider text-muted-foreground">Cliente</label>
                <Input value={schedule.client_name} onChange={(e) => updateSchedule({ client_name: e.target.value })} className="text-lg font-semibold" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs uppercase tracking-wider text-muted-foreground">Início</label>
                <Input type="date" value={schedule.start_date} onChange={(e) => updateSchedule({ start_date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs uppercase tracking-wider text-muted-foreground">Email cliente</label>
                <Input type="email" value={schedule.client_email || ""} onChange={(e) => updateSchedule({ client_email: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs uppercase tracking-wider text-muted-foreground">Cadência</label>
                <select value={schedule.cadence} onChange={(e) => updateSchedule({ cadence: e.target.value })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="semanal">Semanal</option>
                  <option value="quinzenal">Quinzenal</option>
                  <option value="mensal">Mensal</option>
                  <option value="customizada">Customizada</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs uppercase tracking-wider text-muted-foreground">Modalidade</label>
                <select value={schedule.modality} onChange={(e) => updateSchedule({ modality: e.target.value })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="presencial">Presencial</option>
                  <option value="remoto">Remoto</option>
                  <option value="hibrido">Híbrido</option>
                </select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs uppercase tracking-wider text-muted-foreground">Equipe Use Sistemas</label>
                <Input value={schedule.use_team.join(", ")} onChange={(e) =>
                  updateSchedule({ use_team: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
              </div>
            </div>

            {/* Progress */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Progresso geral</span>
                <span>{progress.done}/{progress.total} ({progress.pct}%)</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${progress.pct}%` }} />
              </div>
            </div>

            {schedule.accepted_at && (
              <div className="text-xs text-emerald-600 dark:text-emerald-300">
                ✓ Aceito por {schedule.accepted_by} em {format(new Date(schedule.accepted_at), "d MMM yyyy HH:mm", { locale: ptBR })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Phases */}
        <div className="space-y-4">
          {phases.map((phase, pi) => {
            const phaseDone = phase.items.filter((i) => i.status === "done").length;
            const phaseTotal = phase.items.filter((i) => i.status !== "not_applicable").length;
            const pct = phaseTotal ? Math.round((phaseDone / phaseTotal) * 100) : 0;
            return (
              <Card key={phase.id}>
                <CardContent className="p-4 sm:p-5 space-y-3">
                  <div className="flex items-start gap-2">
                    <div className="flex flex-col gap-0.5">
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => movePhase(pi, -1)}><ArrowUp className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => movePhase(pi, 1)}><ArrowDown className="h-3 w-3" /></Button>
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground font-mono">{String(pi + 1).padStart(2, "0")}</span>
                        <Input value={phase.title} onChange={(e) => updatePhase(phase.id, { title: e.target.value })}
                          className="font-semibold flex-1 min-w-[200px]" />
                        <Badge variant="outline">{phaseDone}/{phaseTotal}</Badge>
                        <Button variant="ghost" size="sm" onClick={() => removePhase(phase.id)} className="text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="h-1 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {phase.items.map((item, ii) => (
                      <div key={item.id} className="rounded-lg border border-border p-3 space-y-2 bg-card/30">
                        <div className="flex items-start gap-2">
                          <div className="flex flex-col gap-0.5">
                            <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => moveItem(phase, ii, -1)}><ArrowUp className="h-3 w-3" /></Button>
                            <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => moveItem(phase, ii, 1)}><ArrowDown className="h-3 w-3" /></Button>
                          </div>
                          <Input value={item.title} onChange={(e) => updateItem(phase.id, item.id, { title: e.target.value })} className="flex-1" />
                          <span className={`text-[10px] px-2 py-1 rounded ${STATUS_COLORS[item.status]}`}>
                            {STATUS_LABELS[item.status]}
                          </span>
                        </div>
                        <div className="grid sm:grid-cols-4 gap-2 pl-7">
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase text-muted-foreground">Prevista</label>
                            <Input type="date" value={item.planned_date || ""} onChange={(e) => updateItem(phase.id, item.id, { planned_date: e.target.value || null })} />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase text-muted-foreground">Conclusão</label>
                            <Input type="date" value={item.done_date || ""} onChange={(e) => updateItem(phase.id, item.id, { done_date: e.target.value || null })} />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase text-muted-foreground">Status</label>
                            <select value={item.status} onChange={(e) => updateItem(phase.id, item.id, { status: e.target.value, done_date: e.target.value === "done" ? (item.done_date || format(new Date(), "yyyy-MM-dd")) : item.done_date })}
                              className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm">
                              {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase text-muted-foreground">Responsável</label>
                            <Input value={item.assignee || ""} onChange={(e) => updateItem(phase.id, item.id, { assignee: e.target.value || null })} />
                          </div>
                        </div>
                        <div className="pl-7 space-y-1">
                          <Textarea placeholder="Observações…" value={item.notes || ""} rows={2}
                            onChange={(e) => updateItem(phase.id, item.id, { notes: e.target.value || null })} />
                        </div>
                        <div className="pl-7 flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => duplicateItem(phase, item)}>
                            <Copy className="h-3 w-3" /> Duplicar
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => removeItem(phase.id, item.id)} className="text-destructive">
                            <Trash2 className="h-3 w-3" /> Remover
                          </Button>
                        </div>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={() => addItem(phase)}>
                      <Plus className="h-4 w-4" /> Adicionar item
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          <Button onClick={addPhase} variant="outline" className="w-full">
            <Plus className="h-4 w-4" /> Adicionar fase
          </Button>
        </div>

        {/* Observations */}
        <Card>
          <CardContent className="p-5 sm:p-6 space-y-2">
            <h3 className="font-semibold">Observações</h3>
            <Textarea rows={6} value={schedule.observations || ""}
              onChange={(e) => updateSchedule({ observations: e.target.value })} />
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Save className="h-3 w-3" /> As alterações são salvas automaticamente.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}