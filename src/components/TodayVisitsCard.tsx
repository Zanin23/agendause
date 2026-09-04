import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlarmClock, ArrowUpRight, Check, Clock, Link2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { publicUrl } from "@/lib/publicUrl";
import { useWorkspace } from "@/hooks/useWorkspace";
import { getVisitType } from "@/lib/visitType";

type Row = {
  id: string;
  title: string;
  client: string | null;
  scheduled_at: string;
  duration_minutes: number;
  location: string | null;
  visit_type: string;
  status: string;
  requires_acceptance: boolean;
};

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export const TodayVisitsCard = ({ className = "" }: { className?: string }) => {
  const { activeId } = useWorkspace();

  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["today-visits", activeId],
    enabled: !!activeId,
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      const { data, error } = await supabase
        .from("trainings")
        .select("id,title,client,scheduled_at,duration_minutes,location,visit_type,status,requires_acceptance")
        .gte("scheduled_at", start.toISOString())
        .lt("scheduled_at", end.toISOString())
        .order("scheduled_at");
      if (error) throw error;
      return (data as Row[]).filter((r) => r.status !== "cancelado");
    },
  });

  const visits = data ?? [];
  const now = Date.now();
  const finalize = async (id: string) => {
    setBusy(id);
    const { error } = await supabase.from("trainings").update({ status: "concluido" }).eq("id", id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Treinamento finalizado");
    refetch();
  };

  const copyAcceptLink = async (id: string) => {
    const url = publicUrl(`/aceite/${id}`);
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link de aceite copiado");
    } catch {
      toast.info(url);
    }
  };

  const next = visits.find((v) => new Date(v.scheduled_at).getTime() + v.duration_minutes * 60000 > now);

  return (
    <section
      className={`xp-tile relative rounded-3xl border border-border/70 bg-card/60 p-5 sm:p-7 ${className}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <AlarmClock className="h-5 w-5 xp-float" />
          </span>
          <div>
            <h2 className="font-black uppercase tracking-[-0.02em] text-xl sm:text-2xl leading-none">
              Lembrete de hoje
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {isLoading
                ? "Carregando visitas…"
                : visits.length === 0
                ? "Nenhuma visita marcada para hoje"
                : `${visits.length} ${visits.length === 1 ? "visita marcada" : "visitas marcadas"}`}
            </p>
          </div>
        </div>
        <Link
          to="/agenda"
          className="shrink-0 text-[10px] uppercase tracking-[0.25em] text-primary inline-flex items-center gap-1 hover:underline"
        >
          Agenda
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {visits.length > 0 && (
        <ul className="mt-5 space-y-2">
          {visits.map((v) => {
            const vt = getVisitType(v.visit_type);
            const Icon = vt.icon;
            const isNext = next?.id === v.id;
            const isDone = v.status === "concluido";
            return (
              <li
                key={v.id}
                className={`xp-rise rounded-2xl border p-3 transition-colors ${
                  isNext ? "border-primary/60 bg-primary/[0.06]" : "border-border/60 bg-background/40"
                } hover:border-primary/60`}
              >
                <Link to={`/treinamento/${v.id}`} className="group flex items-center gap-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: `${vt.color}1f`, color: vt.color }}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-sm tabular-nums text-foreground">{hhmm(v.scheduled_at)}</span>
                      {isNext && (
                        <span className="rounded-full bg-primary px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary-foreground">
                          Próxima
                        </span>
                      )}
                      {isDone && (
                        <span className="rounded-full border border-border px-2 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                          Concluída
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-sm font-semibold text-foreground">
                      {v.client ? `${v.client} · ` : ""}
                      {v.title}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {v.duration_minutes} min
                      </span>
                      {v.location && (
                        <span className="inline-flex items-center gap-1 truncate">
                          <MapPin className="h-3 w-3" />
                          {v.location}
                        </span>
                      )}
                      <span style={{ color: vt.color }}>{vt.short}</span>
                    </span>
                  </span>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:text-primary" />
                </Link>

                {(!isDone || v.requires_acceptance) && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border/50 pt-2">
                    {!isDone && (
                      <button
                        type="button"
                        disabled={busy === v.id}
                        onClick={() => finalize(v.id)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/60 px-3 py-1 text-[11px] font-semibold text-foreground transition-colors hover:border-primary/60 hover:text-primary disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Finalizar
                      </button>
                    )}
                    {v.requires_acceptance && (
                      <button
                        type="button"
                        onClick={() => copyAcceptLink(v.id)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/60 px-3 py-1 text-[11px] font-semibold text-foreground transition-colors hover:border-primary/60 hover:text-primary"
                      >
                        <Link2 className="h-3.5 w-3.5" />
                        Copiar link de aceite
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
