import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ClipboardList, ListPlus, Sparkles } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppHeader } from "@/components/AppHeader";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ASSUNTOS_SUGERIDOS,
  plannedDateFor,
  plannedDateForRange,
  TemplateContent,
  type ScheduleKind,
} from "@/lib/schedule";
import { addDays, format } from "date-fns";

type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  content: TemplateContent;
  is_default?: boolean;
};

function countTemplateItems(template?: TemplateRow) {
  return template?.content?.phases?.reduce((total, phase) => total + phase.items.length, 0) ?? 0;
}

function isTemplateForType(template: TemplateRow, type: "erp" | "pdv") {
  const name = (template.name || "").toLowerCase();
  const itemCount = countTemplateItems(template);

  if (type === "pdv") {
    return name.includes("pdv") && itemCount === 43;
  }

  return name.includes("erp") || (Boolean(template.is_default) && itemCount !== 43);
}

function pickTemplateForType(list: TemplateRow[], type: "erp" | "pdv") {
  const match = list.find((t) => isTemplateForType(t, type));
  if (match) return match;
  if (type === "pdv") return undefined;
  return list.find((t) => t.is_default) || list[0];
}

/** Erro do PostgREST quando a coluna nova ainda não existe no banco. */
function mensagemDeErro(e: unknown) {
  const texto = e instanceof Error ? e.message : String(e);
  if (/kind|subject|title/i.test(texto) && /does not exist|schema cache|column/i.test(texto)) {
    return "O banco ainda não tem as colunas do cronograma livre. Rode o arquivo supabase/migrations/20261013120000_cronogramas_livres.sql no SQL Editor do Supabase e tente de novo.";
  }
  return texto;
}

export default function ScheduleNew() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [modo, setModo] = useState<ScheduleKind>(params.get("tipo") === "livre" ? "livre" : "implantacao");

  /* ---- implantação (como sempre foi) ---- */
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [systemType, setSystemType] = useState<"erp" | "pdv">("erp");
  const [clientName, setClientName] = useState(params.get("cliente") || "");
  const [clientEmail, setClientEmail] = useState("");
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [cadence, setCadence] = useState<"semanal" | "quinzenal" | "mensal">("semanal");
  const [scheduleMode, setScheduleMode] = useState<"cadence" | "delivery">("cadence");
  const [deliveryDate, setDeliveryDate] = useState(
    format(addDays(new Date(), 60), "yyyy-MM-dd"),
  );
  const [modality, setModality] = useState<"presencial" | "remoto" | "hibrido">("presencial");
  const [team, setTeam] = useState("Matheus Zanin, Claudinei da Silva, Pablo Cassiano");

  /* ---- cronograma livre ("outras coisas") ---- */
  const [titulo, setTitulo] = useState(params.get("titulo") || "");
  const [assunto, setAssunto] = useState(params.get("assunto") || "");
  const [descricao, setDescricao] = useState("");
  const [fasesTexto, setFasesTexto] = useState("");
  const [equipeLivre, setEquipeLivre] = useState("");

  const [saving, setSaving] = useState(false);
  const availableTemplates = templates.filter((template) => isTemplateForType(template, systemType));

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("implementation_templates")
        .select("id,name,description,content,is_default")
        .order("is_default", { ascending: false });
      const list = ((data ?? []) as unknown) as TemplateRow[];
      setTemplates(list);
      const pick = pickTemplateForType(list, systemType);
      if (pick) setTemplateId(pick.id);
    })();
  }, []);

  // When ERP/PDV changes, auto-select the matching template if available.
  useEffect(() => {
    if (!templates.length) return;
    const pick = pickTemplateForType(templates, systemType);
    if (pick) setTemplateId(pick.id);
  }, [systemType, templates]);

  const criarImplantacao = async () => {
    if (!clientName.trim()) throw new Error("Informe o nome do cliente");
    // Resolve template by current systemType to avoid stale templateId after toggling ERP/PDV.
    const tplByType = pickTemplateForType(templates, systemType);
    const tplById = templates.find((t) => t.id === templateId);
    const tpl = tplById && isTemplateForType(tplById, systemType) ? tplById : tplByType;
    if (!tpl) throw new Error("Selecione um template");
    if (systemType === "pdv" && countTemplateItems(tpl) !== 43) {
      throw new Error("Template PDV inválido: deve conter somente 43 etapas");
    }
    // Keep the visible select in sync if we had to fall back.
    if (tpl.id !== templateId) setTemplateId(tpl.id);
    if (scheduleMode === "delivery") {
      if (!deliveryDate) throw new Error("Informe a data de entrega");
      if (new Date(deliveryDate) <= new Date(startDate))
        throw new Error("A data de entrega deve ser após a data de início");
    }

    const { data: sched, error: e1 } = await supabase
      .from("implementation_schedules")
      .insert(({
        owner_id: user!.id,
        kind: "implantacao",
        client_name: clientName.trim(),
        client_email: clientEmail.trim() || null,
        start_date: startDate,
        cadence,
        modality,
        use_team: team.split(",").map((s) => s.trim()).filter(Boolean),
        observations: tpl.content.observations,
      }) as never)
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
        .insert(({ schedule_id: sched!.id, position: pi, title: phase.title }) as never)
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
        const { error: e3 } = await supabase.from("schedule_items").insert(items as never);
        if (e3) throw e3;
      }
    }
    return sched!.id as string;
  };

  /* Cronograma livre: nasce limpo. Só o que você escrever entra nele. */
  const criarLivre = async () => {
    const nome = titulo.trim();
    if (!nome) throw new Error("Dê um título ao cronograma (ex.: “Obra — reforma da loja”)");
    const fases = fasesTexto
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const { data: sched, error } = await supabase
      .from("implementation_schedules")
      .insert(({
        owner_id: user!.id,
        kind: "livre",
        title: nome,
        // client_name é obrigatório na tabela; no cronograma livre guarda o mesmo título
        client_name: nome,
        subject: assunto.trim() || null,
        start_date: startDate,
        cadence: "customizada",
        modality: "presencial",
        use_team: equipeLivre.split(",").map((s) => s.trim()).filter(Boolean),
        observations: descricao.trim() || null,
      }) as never)
      .select("id")
      .single();
    if (error) throw error;

    for (let i = 0; i < fases.length; i++) {
      const { error: eFase } = await supabase
        .from("schedule_phases")
        .insert(({ schedule_id: sched!.id, position: i, title: fases[i] }) as never);
      if (eFase) throw eFase;
    }
    return sched!.id as string;
  };

  const create = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const id = modo === "livre" ? await criarLivre() : await criarImplantacao();
      toast.success(modo === "livre" ? "Cronograma livre criado — agora é só preencher" : "Cronograma criado");
      navigate(`/cronogramas/${id}`);
    } catch (e: unknown) {
      toast.error(mensagemDeErro(e));
    } finally {
      setSaving(false);
    }
  };

  const livre = modo === "livre";

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={livre ? "Novo cronograma livre — TreinaCheck" : "Novo cronograma de implantação — TreinaCheck"}
        description={
          livre
            ? "Crie um cronograma em branco para qualquer outra coisa (obra, evento, manutenção) e preencha à mão."
            : "Crie um cronograma de implantação ERP USE a partir do template padrão."
        }
        path="/cronogramas/novo"
      />
      <AppHeader />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
        <BackButton to="/cronogramas" />
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" /> Novo cronograma
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Implantação de cliente (template ERP/PDV) ou um cronograma livre, em branco, para qualquer outra coisa.
          </p>
        </div>

        {/* Tipo de cronograma */}
        <div className="grid sm:grid-cols-2 gap-3">
          {(
            [
              {
                id: "implantacao",
                icone: ClipboardList,
                titulo: "Implantação de cliente",
                texto: "Nasce do template ERP ou PDV, com fases, etapas e datas sugeridas.",
              },
              {
                id: "livre",
                icone: ListPlus,
                titulo: "Cronograma livre",
                texto: "Em branco, para outras coisas: obra, evento, manutenção, rotina. Você preenche à mão.",
              },
            ] as const
          ).map((opcao) => {
            const ativo = modo === opcao.id;
            const Icone = opcao.icone;
            return (
              <button
                key={opcao.id}
                type="button"
                onClick={() => setModo(opcao.id)}
                className={`text-left rounded-xl border p-4 transition-colors ${
                  ativo ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                }`}
              >
                <div className="flex items-center gap-2 font-medium">
                  <Icone className={`h-4 w-4 ${ativo ? "text-primary" : "text-muted-foreground"}`} />
                  {opcao.titulo}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{opcao.texto}</p>
              </button>
            );
          })}
        </div>

        {livre ? (
          <Card>
            <CardContent className="p-5 sm:p-6 space-y-4">
              <div className="space-y-1.5">
                <Label>Título do cronograma</Label>
                <Input
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ex.: Obra — reforma da loja Centro"
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Assunto (opcional)</Label>
                  <Input
                    list="assuntos-cronograma"
                    value={assunto}
                    onChange={(e) => setAssunto(e.target.value)}
                    placeholder="Obra, Evento, Manutenção…"
                  />
                  <datalist id="assuntos-cronograma">
                    {ASSUNTOS_SUGERIDOS.map((a) => (
                      <option key={a} value={a} />
                    ))}
                  </datalist>
                </div>
                <div className="space-y-1.5">
                  <Label>Data de início</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Responsáveis (separados por vírgula, opcional)</Label>
                  <Input
                    value={equipeLivre}
                    onChange={(e) => setEquipeLivre(e.target.value)}
                    placeholder="Quem cuida disso"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Descrição / observações (opcional)</Label>
                <Textarea
                  rows={3}
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Contexto do cronograma — aparece no cabeçalho e nas impressões."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Fases iniciais (opcional — uma por linha)</Label>
                <Textarea
                  rows={4}
                  value={fasesTexto}
                  onChange={(e) => setFasesTexto(e.target.value)}
                  placeholder={"Deixe em branco para começar 100% limpo.\nOu escreva, por exemplo:\nDiagnóstico\nOrçamento e aprovação\nExecução\nEntrega"}
                />
                <p className="text-xs text-muted-foreground">
                  Cada linha vira uma fase. Depois você adiciona as atividades (uma a uma ou colando uma lista) dentro
                  de cada fase.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => navigate("/cronogramas")}>Cancelar</Button>
                <Button onClick={create} disabled={saving}>{saving ? "Criando…" : "Criar cronograma livre"}</Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-5 sm:p-6 space-y-4">
              <div className="space-y-1.5">
                <Label>Tipo de implantação</Label>
                <div className="inline-flex rounded-md border border-input bg-background p-1 text-sm">
                  <button
                    type="button"
                    onClick={() => setSystemType("erp")}
                    className={`px-3 h-8 rounded-sm transition-colors ${
                      systemType === "erp"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    ERP (cronograma completo)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSystemType("pdv")}
                    className={`px-3 h-8 rounded-sm transition-colors ${
                      systemType === "pdv"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    PDV (43 etapas)
                  </button>
                </div>
              </div>
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
                      onChange={(e) => setCadence(e.target.value as typeof cadence)}
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
                    onChange={(e) => setModality(e.target.value as typeof modality)}
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
                    {availableTemplates.map((t) => (
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
        )}
      </main>
    </div>
  );
}
