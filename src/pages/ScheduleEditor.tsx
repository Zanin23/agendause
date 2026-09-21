import { publicUrl } from "@/lib/publicUrl";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowUp, ArrowDown, Plus, Trash2, Copy, Printer, Link2, Download, Save,
  ChevronDown, ChevronRight, CheckCircle2, Circle, Clock, Ban, CalendarClock, Settings2,
  CalendarDays, Flag, Unlink, Handshake, FileText, Network
} from "lucide-react";
import { toast } from "sonner";
import { PhaseReorderDialog } from "@/components/PhaseReorderDialog";
import { SurveyTab } from "@/components/SurveyTab";
import { ClipboardList, ListChecks } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/BackButton";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/schedule";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";

type Item = {
  id: string; phase_id: string; position: number; title: string;
  description: string | null; planned_date: string | null; done_date: string | null;
  status: string; assignee: string | null; notes: string | null;
  training_id: string | null;
};
type Phase = { id: string; schedule_id: string; position: number; title: string; description: string | null; items: Item[] };
type Schedule = {
  id: string; client_name: string; client_email: string | null; start_date: string;
  cadence: string; modality: string; use_team: string[]; status: string;
  observations: string | null; public_token: string | null; accepted_at: string | null; accepted_by: string | null;
};
type TrainingLite = {
  id: string; title: string; scheduled_at: string; status: string; client: string | null;
};

export default function ScheduleEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin, hasSchedulePermission, loading: roleLoading } = usePermissions();
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePhaseId, setActivePhaseId] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [showSettings, setShowSettings] = useState(false);
  const [trainings, setTrainings] = useState<TrainingLite[]>([]);
  const [tab, setTab] = useState<"cronograma" | "levantamento">("cronograma");

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const { data: s, error: e1 } = await supabase.from("implementation_schedules").select("*").eq("id", id).single();
    if (e1) { toast.error(e1.message); return; }
    setSchedule(s as Schedule);
    const { data: ps } = await supabase.from("schedule_phases").select("*").eq("schedule_id", id).order("position", { ascending: true });
    const phaseIds = (ps || []).map((p: any) => p.id);
    const { data: its } = phaseIds.length
      ? await supabase.from("schedule_items").select("*").in("phase_id", phaseIds).order("position", { ascending: true })
      : { data: [] as any };
    
    const byPhase: Record<string, Item[]> = {};
    (its || []).forEach((it: Item) => { 
      (byPhase[it.phase_id] ||= []).push(it); 
    });
    
    // Sort items by position within each phase as a safety measure
    Object.keys(byPhase).forEach(phaseId => {
      byPhase[phaseId].sort((a, b) => (a.position || 0) - (b.position || 0));
    });

    setPhases((ps || []).map((p: any) => ({ ...p, items: byPhase[p.id] || [] })));
    setLoading(false);
    if (ps && ps.length && !activePhaseId) setActivePhaseId(ps[0].id);
  };

  useEffect(() => { load(); }, [id]);

  // Load trainings (preferindo as do mesmo cliente)
  useEffect(() => {
    (async () => {
      if (!schedule) return;
      let q = supabase
        .from("trainings")
        .select("id, title, scheduled_at, status, client")
        .order("scheduled_at", { ascending: false })
        .limit(200);
      if (schedule.client_name) q = q.eq("client", schedule.client_name);
      const { data } = await q;
      let list = (data as TrainingLite[]) || [];
      if (list.length === 0) {
        const { data: all } = await supabase
          .from("trainings")
          .select("id, title, scheduled_at, status, client")
          .order("scheduled_at", { ascending: false })
          .limit(200);
        list = (all as TrainingLite[]) || [];
      }
      setTrainings(list);
    })();
  }, [schedule?.id, schedule?.client_name]);

  const finalizeLinkedTraining = async (item: Item) => {
    if (!item.training_id) return;
    if (!confirm("Finalizar a visita vinculada? Esta etapa também será marcada como concluída.")) return;
    const { error } = await supabase
      .from("trainings")
      .update({ status: "concluido" })
      .eq("id", item.training_id);
    if (error) return toast.error(error.message);
    toast.success("Visita finalizada — etapa concluída");
    await load();
  };

  const progress = useMemo(() => {
    const items = phases.flatMap((p) => p.items).filter((i) => i.status !== "not_applicable");
    const done = items.filter((i) => i.status === "done").length;
    return { done, total: items.length, pct: items.length ? Math.round((done / items.length) * 100) : 0 };
  }, [phases]);

  // --- Schedule meta ---
  const canEdit = id ? hasSchedulePermission(id, 'write') : isAdmin;

  const updateSchedule = async (patch: Partial<Schedule>) => {
    if (!canEdit) return toast.error("Sem permissão para alterar este cronograma");
    if (!schedule) return;
    const next = { ...schedule, ...patch };
    setSchedule(next);
    const { error } = await supabase.from("implementation_schedules").update(patch as any).eq("id", schedule.id);
    if (error) toast.error(error.message);
  };

  // --- Phases ---
  const addPhase = async () => {
    if (!canEdit) return toast.error("Sem permissão para alterar este cronograma");
    if (!schedule) return;
    const maxPos = phases.length > 0 ? Math.max(...phases.map(p => p.position)) + 1 : 0;
    const { data, error } = await supabase.from("schedule_phases")
      .insert(({ schedule_id: schedule.id, title: "Nova fase", position: maxPos }) as any)
      .select("*").single();
    if (error) return toast.error(error.message);
    setPhases([...phases, { ...(data as any), items: [] }]);
  };
  const updatePhase = async (phaseId: string, patch: Partial<Phase>) => {
    setPhases((prev) => prev.map((p) => p.id === phaseId ? { ...p, ...patch } : p));
    const { items, ...dbPatch } = patch as any;
    if (!canEdit) return toast.error("Sem permissão para alterar este cronograma");
    const { error } = await supabase.from("schedule_phases").update(dbPatch).eq("id", phaseId);
    if (error) toast.error(error.message);
  };
  const removePhase = async (phaseId: string) => {
    if (!canEdit) return toast.error("Sem permissão para alterar este cronograma");
    if (!confirm("Remover esta fase e todos os itens?")) return;
    const { error } = await supabase.from("schedule_phases").delete().eq("id", phaseId);
    if (error) return toast.error(error.message);
    setPhases((prev) => prev.filter((p) => p.id !== phaseId));
  };
  const movePhase = async (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= phases.length) return;
    const next = [...phases];
    [next[idx], next[j]] = [next[j], next[idx]];
    
    // Update local state first for immediate UI feedback
    const updatedPhases = next.map((p, i) => ({ ...p, position: i }));
    handlePhasesReorder(updatedPhases);
  };

  const handlePhasesReorder = async (updatedPhases: Phase[]) => {
    // Sort the phases by their new position to ensure we save them in the correct sequence
    const sortedPhases = [...updatedPhases].sort((a, b) => a.position - b.position);
    setPhases(sortedPhases);
    
    // Persist all positions in a single batch
    const updates = sortedPhases.map((p) => 
      supabase.from("schedule_phases").update({ position: p.position }).eq("id", p.id)
    );
    const results = await Promise.all(updates);
    const firstError = results.find(r => r.error)?.error;
    if (firstError) {
      toast.error("Erro ao salvar nova ordem das fases: " + firstError.message);
      load(); // Reload to original state on error
    }
  };

  // --- Items ---
  const addItem = async (phase: Phase) => {
    if (!canEdit) return toast.error("Sem permissão para alterar este cronograma");
    const maxPos = phase.items.length > 0 ? Math.max(...phase.items.map(i => i.position)) + 1 : 0;
    const { data, error } = await supabase.from("schedule_items")
      .insert(({ phase_id: phase.id, title: "Novo item", position: maxPos }) as any)
      .select("*").single();
    if (error) return toast.error(error.message);
    setPhases((prev) => prev.map((p) => p.id === phase.id ? { ...p, items: [...p.items, data as Item] } : p));
  };
  const updateItem = async (phaseId: string, itemId: string, patch: Partial<Item>) => {
    setPhases((prev) => prev.map((p) => p.id === phaseId
      ? { ...p, items: p.items.map((i) => i.id === itemId ? { ...i, ...patch } : i) }
      : p));
    if (!canEdit) return toast.error("Sem permissão para alterar este cronograma");
    const { data, error } = await supabase
      .from("schedule_items")
      .update(patch as any)
      .eq("id", itemId)
      .select("id");
    if (error) { toast.error(error.message); await load(); return; }
    if (!data || data.length === 0) {
      toast.error("Não foi possível salvar esta alteração no servidor.");
      await load();
    }
  };
  const removeItem = async (phaseId: string, itemId: string) => {
    if (!canEdit) return toast.error("Sem permissão para alterar este cronograma");
    const { error } = await supabase.from("schedule_items").delete().eq("id", itemId);
    if (error) return toast.error(error.message);
    setPhases((prev) => prev.map((p) => p.id === phaseId
      ? { ...p, items: p.items.filter((i) => i.id !== itemId) } : p));
  };
  const duplicateItem = async (phase: Phase, item: Item) => {
    const { data, error } = await supabase.from("schedule_items")
      .insert(({
        phase_id: phase.id, title: item.title + " (cópia)", description: item.description,
        planned_date: item.planned_date, assignee: item.assignee, notes: item.notes,
        position: phase.items.length,
      }) as any)
      .select("*").single();
    if (error) return toast.error(error.message);
    setPhases((prev) => prev.map((p) => p.id === phase.id ? { ...p, items: [...p.items, data as Item] } : p));
  };
  const moveItem = async (phase: Phase, idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= phase.items.length) return;
    const nextItems = [...phase.items];
    [nextItems[idx], nextItems[j]] = [nextItems[j], nextItems[idx]];
    
    // Update items with their new positions
    const updatedItems = nextItems.map((it, i) => ({ ...it, position: i }));
    
    // Update local state first for immediate UI feedback
    setPhases((prev) => prev.map((p) => p.id === phase.id ? { ...p, items: updatedItems } : p));
    
    // Persist all item positions for this phase
    const updates = updatedItems.map((it) =>
      supabase.from("schedule_items").update({ position: it.position }).eq("id", it.id)
    );
    const results = await Promise.all(updates);
    const firstError = results.find(r => r.error)?.error;
    if (firstError) toast.error("Erro ao salvar ordem dos itens: " + firstError.message);
  };

  const copyPublicLink = async () => {
    if (!schedule?.public_token) return;
    const url = publicUrl(`/c/${schedule.public_token}`);
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

  if (roleLoading) return <div className="p-8 text-center text-muted-foreground">Carregando permissões...</div>;
  if (id && !hasSchedulePermission(id)) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="max-w-3xl mx-auto px-4 py-20 text-center">
          <BackButton to="/cronogramas" />
          <div className="mt-6 p-8 rounded-2xl border border-border bg-card/60">
            <h1 className="text-2xl font-semibold">Acesso Restrito</h1>
            <p className="text-muted-foreground mt-2">Apenas administradores podem editar cronogramas.</p>
          </div>
        </main>
      </div>
    );
  }

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
      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-5">
        {/* Toolbar */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
            <BackButton to="/cronogramas" />
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-semibold truncate">{schedule.client_name}</h1>
              <p className="text-[11px] sm:text-xs text-muted-foreground truncate">
                {format(new Date(schedule.start_date + "T00:00"), "d MMM yyyy", { locale: ptBR })} · {schedule.cadence} · {schedule.modality}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1 sm:gap-1.5">
            <Button variant="ghost" size="sm" className="px-2 sm:px-3" onClick={() => navigate(`/cronogramas/${schedule.id}/visualizar`)}>
              <Network className="h-4 w-4" /> <span className="hidden sm:inline">Organograma</span>
            </Button>
            {canEdit && (
              <Button variant="ghost" size="sm" className="px-2 sm:px-3" onClick={() => setShowSettings((s) => !s)}>
                <Settings2 className="h-4 w-4" /> <span className="hidden sm:inline">Detalhes</span>
              </Button>
            )}
            <Button variant="ghost" size="sm" className="px-2 sm:px-3" onClick={copyPublicLink}>
              <Link2 className="h-4 w-4" /> <span className="hidden sm:inline">Link</span>
            </Button>
            <Button variant="ghost" size="sm" className="px-2 sm:px-3" onClick={exportCsv}>
              <Download className="h-4 w-4" /> <span className="hidden sm:inline">CSV</span>
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="px-2 sm:px-3">
                  <Printer className="h-4 w-4" /> <span className="hidden sm:inline">PDF</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => navigate(`/cronogramas/${schedule.id}/imprimir`)}>
                  <Printer className="mr-2 h-4 w-4" />
                  Com datas
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate(`/cronogramas/${schedule.id}/imprimir?dates=false`)}>
                  <FileText className="mr-2 h-4 w-4" />
                  Sem datas
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Link to={`/cronogramas/${schedule.id}/termo`}>
              <Button
                variant={progress.pct === 100 ? "default" : "ghost"}
                size="sm"
                className="px-2 sm:px-3"
                title="Termo de passagem para o Suporte"
              >
                <Handshake className="h-4 w-4" />
                <span className="hidden sm:inline">Termo p/ Suporte</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* Global progress strip */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Progresso geral</span>
            <span className="font-medium">{progress.done}/{progress.total} · {progress.pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress.pct}%` }} />
          </div>
          {schedule.accepted_at && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              ✓ Aceito por {schedule.accepted_by} em {format(new Date(schedule.accepted_at), "d MMM yyyy HH:mm", { locale: ptBR })}
            </p>
          )}
        </div>

        {/* Collapsible settings */}
        {showSettings && (
          <Card>
            <CardContent className="p-5 grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs uppercase tracking-wider text-muted-foreground">Cliente</label>
                <Input value={schedule.client_name} onChange={(e) => updateSchedule({ client_name: e.target.value })} />
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
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs uppercase tracking-wider text-muted-foreground">Observações</label>
                <Textarea rows={4} value={schedule.observations || ""}
                  onChange={(e) => updateSchedule({ observations: e.target.value })} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Abas: cronograma / levantamento de processos */}
        <div className="flex gap-1 border-b border-border">
          <button
            onClick={() => setTab("cronograma")}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-1.5 transition-colors ${
              tab === "cronograma" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <ListChecks className="h-4 w-4" /> Cronograma
          </button>
          <button
            onClick={() => setTab("levantamento")}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-1.5 transition-colors ${
              tab === "levantamento" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <ClipboardList className="h-4 w-4" /> Levantamento
          </button>
        </div>

        {tab === "levantamento" && (
          <SurveyTab scheduleId={schedule.id} clientName={schedule.client_name} canEdit={canEdit} />
        )}

        {tab === "cronograma" && (<>
        {/* Mobile phase tabs (horizontal scroll) */}
        <div className="lg:hidden -mx-3 px-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Fases</h2>
              <PhaseReorderDialog phases={phases} onReorder={handlePhasesReorder} />
            </div>
            <Button onClick={addPhase} variant="ghost" size="sm" className="h-7 px-2 text-xs">
              <Plus className="h-3.5 w-3.5" /> Nova
            </Button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory -mx-3 px-3 scrollbar-none">
            {phases.map((phase, pi) => {
              const total = phase.items.filter((i) => i.status !== "not_applicable").length;
              const done = phase.items.filter((i) => i.status === "done").length;
              const pct = total ? Math.round((done / total) * 100) : 0;
              const isActive = phase.id === activePhaseId;
              const isComplete = total > 0 && done === total;
              return (
                <button
                  key={phase.id}
                  onClick={() => setActivePhaseId(phase.id)}
                  className={`shrink-0 snap-start rounded-lg border px-3 py-2 min-w-[160px] max-w-[200px] text-left transition-colors ${
                    isActive ? "border-primary bg-primary/5" : "border-border bg-card"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`shrink-0 w-6 h-6 rounded-full grid place-items-center text-[10px] font-mono ${
                      isComplete ? "bg-primary text-primary-foreground" :
                      isActive ? "border border-primary text-primary" : "border border-border text-muted-foreground"
                    }`}>
                      {isComplete ? <CheckCircle2 className="h-3.5 w-3.5" /> : String(pi + 1).padStart(2, "0")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{phase.title}</p>
                      <p className="text-[10px] text-muted-foreground">{done}/{total}</p>
                    </div>
                  </div>
                  <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Two-column: phases sidebar + active phase */}
        <div className="grid lg:grid-cols-[280px_1fr] gap-5">
          {/* Phase stepper — desktop only */}
          <aside className="hidden lg:block space-y-2 lg:sticky lg:top-4 lg:self-start">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Fases</h2>
              <div className="flex items-center gap-1">
                <PhaseReorderDialog phases={phases} onReorder={handlePhasesReorder} />
                <span className="text-xs text-muted-foreground">{phases.length}</span>
              </div>
            </div>
            <nav className="space-y-1">
              {phases.map((phase, pi) => {
                const total = phase.items.filter((i) => i.status !== "not_applicable").length;
                const done = phase.items.filter((i) => i.status === "done").length;
                const pct = total ? Math.round((done / total) * 100) : 0;
                const isActive = phase.id === activePhaseId;
                const isComplete = total > 0 && done === total;
                return (
                  <button
                    key={phase.id}
                    onClick={() => setActivePhaseId(phase.id)}
                    className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                      isActive ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`shrink-0 w-7 h-7 rounded-full grid place-items-center text-xs font-mono ${
                        isComplete ? "bg-primary text-primary-foreground" :
                        isActive ? "border border-primary text-primary" : "border border-border text-muted-foreground"
                      }`}>
                        {isComplete ? <CheckCircle2 className="h-4 w-4" /> : String(pi + 1).padStart(2, "0")}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{phase.title}</p>
                        <p className="text-[11px] text-muted-foreground">{done}/{total} concluídos</p>
                      </div>
                    </div>
                    <div className="mt-2 h-1 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </button>
                );
              })}
            </nav>
            {canEdit && (
              <Button onClick={addPhase} variant="outline" size="sm" className="w-full">
                <Plus className="h-4 w-4" /> Nova fase
              </Button>
            )}
          </aside>

          {/* Active phase panel */}
          <section>
            {(() => {
              const phase = phases.find((p) => p.id === activePhaseId);
              const pi = phases.findIndex((p) => p.id === activePhaseId);
              if (!phase) return (
                <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">
                  Selecione ou crie uma fase.
                </CardContent></Card>
              );
              return (
                <Card>
                  <CardContent className="p-3 sm:p-5 space-y-4">
                    {/* Phase header */}
                    <div className="flex items-center gap-1 sm:gap-2 pb-3 border-b border-border">
                      <span className="text-xs font-mono text-muted-foreground shrink-0">{String(pi + 1).padStart(2, "0")}</span>
                      <Input value={phase.title} onChange={(e) => updatePhase(phase.id, { title: e.target.value })}
                        disabled={!canEdit}
                        className="font-semibold text-sm sm:text-base border-0 shadow-none px-2 focus-visible:ring-1 -ml-2 min-w-0 flex-1" />
                      {canEdit && (
                        <>
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => movePhase(pi, -1)} disabled={pi === 0}>
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => movePhase(pi, 1)} disabled={pi === phases.length - 1}>
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0" onClick={() => removePhase(phase.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>

                    {/* Items list */}
                    <ul className="divide-y divide-border -mx-2">
                      {phase.items.map((item, ii) => {
                        const open = expandedItems[item.id];
                        const StatusIcon =
                          item.status === "done" ? CheckCircle2 :
                          item.status === "in_progress" ? Clock :
                          item.status === "blocked" ? Ban :
                          item.status === "rescheduled" ? CalendarClock :
                          item.status === "not_applicable" ? Ban : Circle;
                        return (
                          <li key={item.id} className="px-2 py-2.5">
                            {/* Compact row */}
                            <div className="flex items-start sm:items-center gap-2">
                              <button
                                onClick={() => updateItem(phase.id, item.id, {
                                  status: item.status === "done" ? "pending" : "done",
                                  done_date: item.status === "done" ? null : format(new Date(), "yyyy-MM-dd"),
                                })}
                                className="shrink-0 p-1 rounded hover:bg-muted mt-0.5 sm:mt-0"
                                title="Marcar concluído"
                              >
                                <StatusIcon className={`h-5 w-5 ${item.status === "done" ? "text-primary" : "text-muted-foreground"}`} />
                              </button>
                              <button
                                onClick={() => setExpandedItems((s) => ({ ...s, [item.id]: !s[item.id] }))}
                                className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-left group"
                              >
                                <span className={`flex-1 min-w-0 basis-full sm:basis-0 truncate text-sm ${item.status === "done" ? "line-through text-muted-foreground" : ""}`}>
                                  {item.title || <span className="italic text-muted-foreground">Sem título</span>}
                                </span>
                                {item.planned_date && (
                                  <span className="text-[11px] sm:text-xs text-muted-foreground tabular-nums">
                                    {format(new Date(item.planned_date + "T00:00"), "d MMM", { locale: ptBR })}
                                  </span>
                                )}
                                {item.training_id && (() => {
                                  const t = trainings.find((x) => x.id === item.training_id);
                                  if (!t) return (
                                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary">
                                      <Link2 className="h-3 w-3" /> Visita
                                    </span>
                                  );
                                  return (
                                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary">
                                      <CalendarDays className="h-3 w-3" />
                                      {format(new Date(t.scheduled_at), "d MMM HH:mm", { locale: ptBR })}
                                    </span>
                                  );
                                })()}
                                <span className={`text-[10px] px-2 py-0.5 rounded ${STATUS_COLORS[item.status]}`}>
                                  {STATUS_LABELS[item.status]}
                                </span>
                                {open ? <ChevronDown className="h-4 w-4 text-muted-foreground ml-auto" /> : <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />}
                              </button>
                            </div>

                            {/* Expanded details */}
                            {open && (
                              <div className="mt-3 sm:ml-8 space-y-3 pb-2">
                                <Input value={item.title} onChange={(e) => updateItem(phase.id, item.id, { title: e.target.value })}
                                  disabled={!canEdit}
                                  placeholder="Título do item" />
                                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
                                  <div className="space-y-1">
                                    <label className="text-[10px] uppercase text-muted-foreground">Prevista</label>
                                    <Input type="date" value={item.planned_date || ""} onChange={(e) => updateItem(phase.id, item.id, { planned_date: e.target.value || null })} disabled={!canEdit} />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[10px] uppercase text-muted-foreground">Conclusão</label>
                                    <Input type="date" value={item.done_date || ""} onChange={(e) => updateItem(phase.id, item.id, { done_date: e.target.value || null })} disabled={!canEdit} />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[10px] uppercase text-muted-foreground">Status</label>
                                    <select value={item.status} onChange={(e) => updateItem(phase.id, item.id, { status: e.target.value, done_date: e.target.value === "done" ? (item.done_date || format(new Date(), "yyyy-MM-dd")) : item.done_date })}
                                      disabled={!canEdit}
                                      className="w-full h-10 rounded-md border border-input bg-background px-2 text-sm">
                                      {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                    </select>
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[10px] uppercase text-muted-foreground">Responsável</label>
                                    <Input value={item.assignee || ""} onChange={(e) => updateItem(phase.id, item.id, { assignee: e.target.value || null })} disabled={!canEdit} />
                                  </div>
                                </div>
                                <Textarea placeholder="Observações…" value={item.notes || ""} rows={2}
                                  disabled={!canEdit}
                                  onChange={(e) => updateItem(phase.id, item.id, { notes: e.target.value || null })} />

                                {/* Visita vinculada */}
                                <div className="rounded-md border border-dashed border-border p-3 space-y-2">
                                  <div className="flex items-center gap-2 text-xs font-medium">
                                    <Link2 className="h-3.5 w-3.5 text-primary" />
                                    Visita vinculada
                                  </div>
                                  <div className="flex flex-wrap gap-2 items-center">
                                    <select
                                      value={item.training_id || ""}
                                      onChange={(e) => updateItem(phase.id, item.id, { training_id: e.target.value || null } as any)}
                                      disabled={!canEdit}
                                      className="flex-1 min-w-[200px] h-10 rounded-md border border-input bg-background px-2 text-sm"
                                    >
                                      <option value="">— Nenhuma visita vinculada —</option>
                                      {trainings.map((t) => (
                                        <option key={t.id} value={t.id}>
                                          {format(new Date(t.scheduled_at), "d MMM yyyy HH:mm", { locale: ptBR })} · {t.title}{t.client ? ` — ${t.client}` : ""}
                                          {t.status === "concluido" ? " (finalizada)" : t.status === "cancelado" ? " (cancelada)" : ""}
                                        </option>
                                      ))}
                                    </select>
                                    {item.training_id && (
                                      <>
                                        <Link to={`/treinamento/${item.training_id}`}>
                                          <Button variant="outline" size="sm" type="button">
                                            <CalendarDays className="h-3.5 w-3.5" /> Abrir visita
                                          </Button>
                                        </Link>
                                        <Button variant="outline" size="sm" type="button"
                                          onClick={() => updateItem(phase.id, item.id, { training_id: null } as any)} disabled={!canEdit}>
                                          <Unlink className="h-3.5 w-3.5" /> Desvincular
                                        </Button>
                                        {item.status !== "done" && (
                                          <Button size="sm" type="button"
                                            onClick={() => finalizeLinkedTraining(item)} disabled={!canEdit}>
                                            <Flag className="h-3.5 w-3.5" /> Finalizar visita e etapa
                                          </Button>
                                        )}
                                      </>
                                    )}
                                  </div>
                                  {item.training_id && (
                                    <p className="text-[11px] text-muted-foreground">
                                      Ao marcar a visita como concluída na agenda, esta etapa é finalizada automaticamente.
                                    </p>
                                  )}
                                </div>

                                {canEdit && (
                                  <div className="flex items-center justify-between">
                                    <div className="flex gap-1">
                                      <Button variant="ghost" size="sm" onClick={() => moveItem(phase, ii, -1)} disabled={ii === 0}>
                                        <ArrowUp className="h-3 w-3" />
                                      </Button>
                                      <Button variant="ghost" size="sm" onClick={() => moveItem(phase, ii, 1)} disabled={ii === phase.items.length - 1}>
                                        <ArrowDown className="h-3 w-3" />
                                      </Button>
                                    </div>
                                    <div className="flex gap-1">
                                      <Button variant="ghost" size="sm" onClick={() => duplicateItem(phase, item)}>
                                        <Copy className="h-3 w-3" /> Duplicar
                                      </Button>
                                      <Button variant="ghost" size="sm" onClick={() => removeItem(phase.id, item.id)} className="text-destructive">
                                        <Trash2 className="h-3 w-3" /> Remover
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>

                    {canEdit && (
                      <Button variant="outline" size="sm" onClick={() => addItem(phase)} className="w-full">
                        <Plus className="h-4 w-4" /> Adicionar item
                      </Button>
                    )}

                    <p className="text-[11px] text-muted-foreground flex items-center gap-1 pt-2 border-t border-border">
                      <Save className="h-3 w-3" /> Salvamento automático ativo.
                    </p>
                  </CardContent>
                </Card>
              );
            })()}
          </section>
        </div>
        </>)}
      </main>
    </div>
  );
}