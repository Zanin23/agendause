import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CheckCircle2,
  ExternalLink,
  FileSignature,
  Link2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { publicUrl } from "@/lib/publicUrl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type CancellationTerm = {
  id: string;
  public_token: string;
  document_status: string;
  signer_name: string | null;
  signer_email: string | null;
  signer_role: string | null;
  signed_at: string | null;
  created_at: string;
  schedule_name: string | null;
  schedule_item_title: string | null;
};

export const TrainingCancellationDocumentCard = ({
  trainingId,
  canCreate,
}: {
  trainingId: string;
  canCreate: boolean;
}) => {
  const [term, setTerm] = useState<CancellationTerm | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: queryError } = await supabase
      .from("training_cancellation_terms")
      .select("id, public_token, document_status, signer_name, signer_email, signer_role, signed_at, created_at, schedule_name, schedule_item_title")
      .eq("training_id", trainingId)
      .in("document_status", ["pending", "signed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (queryError) {
      setError(queryError.message);
      setTerm(null);
    } else {
      setTerm((data as CancellationTerm | null) ?? null);
    }
    setLoading(false);
  }, [trainingId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const refreshWhenReturning = () => void load();
    window.addEventListener("focus", refreshWhenReturning);
    return () => window.removeEventListener("focus", refreshWhenReturning);
  }, [load]);

  const documentUrl = useMemo(
    () => (term ? publicUrl(`/cancelamento/${term.public_token}`) : ""),
    [term],
  );

  const createDocument = async () => {
    setCreating(true);
    const { error: createError } = await supabase.rpc("create_training_cancellation_term", {
      _training_id: trainingId,
    });
    setCreating(false);
    if (createError) {
      toast.error(createError.message);
      return;
    }
    toast.success("Documento de cancelamento emitido");
    await load();
  };

  const copyLink = async () => {
    if (!documentUrl) return;
    try {
      await navigator.clipboard.writeText(documentUrl);
      toast.success("Link do documento copiado");
    } catch {
      toast.info(documentUrl);
    }
  };

  if (loading) {
    if (!canCreate) return null;
    return (
      <Card className="border-destructive/25">
        <CardContent className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando documento de cancelamento…
        </CardContent>
      </Card>
    );
  }

  if (error) {
    if (!canCreate) return null;
    return (
      <Card className="border-destructive/30">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold">Documento de cancelamento indisponível</h3>
              <p className="mt-1 break-words text-sm text-muted-foreground">{error}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
                <RefreshCw className="h-3.5 w-3.5" /> Tentar novamente
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!term) {
    if (!canCreate) return null;
    return (
      <Card className="border-destructive/30 bg-destructive/[0.03]">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <FileSignature className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-semibold">Documento de cancelamento</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Emita o termo para o cliente declarar o cancelamento e reconhecer o impacto no cronograma.
              </p>
            </div>
          </div>
          <Button onClick={createDocument} disabled={creating} className="shrink-0">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />}
            {creating ? "Emitindo…" : "Emitir documento"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const signed = term.document_status === "signed";
  const documentNumber = term.id.replace(/-/g, "").slice(0, 10).toUpperCase();

  return (
    <Card className={signed ? "border-emerald-500/40 bg-emerald-500/[0.04]" : "border-amber-500/40 bg-amber-500/[0.04]"}>
      <CardContent className="space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${signed ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}>
              {signed ? <ShieldCheck className="h-5 w-5" /> : <FileSignature className="h-5 w-5" />}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">Documento de cancelamento</h3>
                <Badge className={signed ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300"} variant="outline">
                  {signed ? <CheckCircle2 className="mr-1 h-3 w-3" /> : null}
                  {signed ? "Assinado" : "Aguardando assinatura"}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Documento nº {documentNumber} · emitido em {format(new Date(term.created_at), "d MMM yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
              {(term.schedule_name || term.schedule_item_title) && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Cronograma: {term.schedule_name ?? "Cronograma vinculado"}
                  {term.schedule_item_title ? ` · Etapa: ${term.schedule_item_title}` : ""}
                </p>
              )}
            </div>
          </div>
        </div>

        {signed ? (
          <div className="rounded-xl border border-emerald-500/20 bg-background/50 p-3 text-sm">
            <p className="font-medium text-foreground">
              Assinado por {term.signer_name}
              {term.signer_role ? ` · ${term.signer_role}` : ""}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {term.signer_email}
              {term.signed_at
                ? ` · ${format(new Date(term.signed_at), "d 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}`
                : ""}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Envie o link abaixo ao representante do cliente. Após a assinatura, o documento ficará registrado nesta visita.
          </p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            readOnly
            value={documentUrl}
            onFocus={(event) => event.currentTarget.select()}
            aria-label="Link público do documento de cancelamento"
            className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 font-mono text-xs text-foreground"
          />
          <Button variant="outline" onClick={copyLink}>
            <Link2 className="h-4 w-4" /> Copiar link
          </Button>
          <Button asChild>
            <a href={documentUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" /> {signed ? "Ver documento" : "Abrir para assinatura"}
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
