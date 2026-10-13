import { useState } from "react";
import { format } from "date-fns";
import { Check, ChevronDown, CircleDot, Loader2, PauseCircle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { publicarStatusNoRelatorio } from "@/lib/publicarRelatorio";
import {
  SCHEDULE_STATUS_OPTIONS,
  isPausedStatus,
  payloadStatus,
  scheduleStatusLabel,
  scheduleStatusVariant,
} from "@/lib/schedule";

/* ---------------------------------------------------------------------------
   Status do cronograma, dentro dele mesmo.

   Fica ao lado do botão Pausar (que cuida de paused/waiting_client, com motivo
   e remanejamento das datas). Aqui ficam os status do dia a dia:
   Rascunho, Ativo, Em andamento, Concluído e Arquivado.

   "Concluído" e "Arquivado" pedem confirmação — e concluir oferece marcar as
   etapas ainda pendentes como concluídas, para o relatório de implantações
   fechar com o mesmo resultado da tela.
--------------------------------------------------------------------------- */

type Item = { id: string; status: string; planned_date: string | null };

type Props = {
  schedule: { id: string; status: string; workspace_id?: string | null };
  items: Item[];
  canEdit: boolean;
  onChanged: () => void;
};

export function ScheduleStatusControl({ schedule, items, canEdit, onChanged }: Props) {
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [fecharPendentes, setFecharPendentes] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const pausado = isPausedStatus(schedule.status);
  const pendentes = items.filter((i) => i.status !== "done" && i.status !== "not_applicable");
  const hoje = format(new Date(), "yyyy-MM-dd");

  const aplicar = async (novo: string, fecharEtapas: boolean) => {
    setSalvando(true);
    const patch = payloadStatus(novo, schedule.status);

    if (fecharEtapas && pendentes.length) {
      const resultados = await Promise.all(
        pendentes.map((i) =>
          supabase
            .from("schedule_items")
            .update({ status: "done", done_date: hoje })
            .eq("id", i.id),
        ),
      );
      const erroEtapas = resultados.find((r) => r.error)?.error;
      if (erroEtapas) {
        setSalvando(false);
        toast.error(`Não foi possível concluir as etapas pendentes: ${erroEtapas.message}`);
        return;
      }
    }

    const { error } = await supabase.from("implementation_schedules").update(patch as never).eq("id", schedule.id);
    setSalvando(false);
    if (error) {
      toast.error(`Não foi possível mudar o status: ${error.message}`);
      onChanged();
      return;
    }

    const rotulo = scheduleStatusLabel(novo);
    const erroRelatorio = await publicarStatusNoRelatorio(schedule.workspace_id);
    toast.success(
      novo === "completed" && fecharEtapas && pendentes.length
        ? `Cronograma concluído — ${pendentes.length} etapa(s) pendente(s) também foram marcadas como concluídas`
        : pausado
          ? `Status alterado para “${rotulo}” — a pausa foi encerrada e as datas continuam as mesmas`
          : `Status alterado para “${rotulo}”`,
    );
    if (erroRelatorio) {
      toast.warning(`O status foi salvo, mas o relatório de implantações não atualizou: ${erroRelatorio}`);
    }
    setConfirmando(null);
    onChanged();
  };

  const badge = (
    <Badge variant={scheduleStatusVariant(schedule.status)} className="gap-1.5 whitespace-nowrap">
      {pausado ? <PauseCircle className="h-3 w-3" /> : <CircleDot className="h-3 w-3" />}
      {scheduleStatusLabel(schedule.status)}
    </Badge>
  );

  if (!canEdit) {
    return <span title="Só quem pode editar o cronograma muda o status">{badge}</span>;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full border border-transparent hover:border-border px-1 py-0.5 transition-colors"
            title="Alterar o status deste cronograma"
          >
            {badge}
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>Status do cronograma</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {SCHEDULE_STATUS_OPTIONS.map((op) => {
            const atual = op.value === schedule.status;
            return (
              <DropdownMenuItem
                key={op.value}
                disabled={atual}
                onSelect={() => {
                  if (op.value === "completed" || op.value === "archived") {
                    setFecharPendentes(true);
                    setConfirmando(op.value);
                    return;
                  }
                  void aplicar(op.value, false);
                }}
                className="flex items-start gap-2"
              >
                <Check className={`h-4 w-4 mt-0.5 ${atual ? "opacity-100" : "opacity-0"}`} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {op.label}
                    {atual && <span className="font-normal text-muted-foreground"> · atual</span>}
                  </span>
                  <span className="block text-xs text-muted-foreground">{op.hint}</span>
                </span>
              </DropdownMenuItem>
            );
          })}
          {pausado && (
            <>
              <DropdownMenuSeparator />
              <div className="flex items-start gap-2 px-2 py-1.5 text-xs text-muted-foreground">
                <PauseCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  Para <strong>retomar</strong> e remanejar as datas, use o botão do aviso de pausa acima.
                </span>
              </div>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={!!confirmando} onOpenChange={(o) => !o && setConfirmando(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirmando === "completed" ? "Marcar cronograma como concluído?" : "Arquivar este cronograma?"}
            </DialogTitle>
            <DialogDescription>
              {confirmando === "completed" ? (
                <>
                  O cronograma passa a aparecer como <strong>concluído</strong> na lista e o relatório de implantações
                  publica a empresa como concluída. Você continua podendo editar e reabrir depois.
                </>
              ) : (
                <>
                  O cronograma sai do acompanhamento (aparece como <strong>arquivado</strong> na lista), sem apagar nada.
                  Dá para voltar a “Ativo” quando quiser.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {confirmando === "completed" && pendentes.length > 0 && (
            <label className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm cursor-pointer">
              <Checkbox checked={fecharPendentes} onCheckedChange={(v) => setFecharPendentes(v === true)} />
              <span>
                Marcar as {pendentes.length} etapa(s) pendente(s) como concluídas
                <span className="block text-xs text-muted-foreground">
                  A data de conclusão de cada uma fica hoje ({format(new Date(), "dd/MM/yyyy")}). Sem marcar, o progresso da
                  tela continua como está (ex.: 80%).
                </span>
              </span>
            </label>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmando(null)} disabled={salvando}>
              Cancelar
            </Button>
            <Button
              onClick={() => confirmando && aplicar(confirmando, confirmando === "completed" && fecharPendentes)}
              disabled={salvando}
            >
              {salvando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
              {confirmando === "completed" ? "Concluir cronograma" : "Arquivar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
