import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppHeader } from "@/components/AppHeader";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { plannedDateFor, plannedDateForRange, TemplateContent } from "@/lib/schedule";
import { addDays, format } from "date-fns";

export default function ScheduleNew() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<{ id: string; name: string; description: string | null; content: TemplateContent }[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [cadence, setCadence] = useState<"semanal" | "quinzenal" | "mensal">("semanal");
  const [scheduleMode, setScheduleMode] = useState<"cadence" | "delivery">("cadence");
  const [deliveryDate, setDeliveryDate] = useState(
    format(addDays(new Date(), 60), "yyyy-MM-dd"),
  );
  const [modality, setModality] = useState<"presencial" | "remoto" | "hibrido">("presencial");
  const [team, setTeam] = useState("Matheus Zanin, Claudinei da Silva, Pablo Cassiano");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("implementation_templates")
        .select("id,name,description,content,is_default")
        .order("is_default", { ascending: false });
      const list = (data as any[]) || [];
      setTemplates(list);
      const def = list.find((t) => t.is_default) || list[0];
      if (def) setTemplateId(def.id);
    })();
  }, []);

  const create = async () => {
    if (!user) return;
    if (!clientName.trim()) return toast.error("Informe o nome do cliente");
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return toast.error("Selecione um template");
    if (scheduleMode === "delivery") {
      if (!deliveryDate) return toast.error("Informe a data de entrega");
      if (new Date(deliveryDate) <= new Date(startDate))
        return toast.error("A data de entrega deve ser após a data de início");
    }
    setSaving(true);
    try {
      const { data: sched, error: e1 } = await supabase
        .from("implementation_schedules")
        .insert({
          owner_id: user.id,
          client_name: clientName.trim(),
          client_email: clientEmail.trim() || null,
          start_date: startDate,
          cadence,
          modality,
          use_team: team.split(",").map((s) => s.trim()).filter(Boolean),
          observations: tpl.content.observations,
        })
        .select("id")
        .single();
      if (e1) throw e1;

      const start = new Date(startDate + "T00:00:00");
      const end = new Date(deliveryDate + "T00:00:00");
      const totalPhases = tpl.content.phases.length;
      for (let pi = 0; pi < tpl.content.phases.length; pi++) {
        const phase = tpl.content.phases[pi];
        const { data: phaseRow, error: e2 } = await supabase
          .from("schedule_phases")
          .insert({ schedule_id: sched!.id, position: pi, title: phase.title })
          .select("id")
          .single();
        if (e2) throw e2;
        const items = phase.items.map((title, ii) => ({
          phase_id: phaseRow!.id,
          position: ii,
          title,
          planned_date: format(
            scheduleMode === "delivery"
              ? plannedDateForRange(start, end, pi, totalPhases, ii, phase.items.length)
              : plannedDateFor(start, cadence, pi, ii, phase.items.length),
            "yyyy-MM-dd",
          ),
        }));
        if (items.length) {
          const { error: e3 } = await supabase.from("schedule_items").insert(items);
          if (e3) throw e3;
        }
      }
      toast.success("Cronograma criado");
      navigate(`/cronogramas/${sched!.id}`);
    } catch (e: any) {
      toast.error(e.message || "Erro ao criar cronograma");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Novo cronograma de implantação — TreinaCheck"
        description="Crie um cronograma de implantação ERP USE a partir do template padrão."
        path="/cronogramas/novo"
      />
      <AppHeader />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/cronogramas")}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" /> Novo cronograma
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            O cronograma é criado a partir do template padrão ERP USE e fica totalmente editável.
          </p>
        </div>

        <Card>
          <CardContent className="p-5 sm:p-6 space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Cliente</Label>
                <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Nome do cliente / razão social" />
              </div>
              <div className="space-y-1.5">
                <Label>Email do cliente (opcional)</Label>
                <Input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Data de início</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Como distribuir as datas</Label>
                <div className="inline-flex rounded-md border border-input bg-background p-1 text-sm">
                  <button
                    type="button"
                    onClick={() => setScheduleMode("cadence")}
                    className={`px-3 h-8 rounded-sm transition-colors ${
                      scheduleMode === "cadence"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Por cadência
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduleMode("delivery")}
                    className={`px-3 h-8 rounded-sm transition-colors ${
                      scheduleMode === "delivery"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Por data de entrega
                  </button>
                </div>
              </div>
              {scheduleMode === "cadence" ? (
                <div className="space-y-1.5">
                  <Label>Cadência</Label>
                  <select
                    value={cadence}
                    onChange={(e) => setCadence(e.target.value as any)}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="semanal">Semanal</option>
                    <option value="quinzenal">Quinzenal</option>
                    <option value="mensal">Mensal</option>
                  </select>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>Data de entrega</Label>
                  <Input
                    type="date"
                    value={deliveryDate}
                    min={startDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Modalidade</Label>
                <select
                  value={modality}
                  onChange={(e) => setModality(e.target.value as any)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="presencial">Presencial</option>
                  <option value="remoto">Remoto</option>
                  <option value="hibrido">Híbrido</option>
                </select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Equipe de implantação (separada por vírgula)</Label>
                <Textarea value={team} onChange={(e) => setTeam(e.target.value)} rows={2} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Template</Label>
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => navigate("/cronogramas")}>Cancelar</Button>
              <Button onClick={create} disabled={saving}>
                {saving ? "Criando…" : "Criar cronograma"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}