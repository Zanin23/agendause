import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { AppHeader } from "@/components/AppHeader";
import { BackButton } from "@/components/BackButton";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  QUESTION_TYPE_LABELS, termosDoTexto, type BankQuestion, type SurveyModule, type SurveyQuestionType,
} from "@/lib/surveyModulos";

const TIPOS_COM_OPCOES: string[] = ["select", "multiselect"];

const opcoesParaTexto = (options: unknown) =>
  Array.isArray(options) ? options.map((o) => String(o)).join("\n") : "";

const textoParaOpcoes = (texto: string) =>
  texto.split("\n").map((o) => o.trim()).filter(Boolean);

/* ---------------------------------------------------------------------------
   Perguntas padrão do levantamento — só administradores.
   Mudanças valem para levantamentos NOVOS e para módulos inseridos depois.
   Levantamentos já criados não são alterados.
--------------------------------------------------------------------------- */

const ModuloCard = ({
  modulo,
  perguntas,
  onAlterado,
}: {
  modulo: SurveyModule;
  perguntas: BankQuestion[];
  onAlterado: () => void;
}) => {
  const [nome, setNome] = useState(modulo.name);
  const [secao, setSecao] = useState(modulo.section);
  const [opcional, setOpcional] = useState(modulo.optional);
  const [termos, setTermos] = useState(modulo.terms.join(", "));
  const [salvando, setSalvando] = useState(false);

  // Só recarrega os campos quando o valor gravado muda (não a cada recarregamento da lista).
  const termosGravados = modulo.terms.join(", ");
  useEffect(() => {
    setNome(modulo.name);
    setSecao(modulo.section);
    setOpcional(modulo.optional);
    setTermos(termosGravados);
  }, [modulo.name, modulo.section, modulo.optional, termosGravados]);

  const salvar = async () => {
    setSalvando(true);
    const { error } = await supabase
      .from("survey_modules")
      .update({
        name: nome.trim() || modulo.name,
        section: secao.trim() || modulo.section,
        optional: opcional,
        terms: termosDoTexto(termos),
        updated_at: new Date().toISOString(),
      })
      .eq("code", modulo.code);
    setSalvando(false);
    if (error) return toast.error(error.message);
    toast.success(`Módulo ${nome || modulo.name} salvo`);
    onAlterado();
  };

  const novaPergunta = async () => {
    const base = perguntas.length ? Math.max(...perguntas.map((p) => p.position)) + 1 : 1;
    const { error } = await supabase.from("survey_template_questions").insert({
      module_code: modulo.code,
      position: base,
      label: "Nova pergunta",
      type: "text",
      options: [],
      required: false,
    });
    if (error) return toast.error(error.message);
    onAlterado();
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 sm:p-5 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Nome do módulo</span>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Seção no levantamento</span>
            <Input value={secao} onChange={(e) => setSecao(e.target.value)} />
          </label>
        </div>
        <label className="space-y-1 block">
          <span className="text-xs text-muted-foreground">
            Termos que disparam a sugestão (separados por vírgula). Acento e maiúsculas não importam.
          </span>
          <Input value={termos} onChange={(e) => setTermos(e.target.value)} placeholder="PCP, produção, MRP" />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={opcional} onChange={(e) => setOpcional(e.target.checked)} />
            Opcional (oferecido por sugestão, não entra por padrão)
          </label>
          <Button size="sm" onClick={salvar} disabled={salvando}>
            {salvando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar módulo
          </Button>
        </div>

        <div className="border-t border-border pt-4 space-y-3">
          <h3 className="text-sm font-semibold">Perguntas ({perguntas.length})</h3>
          {perguntas.map((p, i) => (
            <PerguntaEditor
              key={p.id}
              pergunta={p}
              primeira={i === 0}
              ultima={i === perguntas.length - 1}
              vizinhaAnterior={perguntas[i - 1]}
              vizinhaPosterior={perguntas[i + 1]}
              onAlterado={onAlterado}
            />
          ))}
          <Button variant="outline" size="sm" onClick={novaPergunta}>
            <Plus className="h-4 w-4 mr-2" /> Nova pergunta em {modulo.name}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

const PerguntaEditor = ({
  pergunta,
  primeira,
  ultima,
  vizinhaAnterior,
  vizinhaPosterior,
  onAlterado,
}: {
  pergunta: BankQuestion;
  primeira: boolean;
  ultima: boolean;
  vizinhaAnterior?: BankQuestion;
  vizinhaPosterior?: BankQuestion;
  onAlterado: () => void;
}) => {
  const [label, setLabel] = useState(pergunta.label);
  const [ajuda, setAjuda] = useState(pergunta.help_text ?? "");
  const [tipo, setTipo] = useState<SurveyQuestionType>(pergunta.type as SurveyQuestionType);
  const [opcoes, setOpcoes] = useState(opcoesParaTexto(pergunta.options));
  const [obrigatoria, setObrigatoria] = useState(pergunta.required);
  const [salvando, setSalvando] = useState(false);

  const opcoesGravadas = opcoesParaTexto(pergunta.options);
  useEffect(() => {
    setLabel(pergunta.label);
    setAjuda(pergunta.help_text ?? "");
    setTipo(pergunta.type as SurveyQuestionType);
    setOpcoes(opcoesGravadas);
    setObrigatoria(pergunta.required);
  }, [pergunta.label, pergunta.help_text, pergunta.type, opcoesGravadas, pergunta.required]);

  const salvar = async () => {
    if (!label.trim()) return toast.error("A pergunta precisa de um texto");
    setSalvando(true);
    const { error } = await supabase
      .from("survey_template_questions")
      .update({
        label: label.trim(),
        help_text: ajuda.trim() || null,
        type: tipo,
        options: TIPOS_COM_OPCOES.includes(tipo) ? textoParaOpcoes(opcoes) : [],
        required: obrigatoria,
        updated_at: new Date().toISOString(),
      })
      .eq("id", pergunta.id);
    setSalvando(false);
    if (error) return toast.error(error.message);
    toast.success("Pergunta salva");
    onAlterado();
  };

  /** Troca a posição com a vizinha (duas gravações). */
  const mover = async (vizinha?: BankQuestion) => {
    if (!vizinha) return;
    const a = supabase.from("survey_template_questions").update({ position: vizinha.position }).eq("id", pergunta.id);
    const b = supabase.from("survey_template_questions").update({ position: pergunta.position }).eq("id", vizinha.id);
    const [ra, rb] = await Promise.all([a, b]);
    if (ra.error || rb.error) return toast.error((ra.error || rb.error)?.message ?? "Erro ao reordenar");
    onAlterado();
  };

  const excluir = async () => {
    if (!confirm(`Apagar a pergunta “${pergunta.label}” do padrão? Os levantamentos já criados não são alterados.`)) return;
    const { error } = await supabase.from("survey_template_questions").delete().eq("id", pergunta.id);
    if (error) return toast.error(error.message);
    toast.success("Pergunta apagada do padrão");
    onAlterado();
  };

  return (
    <div className="rounded-lg border border-border bg-card/60 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{QUESTION_TYPE_LABELS[tipo] ?? tipo}</Badge>
        {obrigatoria && <Badge variant="secondary">Obrigatória</Badge>}
        <div className="ml-auto flex gap-1">
          <Button variant="ghost" size="icon" onClick={() => mover(vizinhaAnterior)} disabled={primeira} aria-label="Subir pergunta">
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => mover(vizinhaPosterior)} disabled={ultima} aria-label="Descer pergunta">
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={excluir} aria-label="Apagar pergunta">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>
      <Input value={label} onChange={(e) => setLabel(e.target.value)} />
      <Input value={ajuda} onChange={(e) => setAjuda(e.target.value)} placeholder="Dica / explicação (opcional)" />
      <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-start">
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as SurveyQuestionType)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          {(Object.keys(QUESTION_TYPE_LABELS) as SurveyQuestionType[]).map((t) => (
            <option key={t} value={t}>{QUESTION_TYPE_LABELS[t]}</option>
          ))}
        </select>
        <label className="flex h-10 items-center gap-2 text-sm">
          <input type="checkbox" checked={obrigatoria} onChange={(e) => setObrigatoria(e.target.checked)} />
          Obrigatória
        </label>
      </div>
      {TIPOS_COM_OPCOES.includes(tipo) && (
        <Textarea
          rows={3}
          value={opcoes}
          onChange={(e) => setOpcoes(e.target.value)}
          placeholder={"Uma opção por linha"}
        />
      )}
      <div className="flex justify-end">
        <Button size="sm" onClick={salvar} disabled={salvando}>
          {salvando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Salvar pergunta
        </Button>
      </div>
    </div>
  );
};

const SurveyBankEditor = () => {
  const { isAdmin, loading: roleLoading } = useIsAdmin();
  const [modulos, setModulos] = useState<SurveyModule[]>([]);
  const [perguntas, setPerguntas] = useState<BankQuestion[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [{ data: mods, error: e1 }, { data: qs, error: e2 }] = await Promise.all([
      supabase.from("survey_modules").select("code, name, section, optional, terms, position").order("position", { ascending: true }),
      supabase.from("survey_template_questions").select("id, module_code, position, label, help_text, type, options, required").order("position", { ascending: true }),
    ]);
    if (e1 || e2) toast.error((e1 || e2)?.message ?? "Erro ao carregar o padrão");
    setModulos((mods as unknown as SurveyModule[]) || []);
    setPerguntas((qs as unknown as BankQuestion[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!roleLoading && isAdmin) load();
    if (!roleLoading && !isAdmin) setLoading(false);
  }, [roleLoading, isAdmin, load]);

  const porModulo = useMemo(() => {
    const mapa: Record<string, BankQuestion[]> = {};
    perguntas.forEach((p) => { (mapa[p.module_code] ||= []).push(p); });
    return mapa;
  }, [perguntas]);

  if (roleLoading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Perguntas do levantamento — TreinaCheck" description="Perguntas padrão e módulos do levantamento de processos." path="/admin/levantamento-padrao" />
      <AppHeader />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <BackButton />
        {!isAdmin ? (
          <section className="rounded-2xl border border-border bg-card/60 p-8 text-center">
            <h1 className="text-2xl font-semibold">Acesso restrito</h1>
            <p className="text-muted-foreground mt-2">Somente administradores editam as perguntas padrão.</p>
          </section>
        ) : (
          <>
            <header className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight">Perguntas do levantamento</h1>
              <p className="text-muted-foreground">
                Perguntas padrão e termos de sugestão de cada módulo. Mudanças valem para levantamentos novos e para
                módulos inseridos depois; os levantamentos já criados não são alterados.
              </p>
            </header>
            {loading ? (
              <div className="py-16 text-center text-muted-foreground">Carregando...</div>
            ) : (
              modulos.map((m) => (
                <div key={m.code} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold">{m.name}</h2>
                    <Badge variant={m.optional ? "outline" : "secondary"}>{m.optional ? "Opcional" : "Obrigatório"}</Badge>
                  </div>
                  <ModuloCard modulo={m} perguntas={porModulo[m.code] ?? []} onAlterado={load} />
                </div>
              ))
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default SurveyBankEditor;
