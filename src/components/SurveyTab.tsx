import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Plus, Trash2, Link2, ArrowUp, ArrowDown, FileText, Download, RefreshCw,
  ClipboardList, CheckCircle2, Clock, Paperclip, Printer, Lightbulb, Layers,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { publicUrl } from "@/lib/publicUrl";
import {
  type BankQuestion, type SurveyModule, type SurveyQuestionType, QUESTION_TYPE_LABELS,
  perguntasDoModulo, secoesPresentes, sugestoesDeModulos, textosDasRespostas,
} from "@/lib/surveyModulos";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";


type Survey = {
  id: string; schedule_id: string; title: string; intro: string | null;
  status: string; public_token: string | null; respondent_name: string | null;
  respondent_email: string | null; submitted_at: string | null; created_at: string;
  decided_modules?: string[] | null;
};
type Question = {
  id: string; survey_id: string; section: string | null; position: number;
  label: string; help_text: string | null; type: string; options: any; required: boolean;
};
type Answer = { question_id: string; value: string | null; value_json: any; updated_at: string };
type SurveyFile = {
  id: string; question_id: string | null; file_path: string; file_name: string;
  file_size: number | null; uploaded_by_name: string | null; created_at: string;
};

export function SurveyTab({
  scheduleId, clientName, canEdit,
}: { scheduleId: string; clientName: string; canEdit: boolean }) {
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [files, setFiles] = useState<SurveyFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [modulos, setModulos] = useState<SurveyModule[]>([]);
  const [banco, setBanco] = useState<BankQuestion[]>([]);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    const { data: sv, error } = await supabase
      .from("process_surveys").select("*").eq("schedule_id", scheduleId)
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (error) { toast.error(error.message); setLoading(false); return; }
    if (!sv) { setSurvey(null); setQuestions([]); setAnswers({}); setFiles([]); setLoading(false); return; }
    setSurvey(sv as Survey);
    const [{ data: qs }, { data: as }, { data: fs }] = await Promise.all([
      supabase.from("survey_questions").select("*").eq("survey_id", sv.id).order("position", { ascending: true }),
      supabase.from("survey_answers").select("question_id, value, value_json, updated_at").eq("survey_id", sv.id),
      supabase.from("survey_files").select("*").eq("survey_id", sv.id).order("created_at", { ascending: true }),
    ]);
    setQuestions((qs as Question[]) || []);
    const map: Record<string, Answer> = {};
    ((as as Answer[]) || []).forEach((a) => { map[a.question_id] = a; });
    setAnswers(map);
    setFiles((fs as SurveyFile[]) || []);
    setLoading(false);
  }, [scheduleId]);

  useEffect(() => { load(); }, [load]);

  // Módulos e perguntas padrão (editados em Admin → Perguntas do levantamento).
  useEffect(() => {
    (async () => {
      const [{ data: mods, error: e1 }, { data: qs, error: e2 }] = await Promise.all([
        supabase.from("survey_modules").select("code, name, section, optional, terms, position").order("position", { ascending: true }),
        supabase.from("survey_template_questions").select("id, module_code, position, label, help_text, type, options, required").order("position", { ascending: true }),
      ]);
      if (e1 || e2) {
        toast.error(`Não foi possível carregar o padrão de perguntas: ${(e1 || e2)?.message}`);
        return;
      }
      setModulos((mods as unknown as SurveyModule[]) || []);
      setBanco((qs as unknown as BankQuestion[]) || []);
    })();
  }, []);

  // Sugestões: termos citados nas respostas de módulos opcionais que ainda não estão no levantamento.
  const secoesNoLevantamento = useMemo(() => secoesPresentes(questions), [questions]);
  const sugestoes = useMemo(
    () => sugestoesDeModulos({
      modulos,
      textos: textosDasRespostas(Object.values(answers)),
      secoesNoLevantamento,
      decididos: survey?.decided_modules ?? [],
    }),
    [modulos, answers, secoesNoLevantamento, survey?.decided_modules],
  );

  const createSurvey = async (withTemplate = true) => {
    // Padrão = só os módulos obrigatórios (Comercial e Financeiro); os opcionais entram por sugestão.
    const linhasPadrao = withTemplate
      ? modulos.filter((m) => !m.optional).flatMap((m) => perguntasDoModulo(m, banco))
      : [];
    if (withTemplate && linhasPadrao.length === 0) {
      return toast.error("O padrão de perguntas ainda não foi carregado. Confira se a migração 20261014150000 foi aplicada.");
    }
    setCreating(true);
    const { data: userData } = await supabase.auth.getUser();
    const { data: created, error } = await supabase.from("process_surveys").insert({
      schedule_id: scheduleId,
      created_by: userData.user?.id ?? null,
      title: "Levantamento de Processos",
      intro: `Olá! Para avançarmos com a implantação de ${clientName}, precisamos entender como funcionam hoje os processos da empresa. Responda ao questionário abaixo e anexe os arquivos solicitados.`,
    }).select("id").single();
    if (error) { setCreating(false); return toast.error(error.message); }
    if (withTemplate && created) {
      const { error: qErr } = await supabase.from("survey_questions").insert(
        linhasPadrao.map((q, i) => ({
          survey_id: created.id,
          position: i,
          section: q.section,
          label: q.label,
          help_text: q.help_text,
          type: q.type,
          options: q.options as Json,
          required: q.required,
        })),
      );
      if (qErr) toast.error(qErr.message);
    }
    setCreating(false);
    toast.success("Levantamento criado");
    load();
  };

  const applyTemplate = async () => {
    if (!survey) return;
    // Só traz as seções obrigatórias que ainda não estão no levantamento.
    const faltando = modulos.filter((m) => !m.optional && !secoesNoLevantamento.has(m.section));
    const linhas = faltando.flatMap((m) => perguntasDoModulo(m, banco));
    if (linhas.length === 0) return toast.message("As perguntas obrigatórias já estão no levantamento");
    if (!confirm("Adicionar as perguntas obrigatórias que estão faltando? As perguntas atuais serão mantidas.")) return;
    const base = questions.length ? Math.max(...questions.map((q) => q.position)) + 1 : 0;
    const { error } = await supabase.from("survey_questions").insert(
      linhas.map((q, i) => ({
        survey_id: survey.id,
        position: base + i,
        section: q.section,
        label: q.label,
        help_text: q.help_text,
        type: q.type,
        options: q.options as Json,
        required: q.required,
      })),
    );
    if (error) return toast.error(error.message);
    toast.success("Perguntas obrigatórias aplicadas");
    load();
  };

  /** Registra que o consultor já decidiu sobre este módulo (aceitou ou recusou). */
  const marcarDecidido = async (codigo: string) => {
    if (!survey) return;
    const decididos = Array.from(new Set([...(survey.decided_modules ?? []), codigo]));
    await updateSurvey({ decided_modules: decididos });
  };

  const inserirModulo = async (modulo: SurveyModule) => {
    if (!survey) return;
    const linhas = perguntasDoModulo(modulo, banco);
    if (linhas.length === 0) {
      return toast.error(`O módulo ${modulo.name} não tem perguntas no padrão. Cadastre-as em Admin → Perguntas do levantamento.`);
    }
    const base = questions.length ? Math.max(...questions.map((q) => q.position)) + 1 : 0;
    const { error } = await supabase.from("survey_questions").insert(
      linhas.map((q, i) => ({
        survey_id: survey.id,
        position: base + i,
        section: q.section,
        label: q.label,
        help_text: q.help_text,
        type: q.type,
        options: q.options as Json,
        required: q.required,
      })),
    );
    if (error) return toast.error(error.message);
    await marcarDecidido(modulo.code);
    toast.success(`Módulo ${modulo.name} inserido no levantamento`);
    load();
  };

  const recusarModulo = async (modulo: SurveyModule) => {
    await marcarDecidido(modulo.code);
    toast.message(`Sugestão de ${modulo.name} dispensada neste levantamento`);
  };

  const updateSurvey = async (patch: Partial<Survey>) => {
    if (!survey) return;
    setSurvey({ ...survey, ...patch } as Survey);
    const { error } = await supabase.from("process_surveys").update(patch as any).eq("id", survey.id);
    if (error) toast.error(error.message);
  };

  const addQuestion = async (section?: string | null) => {
    if (!survey) return;
    const position = questions.length ? Math.max(...questions.map((q) => q.position)) + 1 : 0;
    const { data, error } = await supabase.from("survey_questions")
      .insert({ survey_id: survey.id, position, label: "Nova pergunta", type: "text", section: section ?? null })
      .select("*").single();
    if (error) return toast.error(error.message);
    setQuestions((q) => [...q, data as Question]);
  };

  const updateQuestion = async (id: string, patch: Partial<Question>) => {
    setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...patch } : q)));
    const { error } = await supabase.from("survey_questions").update(patch as any).eq("id", id);
    if (error) toast.error(error.message);
  };

  const removeQuestion = async (id: string) => {
    if (!confirm("Remover esta pergunta?")) return;
    const { error } = await supabase.from("survey_questions").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setQuestions((qs) => qs.filter((q) => q.id !== id));
  };

  const moveQuestion = async (id: string, dir: -1 | 1) => {
    const idx = questions.findIndex((q) => q.id === id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= questions.length) return;
    const next = [...questions];
    [next[idx], next[target]] = [next[target], next[idx]];
    const reordered = next.map((q, i) => ({ ...q, position: i }));
    setQuestions(reordered);
    await Promise.all(reordered.map((q) =>
      supabase.from("survey_questions").update({ position: q.position }).eq("id", q.id)));
  };

  const copyLink = async () => {
    if (!survey?.public_token) return;
    await navigator.clipboard.writeText(publicUrl(`/q/${survey.public_token}`));
    if (survey.status === "draft") updateSurvey({ status: "sent" });
    toast.success("Link do questionário copiado");
  };

  const reopen = async () => {
    if (!survey) return;
    if (!confirm("Reabrir o questionário para o cliente editar as respostas?")) return;
    await updateSurvey({ submitted_at: null, status: "sent" });
    toast.success("Questionário reaberto");
  };

  const openFile = async (f: SurveyFile) => {
    const { data, error } = await supabase.storage.from("survey-files").createSignedUrl(f.file_path, 300);
    if (error || !data) return toast.error(error?.message || "Não foi possível abrir o arquivo");
    window.open(data.signedUrl, "_blank");
  };

  const sections = useMemo(() => {
    const order: string[] = [];
    questions.forEach((q) => {
      const s = q.section || "Geral";
      if (!order.includes(s)) order.push(s);
    });
    return order.map((s) => ({ name: s, items: questions.filter((q) => (q.section || "Geral") === s) }));
  }, [questions]);

  const answeredCount = questions.filter((q) => {
    const a = answers[q.id];
    return a && ((a.value && a.value.trim() !== "") || (a.value_json && JSON.stringify(a.value_json) !== "null"));
  }).length;

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Carregando levantamento…</p>;

  if (!survey) {
    return (
      <Card>
        <CardContent className="p-8 text-center space-y-4">
          <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground" />
          <div>
            <h3 className="font-semibold">Nenhum levantamento criado</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Crie o questionário de levantamento de processos para enviar ao cliente por link.
            </p>
          </div>
          {canEdit && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button onClick={() => createSurvey(true)} disabled={creating}>
                <Plus className="h-4 w-4" /> Criar com o padrão de perguntas
              </Button>
              <Button variant="outline" onClick={() => createSurvey(false)} disabled={creating}>
                Criar em branco
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  const submitted = !!survey.submitted_at;

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardContent className="p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <ClipboardList className="h-4 w-4 text-primary shrink-0" />
              <Input
                value={survey.title}
                disabled={!canEdit}
                onChange={(e) => updateSurvey({ title: e.target.value })}
                className="h-9 font-medium border-0 px-0 shadow-none focus-visible:ring-0 text-base"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {submitted ? (
                <Badge className="bg-emerald-700 text-white hover:bg-emerald-700">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Respondido
                </Badge>
              ) : survey.status === "sent" ? (
                <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" /> Aguardando cliente</Badge>
              ) : (
                <Badge variant="outline">Rascunho</Badge>
              )}
              <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
              <Button size="sm" onClick={copyLink}><Link2 className="h-4 w-4" /> Link do cliente</Button>
              {canEdit && (
                <Button variant="outline" size="sm" onClick={applyTemplate}>
                  <ClipboardList className="h-4 w-4" /> Aplicar padrão
                </Button>
              )}
              {submitted && canEdit && (
                <Button variant="outline" size="sm" onClick={reopen}>Reabrir</Button>
              )}
              {submitted && (
                <Button variant="outline" size="sm" onClick={() => navigate(`/levantamentos/${survey.id}/relatorio`)}>
                  <Printer className="h-4 w-4" /> Relatório de respostas
                </Button>
              )}
            </div>
          </div>

          <Textarea
            rows={2} placeholder="Texto de abertura para o cliente"
            value={survey.intro || ""} disabled={!canEdit}
            onChange={(e) => updateSurvey({ intro: e.target.value })}
          />

          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span>{questions.length} perguntas</span>
            <span>{answeredCount} respondidas</span>
            <span>{files.length} arquivos</span>
            {survey.respondent_name && <span>Respondido por {survey.respondent_name}</span>}
            {survey.submitted_at && (
              <span>Finalizado em {format(new Date(survey.submitted_at), "d MMM yyyy HH:mm", { locale: ptBR })}</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Files sent by client */}
      {files.length > 0 && (
        <Card>
          <CardContent className="p-4 sm:p-5 space-y-2">
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
              <Paperclip className="h-3.5 w-3.5" /> Arquivos enviados pelo cliente
            </h3>
            <ul className="divide-y divide-border">
              {files.map((f) => (
                <li key={f.id} className="py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm truncate">{f.file_name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {format(new Date(f.created_at), "d MMM yyyy HH:mm", { locale: ptBR })}
                      {f.file_size ? ` · ${Math.round(f.file_size / 1024)} KB` : ""}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => openFile(f)}>
                    <Download className="h-4 w-4" /> Abrir
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Sugestões de módulos citados nas respostas */}
      {canEdit && !submitted && sugestoes.length > 0 && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="p-4 sm:p-5 space-y-3">
            <h3 className="flex items-center gap-2 font-semibold">
              <Lightbulb className="h-4 w-4 text-primary" /> Sugestões para o levantamento
            </h3>
            {sugestoes.map(({ modulo, termos }) => (
              <div key={modulo.code} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card p-3">
                <p className="text-sm min-w-0">
                  Foi citado{" "}
                  <strong>{termos.map((t) => `“${t}”`).join(", ")}</strong>{" "}
                  nas respostas. Inserir o módulo <strong>{modulo.name}</strong> no levantamento?
                </p>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" onClick={() => inserirModulo(modulo)}>Sim, inserir</Button>
                  <Button size="sm" variant="outline" onClick={() => recusarModulo(modulo)}>Não</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Módulos opcionais: inserção manual */}
      {canEdit && !submitted && modulos.some((m) => m.optional) && (
        <Card>
          <CardContent className="p-4 sm:p-5 space-y-2">
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" /> Módulos opcionais
            </h3>
            <div className="flex flex-wrap gap-2">
              {modulos.filter((m) => m.optional).map((m) =>
                secoesNoLevantamento.has(m.section) ? (
                  <Badge key={m.code} variant="secondary">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> {m.name} no levantamento
                  </Badge>
                ) : (
                  <Button key={m.code} size="sm" variant="outline" onClick={() => inserirModulo(m)}>
                    <Plus className="h-4 w-4" /> {m.name}
                  </Button>
                ),
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Quando um termo do módulo aparecer nas respostas, o sistema sugere inseri-lo.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Questions + answers */}
      {sections.map((section, sectionIndex) => (
        <Card key={section.name} className="overflow-hidden">
          <CardContent className="p-4 sm:p-5 space-y-3">
            <div className="flex items-center gap-3 border-b border-border pb-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground">{sectionIndex + 1}</span>
              <div>
                <h3 className="font-semibold">{section.name}</h3>
                <p className="text-xs text-muted-foreground">{section.items.length} pergunta{section.items.length === 1 ? "" : "s"}</p>
              </div>
            </div>
            <ul className="space-y-3">
              {section.items.map((q) => {
                const a = answers[q.id];
                const answerText = a?.value_json && Array.isArray(a.value_json)
                  ? (a.value_json as string[]).join(", ")
                  : a?.value || "";
                const qFiles = files.filter((f) => f.question_id === q.id);
                return (
                  <li key={q.id} className="rounded-md border border-border bg-background p-3 space-y-2 shadow-sm">
                    <div className="flex items-start gap-2">
                      <span className="mt-1 grid h-7 min-w-7 place-items-center rounded bg-muted text-xs font-bold text-muted-foreground">
                        {questions.findIndex((item) => item.id === q.id) + 1}
                      </span>
                      <div className="flex-1 space-y-2">
                        <Input
                          value={q.label} disabled={!canEdit}
                          onChange={(e) => updateQuestion(q.id, { label: e.target.value })}
                          className="h-9 font-medium"
                        />
                        <div className="grid sm:grid-cols-3 gap-2">
                          <select
                            value={q.type} disabled={!canEdit}
                            onChange={(e) => updateQuestion(q.id, { type: e.target.value })}
                            className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                          >
                            {Object.entries(QUESTION_TYPE_LABELS).map(([v, l]) => (
                              <option key={v} value={v}>{l}</option>
                            ))}
                          </select>
                          <Input
                            placeholder="Seção" value={q.section || ""} disabled={!canEdit}
                            onChange={(e) => updateQuestion(q.id, { section: e.target.value })}
                            className="h-9 text-xs"
                          />
                          <label className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                            <input
                              type="checkbox" checked={q.required} disabled={!canEdit}
                              onChange={(e) => updateQuestion(q.id, { required: e.target.checked })}
                            />
                            Obrigatória
                          </label>
                        </div>
                        <Input
                          placeholder="Dica / explicação (opcional)" value={q.help_text || ""} disabled={!canEdit}
                          onChange={(e) => updateQuestion(q.id, { help_text: e.target.value })}
                          className="h-9 text-xs"
                        />
                        {(q.type === "select" || q.type === "multiselect") && (
                          <Input
                            placeholder="Opções separadas por ; (ex: Sim; Não; Parcial)"
                            value={Array.isArray(q.options) ? (q.options as string[]).join("; ") : ""}
                            disabled={!canEdit}
                            onChange={(e) => updateQuestion(q.id, {
                              options: e.target.value.split(";").map((s) => s.trim()).filter(Boolean) as any,
                            })}
                            className="h-9 text-xs"
                          />
                        )}
                      </div>
                      {canEdit && (
                        <div className="flex flex-col gap-1">
                          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => moveQuestion(q.id, -1)}>
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => moveQuestion(q.id, 1)}>
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive" onClick={() => removeQuestion(q.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className={`rounded-md border p-3 space-y-1 ${answerText || qFiles.length > 0 ? "border-primary/30 bg-primary/5" : "border-dashed border-border bg-muted/20"}`}>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] font-semibold uppercase text-muted-foreground">Resposta do cliente</p>
                          {answerText || qFiles.length > 0
                            ? <Badge variant="secondary" className="text-[10px]">Respondida</Badge>
                            : <Badge variant="outline" className="text-[10px]">Sem resposta</Badge>}
                        </div>
                        {answerText && <p className="pt-1 text-sm font-medium whitespace-pre-wrap">{answerText}</p>}
                        {qFiles.map((f) => (
                          <Button key={f.id} type="button" variant="link" size="sm" onClick={() => openFile(f)}
                            className="h-auto justify-start p-0 text-xs">
                            <FileText className="h-3 w-3" /> {f.file_name}
                          </Button>
                        ))}
                    </div>
                  </li>
                );
              })}
            </ul>
            {canEdit && (
              <Button variant="outline" size="sm" className="w-full" onClick={() => addQuestion(section.name === "Geral" ? null : section.name)}>
                <Plus className="h-4 w-4" /> Adicionar pergunta em {section.name}
              </Button>
            )}
          </CardContent>
        </Card>
      ))}

      {canEdit && (
        <Button variant="outline" onClick={() => addQuestion(null)} className="w-full">
          <Plus className="h-4 w-4" /> Nova pergunta
        </Button>
      )}

      {questions.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">
          Nenhuma pergunta ainda. Assim que você me enviar o padrão do questionário, eu cadastro tudo aqui.
        </p>
      )}
    </div>
  );
}
