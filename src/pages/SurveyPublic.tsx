import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, ClipboardList, Loader2, Paperclip, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

type PublicQuestion = {
  id: string; section: string | null; position: number; label: string;
  help_text: string | null; type: string; options: string[]; required: boolean;
  answer: { value: string | null; value_json: any } | null;
};
type PublicSurvey = {
  id: string; title: string; intro: string | null; status: string;
  respondent_name: string | null; respondent_email: string | null;
  submitted_at: string | null; client_name: string;
  questions: PublicQuestion[];
  files: { id: string; question_id: string | null; file_name: string }[];
};

export default function SurveyPublic() {
  const { token } = useParams();
  const [survey, setSurvey] = useState<PublicSurvey | null>(null);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<Record<string, string>>({});
  const [multi, setMulti] = useState<Record<string, string[]>>({});
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    const { data, error } = await supabase.rpc("get_survey_by_token", { _token: token });
    if (error) { toast.error(error.message); setLoading(false); return; }
    const sv = data as unknown as PublicSurvey | null;
    setSurvey(sv);
    if (sv) {
      const v: Record<string, string> = {};
      const m: Record<string, string[]> = {};
      sv.questions.forEach((q) => {
        if (q.type === "multiselect") m[q.id] = Array.isArray(q.answer?.value_json) ? q.answer!.value_json : [];
        else v[q.id] = q.answer?.value || "";
      });
      setValues(v); setMulti(m);
      setName(sv.respondent_name || ""); setEmail(sv.respondent_email || "");
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const sections = useMemo(() => {
    if (!survey) return [];
    const order: string[] = [];
    survey.questions.forEach((q) => {
      const s = q.section || "Geral";
      if (!order.includes(s)) order.push(s);
    });
    return order.map((s) => ({ name: s, items: survey.questions.filter((q) => (q.section || "Geral") === s) }));
  }, [survey]);

  const buildAnswers = () =>
    (survey?.questions || []).map((q) =>
      q.type === "multiselect"
        ? { question_id: q.id, value: null, value_json: multi[q.id] || [] }
        : { question_id: q.id, value: values[q.id] ?? "", value_json: null });

  const save = async (finalize: boolean) => {
    if (!token || !survey) return;
    if (finalize) {
      if (!name.trim()) return toast.error("Informe seu nome antes de finalizar");
      const missing = survey.questions.filter((q) => {
        if (!q.required) return false;
        if (q.type === "multiselect") return (multi[q.id] || []).length === 0;
        if (q.type === "file") return !survey.files.some((f) => f.question_id === q.id);
        return !(values[q.id] || "").trim();
      });
      if (missing.length) return toast.error(`Responda as perguntas obrigatórias (${missing.length} pendente(s))`);
      if (!confirm("Finalizar e enviar as respostas? Depois não será possível editar.")) return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("save_survey_answers", {
      _token: token, _respondent_name: name, _respondent_email: email,
      _answers: buildAnswers() as any, _finalize: finalize,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(finalize ? "Respostas enviadas. Obrigado!" : "Respostas salvas");
    load();
  };

  const uploadFile = async (questionId: string | null, file: File) => {
    if (!token) return;
    setUploading(questionId || "geral");
    const safe = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `${token}/${Date.now()}-${safe}`;
    const { error: upErr } = await supabase.storage.from("survey-files").upload(path, file);
    if (upErr) { setUploading(null); return toast.error(upErr.message); }
    const { error } = await supabase.rpc("register_survey_file", {
      _token: token, _question_id: questionId, _file_path: path, _file_name: file.name,
      _file_size: file.size, _mime_type: file.type, _uploaded_by_name: name || null,
    });
    setUploading(null);
    if (error) return toast.error(error.message);
    toast.success("Arquivo enviado");
    load();
  };

  if (loading) {
    return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Carregando…</div>;
  }
  if (!survey) {
    return (
      <div className="min-h-screen grid place-items-center px-4 text-center">
        <div>
          <h1 className="text-xl font-semibold">Questionário não encontrado</h1>
          <p className="text-sm text-muted-foreground mt-1">Verifique o link recebido.</p>
        </div>
      </div>
    );
  }

  const done = !!survey.submitted_at;

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-3xl mx-auto px-4 py-8 space-y-5">
        <header className="space-y-2">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            <h1 className="text-xl sm:text-2xl font-semibold">{survey.title}</h1>
          </div>
          <p className="text-sm text-muted-foreground">{survey.client_name}</p>
          {survey.intro && <p className="text-sm">{survey.intro}</p>}
          {done && (
            <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Respostas enviadas
            </Badge>
          )}
        </header>

        <Card>
          <CardContent className="p-4 grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">Seu nome</label>
              <Input value={name} disabled={done} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">E-mail (opcional)</label>
              <Input type="email" value={email} disabled={done} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {sections.map((section) => (
          <Card key={section.name}>
            <CardContent className="p-4 sm:p-5 space-y-4">
              <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{section.name}</h2>
              {section.items.map((q) => {
                const qFiles = survey.files.filter((f) => f.question_id === q.id);
                return (
                  <div key={q.id} className="space-y-1.5">
                    <label className="text-sm font-medium">
                      {q.label} {q.required && <span className="text-destructive">*</span>}
                    </label>
                    {q.help_text && <p className="text-xs text-muted-foreground">{q.help_text}</p>}

                    {q.type === "longtext" && (
                      <Textarea rows={4} disabled={done} value={values[q.id] || ""}
                        onChange={(e) => setValues((v) => ({ ...v, [q.id]: e.target.value }))} />
                    )}
                    {(q.type === "text" || q.type === "number" || q.type === "date") && (
                      <Input type={q.type === "text" ? "text" : q.type} disabled={done} value={values[q.id] || ""}
                        onChange={(e) => setValues((v) => ({ ...v, [q.id]: e.target.value }))} />
                    )}
                    {q.type === "boolean" && (
                      <div className="flex gap-2">
                        {["Sim", "Não"].map((opt) => (
                          <Button key={opt} type="button" size="sm" disabled={done}
                            variant={values[q.id] === opt ? "default" : "outline"}
                            onClick={() => setValues((v) => ({ ...v, [q.id]: opt }))}>{opt}</Button>
                        ))}
                      </div>
                    )}
                    {q.type === "select" && (
                      <select disabled={done} value={values[q.id] || ""}
                        onChange={(e) => setValues((v) => ({ ...v, [q.id]: e.target.value }))}
                        className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                        <option value="">Selecione…</option>
                        {(q.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    )}
                    {q.type === "multiselect" && (
                      <div className="flex flex-wrap gap-2">
                        {(q.options || []).map((o) => {
                          const active = (multi[q.id] || []).includes(o);
                          return (
                            <Button key={o} type="button" size="sm" disabled={done}
                              variant={active ? "default" : "outline"}
                              onClick={() => setMulti((m) => {
                                const cur = m[q.id] || [];
                                return { ...m, [q.id]: active ? cur.filter((x) => x !== o) : [...cur, o] };
                              })}>{o}</Button>
                          );
                        })}
                      </div>
                    )}
                    {q.type === "file" && (
                      <div className="space-y-1.5">
                        {!done && (
                          <Input type="file" disabled={uploading === q.id}
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(q.id, f); e.target.value = ""; }} />
                        )}
                        {uploading === q.id && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" /> Enviando…
                          </p>
                        )}
                        {qFiles.map((f) => (
                          <p key={f.id} className="text-xs flex items-center gap-1 text-muted-foreground">
                            <Paperclip className="h-3 w-3" /> {f.file_name}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}

        {/* Free attachments */}
        <Card>
          <CardContent className="p-4 sm:p-5 space-y-2">
            <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
              <Paperclip className="h-3.5 w-3.5" /> Outros arquivos do levantamento
            </h2>
            <p className="text-xs text-muted-foreground">
              Envie planilhas, layouts, tabelas de preço, relatórios ou qualquer documento que ajude a entender os processos.
            </p>
            {!done && (
              <Input type="file" disabled={uploading === "geral"}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(null, f); e.target.value = ""; }} />
            )}
            {uploading === "geral" && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Enviando…
              </p>
            )}
            <ul className="space-y-1">
              {survey.files.filter((f) => !f.question_id).map((f) => (
                <li key={f.id} className="text-xs text-muted-foreground flex items-center gap-1">
                  <Paperclip className="h-3 w-3" /> {f.file_name}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {!done && (
          <div className="flex flex-wrap gap-2 sticky bottom-3">
            <Button variant="outline" onClick={() => save(false)} disabled={saving} className="flex-1">
              <Save className="h-4 w-4" /> Salvar rascunho
            </Button>
            <Button onClick={() => save(true)} disabled={saving} className="flex-1">
              <Send className="h-4 w-4" /> Finalizar e enviar
            </Button>
          </div>
        )}
        {done && (
          <p className="text-center text-sm text-muted-foreground">
            Recebemos suas respostas. Nossa equipe de implantação dará continuidade ao processo.
          </p>
        )}
      </main>
    </div>
  );
}
