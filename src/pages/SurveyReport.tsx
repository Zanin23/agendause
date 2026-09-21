import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Download, FileText, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Survey = {
  id: string;
  schedule_id: string;
  title: string;
  intro: string | null;
  respondent_name: string | null;
  respondent_email: string | null;
  submitted_at: string | null;
};

type Question = {
  id: string;
  section: string | null;
  position: number;
  label: string;
};

type Answer = { question_id: string; value: string | null; value_json: unknown };
type SurveyFile = { id: string; question_id: string | null; file_name: string; file_path: string };

export default function SurveyReport() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [clientName, setClientName] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [files, setFiles] = useState<SurveyFile[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    const { data: surveyData, error } = await supabase
      .from("process_surveys")
      .select("id, schedule_id, title, intro, respondent_name, respondent_email, submitted_at")
      .eq("id", id)
      .maybeSingle();
    if (error || !surveyData) {
      toast.error(error?.message || "Relatório não encontrado");
      setLoading(false);
      return;
    }

    const [scheduleResult, questionResult, answerResult, fileResult] = await Promise.all([
      supabase.from("schedules").select("client_name").eq("id", surveyData.schedule_id).maybeSingle(),
      supabase.from("survey_questions").select("id, section, position, label").eq("survey_id", id).order("position"),
      supabase.from("survey_answers").select("question_id, value, value_json").eq("survey_id", id),
      supabase.from("survey_files").select("id, question_id, file_name, file_path").eq("survey_id", id).order("created_at"),
    ]);

    setSurvey(surveyData as Survey);
    setClientName(scheduleResult.data?.client_name || "Cliente");
    setQuestions((questionResult.data as Question[]) || []);
    const answerMap: Record<string, Answer> = {};
    ((answerResult.data as Answer[]) || []).forEach((answer) => { answerMap[answer.question_id] = answer; });
    setAnswers(answerMap);
    setFiles((fileResult.data as SurveyFile[]) || []);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const sections = useMemo(() => {
    const names: string[] = [];
    questions.forEach((question) => {
      const section = question.section || "Geral";
      if (!names.includes(section)) names.push(section);
    });
    return names.map((name) => ({ name, questions: questions.filter((question) => (question.section || "Geral") === name) }));
  }, [questions]);

  const answerText = (questionId: string) => {
    const answer = answers[questionId];
    if (!answer) return "Não respondida";
    if (Array.isArray(answer.value_json)) return answer.value_json.length ? answer.value_json.join(", ") : "Não respondida";
    return answer.value?.trim() || "Não respondida";
  };

  const openFile = async (file: SurveyFile) => {
    const { data, error } = await supabase.storage.from("survey-files").createSignedUrl(file.file_path, 300);
    if (error || !data) return toast.error(error?.message || "Não foi possível abrir o arquivo");
    window.open(data.signedUrl, "_blank");
  };

  if (loading) return <div className="min-h-screen grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!survey) return <div className="min-h-screen grid place-items-center text-muted-foreground">Relatório não encontrado.</div>;

  return (
    <div className="min-h-screen bg-background text-foreground print:bg-card">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 print:max-w-none print:p-0">
        <div className="mb-5 flex items-center justify-between gap-3 print:hidden">
          <Button variant="outline" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /> Voltar</Button>
          <Button onClick={() => window.print()}><Printer className="h-4 w-4" /> Imprimir / salvar PDF</Button>
        </div>

        <article className="rounded-md border border-border bg-card p-5 shadow-sm sm:p-8 print:border-0 print:shadow-none">
          <header className="border-b-2 border-primary pb-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase text-primary">Relatório de levantamento</p>
                <h1 className="mt-1 text-2xl font-bold">{survey.title}</h1>
                <p className="mt-1 text-lg text-muted-foreground">{clientName}</p>
              </div>
              {survey.submitted_at && <Badge className="gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Finalizado</Badge>}
            </div>
            <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
              <div><dt className="text-xs text-muted-foreground">Responsável</dt><dd className="font-semibold">{survey.respondent_name || "Não informado"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">E-mail</dt><dd className="font-semibold">{survey.respondent_email || "Não informado"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Finalizado em</dt><dd className="font-semibold">{survey.submitted_at ? format(new Date(survey.submitted_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : "Ainda não finalizado"}</dd></div>
            </dl>
          </header>

          <div className="mt-6 space-y-8">
            {sections.map((section, sectionIndex) => (
              <section key={section.name} className="break-inside-avoid-page">
                <div className="mb-3 flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded bg-primary text-xs font-bold text-primary-foreground">{sectionIndex + 1}</span>
                  <h2 className="text-lg font-bold">{section.name}</h2>
                </div>
                <div className="divide-y divide-border rounded-md border border-border">
                  {section.questions.map((question) => {
                    const questionFiles = files.filter((file) => file.question_id === question.id);
                    const response = answerText(question.id);
                    return (
                      <div key={question.id} className="break-inside-avoid p-4">
                        <p className="text-sm font-semibold">{questions.findIndex((item) => item.id === question.id) + 1}. {question.label}</p>
                        <p className={`mt-2 whitespace-pre-wrap text-sm ${response === "Não respondida" ? "italic text-muted-foreground" : "font-medium"}`}>{response}</p>
                        {questionFiles.map((file) => (
                          <Button key={file.id} type="button" variant="link" size="sm" onClick={() => openFile(file)} className="mt-1 h-auto p-0 text-xs print:hidden">
                            <Download className="h-3 w-3" /> {file.file_name}
                          </Button>
                        ))}
                        {questionFiles.map((file) => <p key={`${file.id}-print`} className="mt-1 hidden text-xs text-muted-foreground print:block">Arquivo: {file.file_name}</p>)}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}

            {files.some((file) => !file.question_id) && (
              <section className="break-inside-avoid">
                <h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><FileText className="h-5 w-5 text-primary" /> Arquivos adicionais</h2>
                <div className="rounded-md border border-border p-4">
                  {files.filter((file) => !file.question_id).map((file) => (
                    <div key={file.id} className="flex items-center justify-between gap-2 py-1">
                      <span className="text-sm">{file.file_name}</span>
                      <Button type="button" variant="ghost" size="sm" onClick={() => openFile(file)} className="print:hidden"><Download className="h-4 w-4" /> Abrir</Button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </article>
      </div>
    </div>
  );
}