import { publicUrl } from "@/lib/publicUrl";
import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalIcon, Clock, MapPin, CheckCircle2, Trash2, Users, Building2, Link2, FileText, UserCheck, XCircle, RotateCcw, Lock, Pencil, Save, X, History, Paperclip, Upload, Download, File as FileIcon, Flag } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppHeader } from "@/components/AppHeader";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { VISIT_TYPES, type VisitType } from "@/lib/visitType";

type Training = {
  id: string;
  title: string;
  client: string | null;
  description: string | null;
  scheduled_at: string;
  duration_minutes: number;
  location: string | null;
  created_by: string;
  status: string;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  internal_notes: string | null;
  visit_type: string | null;
  requires_acceptance: boolean;
};

type Acceptance = {
  id: string;
  user_id: string;
  accepted_at: string;
  profiles: { full_name: string | null; email: string | null } | null;
};

type GuestAcceptance = {
  id: string;
  full_name: string;
  email: string | null;
  accepted_at: string;
};

type RescheduleRow = {
  id: string;
  previous_scheduled_at: string;
  new_scheduled_at: string;
  previous_duration_minutes: number;
  new_duration_minutes: number;
  reason: string;
  changed_by_name: string | null;
  created_at: string;
};

type AttachmentRow = {
  id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

const formatBytes = (n: number | null) => {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

const TrainingDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [training, setTraining] = useState<Training | null>(null);
  const [acceptances, setAcceptances] = useState<Acceptance[]>([]);
  const [guests, setGuests] = useState<GuestAcceptance[]>([]);
  const [reschedules, setReschedules] = useState<RescheduleRow[]>([]);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [savingDesc, setSavingDesc] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [schedDate, setSchedDate] = useState("");
  const [schedTime, setSchedTime] = useState("");
  const [schedDuration, setSchedDuration] = useState(60);
  const [schedReason, setSchedReason] = useState("");
  const [savingSched, setSavingSched] = useState(false);

  const load = async () => {
    if (!id) return;
    const { data: t } = await supabase.from("trainings").select("*").eq("id", id).maybeSingle();
    setTraining(t as Training | null);
    const { data: a } = await supabase
      .rpc("get_training_user_acceptances", { _training_id: id });
    const acceptanceRows = ((a as any[]) || [])
      .map((r) => ({
        id: r.id,
        user_id: r.user_id,
        accepted_at: r.accepted_at,
        profiles: { full_name: r.full_name, email: r.email },
      }))
      .sort((x, y) => (y.accepted_at || "").localeCompare(x.accepted_at || ""));
    setAcceptances(acceptanceRows as any);
    const { data: g } = await supabase
      .from("guest_acceptances")
      .select("id, full_name, email, accepted_at")
      .eq("training_id", id)
      .order("accepted_at", { ascending: false });
    setGuests((g as GuestAcceptance[]) || []);
    const { data: rs } = await supabase
      .from("training_reschedules")
      .select("id, previous_scheduled_at, new_scheduled_at, previous_duration_minutes, new_duration_minutes, reason, changed_by_name, created_at")
      .eq("training_id", id)
      .order("created_at", { ascending: false });
    setReschedules((rs as RescheduleRow[]) || []);
    const { data: at } = await supabase
      .from("training_attachments")
      .select("id, file_name, storage_path, mime_type, size_bytes, created_at")
      .eq("training_id", id)
      .order("created_at", { ascending: false });
    setAttachments((at as AttachmentRow[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [id]);

  const myAcceptance = acceptances.find((a) => a.user_id === user?.id);

  const accept = async () => {
    if (!user || !id) return;
    setActing(true);
    const { error } = await supabase
      .from("training_acceptances")
      .insert(({ training_id: id, user_id: user.id }) as any);
    setActing(false);
    if (error) return toast.error(error.message);
    toast.success("Recebimento confirmado!");
    load();
  };

  const removeAccept = async () => {
    if (!myAcceptance) return;
    setActing(true);
    const { error } = await supabase.from("training_acceptances").delete().eq("id", myAcceptance.id);
    setActing(false);
    if (error) return toast.error(error.message);
    toast.success("Aceite removido");
    load();
  };

  const deleteTraining = async () => {
    if (!id) return;
    if (!confirm("Excluir este treinamento?")) return;
    const { error } = await supabase.from("trainings").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Treinamento excluído");
    navigate("/");
  };

  const cancelTraining = async () => {
    if (!id) return;
    if (!cancelReason.trim()) {
      toast.error("Informe o motivo do cancelamento");
      return;
    }
    setActing(true);
    const { error } = await supabase
      .from("trainings")
      .update({
        status: "cancelado",
        cancellation_reason: cancelReason.trim(),
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", id);
    setActing(false);
    if (error) return toast.error(error.message);
    toast.success("Visita cancelada");
    setCancelOpen(false);
    setCancelReason("");
    load();
  };

  const reactivateTraining = async () => {
    if (!id) return;
    setActing(true);
    const { error } = await supabase
      .from("trainings")
      .update({ status: "agendado", cancellation_reason: null, cancelled_at: null })
      .eq("id", id);
    setActing(false);
    if (error) return toast.error(error.message);
    toast.success("Visita reativada");
    load();
  };

  const finalizeTraining = async () => {
    if (!id) return;
    setActing(true);
    const { error } = await supabase
      .from("trainings")
      .update({ status: "concluido" })
      .eq("id", id);
    setActing(false);
    if (error) return toast.error(error.message);
    toast.success("Treinamento finalizado");
    load();
  };

  const startEditNotes = () => {
    setNotesDraft(training?.internal_notes || "");
    setEditingNotes(true);
  };

  const startEditDesc = () => {
    setDescDraft(training?.description || "");
    setEditingDesc(true);
  };

  const saveDesc = async () => {
    return saveDescInner();
  };

  const saveTitle = async () => {
    if (!id) return;
    const value = titleDraft.trim();
    if (!value) return toast.error("Informe o título do treinamento");
    setSavingTitle(true);
    const { error } = await supabase
      .from("trainings")
      .update({ title: value })
      .eq("id", id);
    setSavingTitle(false);
    if (error) return toast.error(error.message);
    toast.success("Título atualizado");
    setEditingTitle(false);
    load();
  };

  const saveDescInner = async () => {
    if (!id) return;
    setSavingDesc(true);
    const { error } = await supabase
      .from("trainings")
      .update({ description: descDraft.trim() || null })
      .eq("id", id);
    setSavingDesc(false);
    if (error) return toast.error(error.message);
    toast.success("Conteúdo treinado atualizado");
    setEditingDesc(false);
    load();
  };

  const saveNotes = async () => {
    if (!id) return;
    setSavingNotes(true);
    const { error } = await supabase
      .from("trainings")
      .update({ internal_notes: notesDraft.trim() || null })
      .eq("id", id);
    setSavingNotes(false);
    if (error) return toast.error(error.message);
    toast.success("Observações salvas");
    setEditingNotes(false);
    load();
  };

  const openSchedule = () => {
    if (!training) return;
    const d = new Date(training.scheduled_at);
    setSchedDate(format(d, "yyyy-MM-dd"));
    setSchedTime(format(d, "HH:mm"));
    setSchedDuration(training.duration_minutes);
    setSchedReason("");
    setScheduleOpen(true);
  };

  const saveSchedule = async () => {
    if (!id || !training) return;
    if (!schedDate || !schedTime) {
      toast.error("Informe data e horário");
      return;
    }
    if (!schedReason.trim()) {
      toast.error("Informe o motivo do reagendamento");
      return;
    }
    const iso = new Date(`${schedDate}T${schedTime}`).toISOString();
    const newDuration = Number(schedDuration) || 60;
    const prevIso = training.scheduled_at;
    const prevDuration = training.duration_minutes;
    if (iso === prevIso && newDuration === prevDuration) {
      toast.error("Nada para alterar");
      return;
    }
    setSavingSched(true);
    const { error } = await supabase
      .from("trainings")
      .update({ scheduled_at: iso, duration_minutes: newDuration })
      .eq("id", id);
    if (error) {
      setSavingSched(false);
      return toast.error(error.message);
    }
    const { error: hErr } = await supabase.from("training_reschedules").insert(({
      training_id: id,
      previous_scheduled_at: prevIso,
      new_scheduled_at: iso,
      previous_duration_minutes: prevDuration,
      new_duration_minutes: newDuration,
      reason: schedReason.trim(),
      changed_by: user?.id ?? null,
      changed_by_name: user?.user_metadata?.full_name || user?.email || null,
    }) as any);
    setSavingSched(false);
    if (hErr) toast.error(`Reagendado, mas falhou ao salvar histórico: ${hErr.message}`);
    toast.success("Data atualizada");
    setScheduleOpen(false);
    load();
  };

  const onUploadFiles = async (files: FileList | null) => {
    if (!files || !id || !user) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 20 * 1024 * 1024) {
          toast.error(`${file.name}: maior que 20 MB`);
          continue;
        }
        const safeName = file.name.replace(/[^\w.\-]+/g, "_");
        const path = `${id}/${Date.now()}-${safeName}`;
        const { error: upErr } = await supabase.storage
          .from("training-attachments")
          .upload(path, file, { contentType: file.type || undefined });
        if (upErr) {
          toast.error(`${file.name}: ${upErr.message}`);
          continue;
        }
        const { error: insErr } = await supabase.from("training_attachments").insert(({
          training_id: id,
          file_name: file.name,
          storage_path: path,
          mime_type: file.type || null,
          size_bytes: file.size,
          uploaded_by: user.id,
        }) as any);
        if (insErr) {
          await supabase.storage.from("training-attachments").remove([path]);
          toast.error(`${file.name}: ${insErr.message}`);
        }
      }
      toast.success("Upload concluído");
      load();
    } finally {
      setUploading(false);
    }
  };

  const downloadAttachment = async (att: AttachmentRow) => {
    const { data, error } = await supabase.storage
      .from("training-attachments")
      .createSignedUrl(att.storage_path, 60 * 10, { download: att.file_name });
    if (error || !data) return toast.error(error?.message || "Falha ao gerar link");
    window.open(data.signedUrl, "_blank");
  };

  const deleteAttachment = async (att: AttachmentRow) => {
    if (!confirm(`Remover "${att.file_name}"?`)) return;
    const { error: sErr } = await supabase.storage.from("training-attachments").remove([att.storage_path]);
    if (sErr) return toast.error(sErr.message);
    const { error: dErr } = await supabase.from("training_attachments").delete().eq("id", att.id);
    if (dErr) return toast.error(dErr.message);
    toast.success("Anexo removido");
    load();
  };

  const publicLink = publicUrl(`/aceite/${id}`);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicLink);
      toast.success("Link copiado!");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const removeGuest = async (gid: string) => {
    if (!confirm("Remover este aceite?")) return;
    const { error } = await supabase.from("guest_acceptances").delete().eq("id", gid);
    if (error) return toast.error(error.message);
    toast.success("Aceite removido");
    load();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="max-w-3xl mx-auto px-6 py-16 text-center text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  if (!training) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="max-w-3xl mx-auto px-6 py-16 text-center">
          <p className="text-muted-foreground">Treinamento não encontrado.</p>
          <Button asChild variant="link"><Link to="/">Voltar</Link></Button>
        </div>
      </div>
    );
  }

  const date = new Date(training.scheduled_at);

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={`${training.title} — TreinaCheck`}
        description={`Detalhes do treinamento "${training.title}"${training.client ? ` (${training.client})` : ""}. Gerencie participantes, anexos e aceites.`}
        path={`/treinamento/${id ?? ""}`}
      />
      <AppHeader />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6 sm:space-y-8">
        <BackButton to="/agenda/imprimir" />

        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap min-w-0">
              {editingTitle ? (
                <div className="flex items-center gap-2 flex-wrap w-full">
                  <Input
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    className="text-lg font-semibold h-11 max-w-md"
                    placeholder="Título do treinamento"
                    autoFocus
                  />
                  <Button size="sm" onClick={saveTitle} disabled={savingTitle}>
                    <Save className="h-3.5 w-3.5" /> {savingTitle ? "Salvando..." : "Salvar"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditingTitle(false)} disabled={savingTitle}>
                    Cancelar
                  </Button>
                </div>
              ) : (
                <>
                  <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight break-words">{training.title}</h1>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1"
                    onClick={() => {
                      setTitleDraft(training.title);
                      setEditingTitle(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Editar título
                  </Button>
                </>
              )}
              {training.status === "cancelado" && (
                <Badge variant="destructive" className="gap-1">
                  <XCircle className="h-3 w-3" /> Cancelado
                </Badge>
              )}
              {(training.status === "concluido" || training.status === "realizado") && (
                <Badge className="gap-1 bg-blue-600 hover:bg-blue-600 text-white border-transparent">
                  <CheckCircle2 className="h-3 w-3" /> Finalizado
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
              {training.status === "cancelado" ? (
                <Button variant="ghost" size="sm" onClick={reactivateTraining} disabled={acting}>
                  <RotateCcw className="h-4 w-4" /> Reativar
                </Button>
              ) : training.status === "concluido" || training.status === "realizado" ? (
                <Button variant="ghost" size="sm" onClick={reactivateTraining} disabled={acting}>
                  <RotateCcw className="h-4 w-4" /> Reabrir
                </Button>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={finalizeTraining}
                    disabled={acting}
                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                  >
                    <Flag className="h-4 w-4" /> <span className="hidden sm:inline">Finalizar treinamento</span><span className="sm:hidden">Finalizar</span>
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setCancelOpen(true)} className="text-muted-foreground hover:text-destructive">
                    <XCircle className="h-4 w-4" /> <span className="hidden sm:inline">Cancelar visita</span><span className="sm:hidden">Cancelar</span>
                  </Button>
                </>
              )}
              <Button variant="ghost" size="sm" onClick={deleteTraining} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-4 w-4" /> Excluir
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            {training.client && (
              <span className="flex items-center gap-1.5"><Building2 className="h-4 w-4" />{training.client}</span>
            )}
            <span className="flex items-center gap-1.5"><CalIcon className="h-4 w-4" />{format(date, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}</span>
            <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" />{format(date, "HH:mm")} • {training.duration_minutes} min</span>
            {training.location && <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" />{training.location}</span>}
            <Button variant="ghost" size="sm" onClick={openSchedule} className="h-6 px-2 -my-1 text-xs">
              <Pencil className="h-3 w-3" /> Editar data
            </Button>
          </div>

          <VisitTypeSelector
            value={(training.visit_type as VisitType) ?? "presencial"}
            onChange={async (next) => {
              const prev = training.visit_type;
              setTraining({ ...training, visit_type: next });
              const { error } = await supabase.from("trainings").update({ visit_type: next } as any).eq("id", training.id);
              if (error) {
                setTraining({ ...training, visit_type: prev });
                toast.error(error.message);
              } else {
                toast.success("Tipo atualizado");
              }
            }}
          />

          <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/30 p-4">
            <div>
              <p className="text-sm font-medium">Exige aceite do cliente</p>
              <p className="text-xs text-muted-foreground">
                {training.requires_acceptance
                  ? "Este treinamento precisa de confirmação de recebimento e aparece nos relatórios de aceite."
                  : "Sem aceite: o link público fica desativado e não aparece nos relatórios de aceite."}
              </p>
            </div>
            <Button
              variant={training.requires_acceptance ? "default" : "outline"}
              size="sm"
              onClick={async () => {
                const next = !training.requires_acceptance;
                setTraining({ ...training, requires_acceptance: next });
                const { error } = await supabase
                  .from("trainings")
                  .update({ requires_acceptance: next } as any)
                  .eq("id", training.id);
                if (error) {
                  setTraining({ ...training, requires_acceptance: !next });
                  toast.error(error.message);
                } else {
                  toast.success(next ? "Aceite obrigatório" : "Aceite não necessário");
                }
              }}
            >
              {training.requires_acceptance ? "Sim" : "Não"}
            </Button>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
              <h2 className="text-sm uppercase tracking-wider text-muted-foreground">O que foi treinado</h2>
              {!editingDesc ? (
                <Button variant="ghost" size="sm" onClick={startEditDesc}>
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </Button>
              ) : (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setEditingDesc(false)} disabled={savingDesc}>
                    <X className="h-3.5 w-3.5" /> Cancelar
                  </Button>
                  <Button size="sm" onClick={saveDesc} disabled={savingDesc}>
                    <Save className="h-3.5 w-3.5" /> {savingDesc ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              )}
            </div>
            {editingDesc ? (
              <Textarea
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                rows={5}
                placeholder="Descreva os tópicos / conteúdos treinados"
              />
            ) : training.description ? (
              <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">{training.description}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">Nenhum conteúdo registrado ainda.</p>
            )}
          </div>

          {training.status === "cancelado" && training.cancellation_reason && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4">
              <h2 className="text-sm font-semibold text-destructive mb-1 flex items-center gap-2">
                <XCircle className="h-4 w-4" /> Visita cancelada
              </h2>
              {training.cancelled_at && (
                <p className="text-xs text-muted-foreground mb-2">
                  Em {format(new Date(training.cancelled_at), "d 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
              )}
              <p className="text-sm whitespace-pre-wrap">
                <span className="text-muted-foreground">Motivo: </span>
                {training.cancellation_reason}
              </p>
            </div>
          )}

          <div className="rounded-md border border-border bg-muted/40 p-4 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Lock className="h-4 w-4 text-primary" />
                Observações internas
                <span className="text-xs font-normal text-muted-foreground">(não visível ao cliente)</span>
              </h2>
              {!editingNotes ? (
                <Button variant="ghost" size="sm" onClick={startEditNotes}>
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </Button>
              ) : (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setEditingNotes(false)} disabled={savingNotes}>
                    <X className="h-3.5 w-3.5" /> Cancelar
                  </Button>
                  <Button size="sm" onClick={saveNotes} disabled={savingNotes}>
                    <Save className="h-3.5 w-3.5" /> {savingNotes ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              )}
            </div>
            {editingNotes ? (
              <Textarea
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                rows={4}
                placeholder="Anotações da equipe, lembretes, contexto do cliente..."
              />
            ) : training.internal_notes ? (
              <p className="text-sm whitespace-pre-wrap text-foreground/90">{training.internal_notes}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">Nenhuma observação interna.</p>
            )}
          </div>
        </div>

        {/* Attachments */}
        <Card>
          <CardContent className="p-6 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="font-semibold flex items-center gap-2">
                <Paperclip className="h-4 w-4" /> Anexos
                <span className="text-xs font-normal text-muted-foreground">
                  ({attachments.length})
                </span>
              </h3>
              <label>
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    onUploadFiles(e.target.files);
                    e.currentTarget.value = "";
                  }}
                  disabled={uploading}
                />
                <Button asChild size="sm" variant="outline" disabled={uploading}>
                  <span className="cursor-pointer">
                    <Upload className="h-4 w-4" /> {uploading ? "Enviando..." : "Adicionar arquivos"}
                  </span>
                </Button>
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Materiais ficam visíveis no link público de aceite. Até 20 MB por arquivo.
            </p>
            {attachments.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Nenhum anexo ainda.</p>
            ) : (
              <div className="space-y-2">
                {attachments.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-3 rounded-md border border-border p-2.5 text-sm"
                  >
                    <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{a.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatBytes(a.size_bytes)} · {format(new Date(a.created_at), "d MMM yyyy HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => downloadAttachment(a)}>
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteAttachment(a)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {training.requires_acceptance && (
        <>
        <Card className="border-primary/40">
          <CardContent className="p-6 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h3 className="font-semibold">Confirmação de recebimento</h3>
              <p className="text-sm text-muted-foreground">
                {myAcceptance
                  ? `Você confirmou em ${format(new Date(myAcceptance.accepted_at), "d MMM yyyy 'às' HH:mm", { locale: ptBR })}.`
                  : "Confirme que você recebeu este treinamento."}
              </p>
            </div>
            {myAcceptance ? (
              <Button variant="outline" onClick={removeAccept} disabled={acting}>Remover aceite</Button>
            ) : (
              <Button onClick={accept} disabled={acting}>
                <CheckCircle2 className="h-4 w-4" /> Confirmo recebimento
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 space-y-4">
            <div>
              <h3 className="font-semibold flex items-center gap-2">
                <Link2 className="h-4 w-4" /> Link público de aceite
              </h3>
              <p className="text-sm text-muted-foreground">
                Envie este link para quem precisa confirmar o recebimento sem precisar se cadastrar.
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <input
                readOnly
                value={publicLink}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 min-w-0 h-10 px-3 rounded-md border border-input bg-background text-foreground text-sm font-mono"
              />
              <Button onClick={copyLink} variant="outline">
                <Link2 className="h-4 w-4" /> Copiar
              </Button>
              <Button asChild>
                <Link to={`/treinamento/${id}/termo`}>
                  <FileText className="h-4 w-4" /> Imprimir termo
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <section>
          <h2 className="flex items-center gap-2 text-sm uppercase tracking-wider text-muted-foreground mb-3">
            <Users className="h-4 w-4" /> Quem confirmou ({acceptances.length})
          </h2>
          {acceptances.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguém confirmou ainda.</p>
          ) : (
            <div className="space-y-2">
              {acceptances.map((a) => (
                <div key={a.id} className="flex items-center justify-between text-sm border-b border-border py-2">
                  <div>
                    <p className="font-medium">{a.profiles?.full_name || a.profiles?.email || "Usuário"}</p>
                    {a.profiles?.email && <p className="text-xs text-muted-foreground">{a.profiles.email}</p>}
                  </div>
                  <Badge variant="success" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    {format(new Date(a.accepted_at), "d MMM HH:mm", { locale: ptBR })}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="flex items-center gap-2 text-sm uppercase tracking-wider text-muted-foreground mb-3">
            <UserCheck className="h-4 w-4" /> Aceites via link público ({guests.length})
          </h2>
          {guests.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum aceite recebido pelo link ainda.</p>
          ) : (
            <div className="space-y-2">
              {guests.map((g) => (
                <div key={g.id} className="flex items-center justify-between text-sm border-b border-border py-2 gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{g.full_name}</p>
                    {g.email && <p className="text-xs text-muted-foreground truncate">{g.email}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="success" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      {format(new Date(g.accepted_at), "d MMM HH:mm", { locale: ptBR })}
                    </Badge>
                    <Button variant="ghost" size="sm" onClick={() => removeGuest(g.id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        </>
        )}

        {reschedules.length > 0 && (
          <section>
            <h2 className="flex items-center gap-2 text-sm uppercase tracking-wider text-muted-foreground mb-3">
              <History className="h-4 w-4" /> Histórico de reagendamentos ({reschedules.length})
            </h2>
            <div className="space-y-2">
              {reschedules.map((r) => (
                <div key={r.id} className="rounded-md border border-border p-3 text-sm space-y-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="line-through">
                        {format(new Date(r.previous_scheduled_at), "d MMM yyyy 'às' HH:mm", { locale: ptBR })}
                        {" · "}{r.previous_duration_minutes} min
                      </span>
                      <span>→</span>
                      <span className="text-foreground font-medium">
                        {format(new Date(r.new_scheduled_at), "d MMM yyyy 'às' HH:mm", { locale: ptBR })}
                        {" · "}{r.new_duration_minutes} min
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(r.created_at), "d MMM HH:mm", { locale: ptBR })}
                      {r.changed_by_name ? ` · ${r.changed_by_name}` : ""}
                    </span>
                  </div>
                  <p className="text-foreground/90 whitespace-pre-wrap">
                    <span className="text-muted-foreground">Motivo: </span>{r.reason}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar visita</DialogTitle>
            <DialogDescription>
              Informe o motivo do cancelamento. Essa informação ficará registrada no treinamento.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Ex: cliente solicitou reagendamento..."
            rows={4}
            maxLength={500}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={acting}>
              Voltar
            </Button>
            <Button variant="destructive" onClick={cancelTraining} disabled={acting}>
              Confirmar cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar data e horário</DialogTitle>
            <DialogDescription>
              Atualize a data, horário de início e duração deste treinamento.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sched-date">Data</Label>
                <Input
                  id="sched-date"
                  type="date"
                  value={schedDate}
                  onChange={(e) => setSchedDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sched-time">Horário</Label>
                <Input
                  id="sched-time"
                  type="time"
                  value={schedTime}
                  onChange={(e) => setSchedTime(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sched-duration">Duração (minutos)</Label>
              <Input
                id="sched-duration"
                type="number"
                min={1}
                value={schedDuration}
                onChange={(e) => setSchedDuration(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sched-reason">Motivo do reagendamento *</Label>
              <Textarea
                id="sched-reason"
                value={schedReason}
                onChange={(e) => setSchedReason(e.target.value)}
                placeholder="Ex: cliente pediu para adiar..."
                rows={3}
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground">Ficará registrado no histórico.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)} disabled={savingSched}>
              Cancelar
            </Button>
            <Button onClick={saveSchedule} disabled={savingSched}>
              <Save className="h-4 w-4" /> {savingSched ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TrainingDetail;

const VisitTypeSelector = ({ value, onChange }: { value: VisitType; onChange: (v: VisitType) => void }) => {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs uppercase tracking-wider text-muted-foreground mr-1">Tipo:</span>
      {VISIT_TYPES.map((opt) => {
        const Icon = opt.icon;
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => !active && onChange(opt.id)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
              active
                ? "text-foreground"
                : "border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
            }`}
            style={
              active
                ? { borderColor: opt.color, background: `${opt.color}24`, color: opt.color }
                : undefined
            }
            aria-pressed={active}
          >
            <Icon className="h-3.5 w-3.5" />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};