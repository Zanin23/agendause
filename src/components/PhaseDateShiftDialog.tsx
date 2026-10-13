import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarClock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  descreveDeslocamento,
  planejarRemarcacao,
  type ItemRemarcavel,
  type RemarcacaoModo,
} from "@/lib/schedule";

/* ---------------------------------------------------------------------------
   Remarcar um módulo (fase) inteiro de uma vez.

   Duas formas de dizer a nova data:
     · pela data de início da fase (as etapas mantêm a distância entre si);
     · adiando/antecipando a fase em N dias.
   Etapas concluídas (e "não aplicável") ficam de fora por padrão — o histórico
   do que já aconteceu não é reescrito sem querer. Fim de semana cai na segunda.
--------------------------------------------------------------------------- */

const dBR = (iso: string) => format(new Date(iso + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR });

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fase: string;
  items: ItemRemarcavel[];
  onApplied: () => void;
};

export function PhaseDateShiftDialog({ open, onOpenChange, fase, items, onApplied }: Props) {
  const [modo, setModo] = useState<RemarcacaoModo>("inicio");
  const [novaData, setNovaData] = useState("");
  const [dias, setDias] = useState(0);
  const [incluirConcluidos, setIncluirConcluidos] = useState(false);
  const [ajustarDiaUtil, setAjustarDiaUtil] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const plano = useMemo(
    () =>
      planejarRemarcacao(items, {
        modo,
        valor: modo === "inicio" ? novaData : dias,
        incluirConcluidos,
        ajustarDiaUtil,
      }),
    [items, modo, novaData, dias, incluirConcluidos, ajustarDiaUtil],
  );

  // ao abrir, parte da data da primeira etapa da fase
  useEffect(() => {
    if (!open) return;
    setModo("inicio");
    setDias(0);
    setIncluirConcluidos(false);
    setAjustarDiaUtil(true);
    const datas = items
      .filter((i) => i.status !== "done" && i.status !== "not_applicable")
      .map((i) => (i.planned_date || "").slice(0, 10))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort();
    setNovaData(datas[0] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const aplicar = async () => {
    if (!plano.alteracoes.length) return;
    setSalvando(true);
    const resultados = await Promise.all(
      plano.alteracoes.map((a) =>
        supabase.from("schedule_items").update({ planned_date: a.para }).eq("id", a.id),
      ),
    );
    setSalvando(false);
    const erro = resultados.find((r) => r.error)?.error;
    if (erro) {
      toast.error(`Não foi possível remarcar a fase: ${erro.message}`);
      onApplied();
      return;
    }
    toast.success(
      `${plano.alteracoes.length} etapa(s) de "${fase}" ${descreveDeslocamento(plano.deslocamento)}`,
    );
    onOpenChange(false);
    onApplied();
  };

  const previa = plano.alteracoes.slice(0, 4);
  const comVisita = items.filter((i) => i.training_id).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4" /> Remarcar o módulo (fase) inteiro
          </DialogTitle>
          <DialogDescription>
            Mudam as datas <strong>previstas</strong> das etapas de “{fase}”. A distância entre elas continua a mesma e o que já
            foi concluído fica como está (a não ser que você marque a opção abaixo).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { id: "inicio", titulo: "Nova data de início", sub: "Escolho o dia da primeira etapa" },
                { id: "deslocamento", titulo: "Adiar / antecipar", sub: "Empurro a fase em N dias" },
              ] as const
            ).map((op) => (
              <button
                key={op.id}
                type="button"
                onClick={() => setModo(op.id)}
                className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                  modo === op.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"
                }`}
              >
                <div className="font-medium">{op.titulo}</div>
                <div className="text-xs text-muted-foreground mt-1">{op.sub}</div>
              </button>
            ))}
          </div>

          {modo === "inicio" ? (
            <div className="space-y-1.5">
              <Label htmlFor="fase-inicio">Primeira etapa da fase em</Label>
              <Input
                id="fase-inicio"
                type="date"
                value={novaData}
                onChange={(e) => setNovaData(e.target.value)}
                disabled={!plano.janelaAtual && items.length > 0}
              />
              {plano.janelaAtual && (
                <p className="text-xs text-muted-foreground">
                  Hoje a fase vai de {dBR(plano.janelaAtual.inicio)} a {dBR(plano.janelaAtual.fim)}.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="fase-dias">Quantos dias mover</Label>
              <div className="flex flex-wrap items-center gap-2">
                {[-7, -1, 1, 7].map((d) => (
                  <Button
                    key={d}
                    type="button"
                    size="sm"
                    variant={dias === d ? "default" : "outline"}
                    onClick={() => setDias((atual) => atual + d)}
                  >
                    {d > 0 ? `+${d}` : d} dia(s)
                  </Button>
                ))}
                <Input
                  id="fase-dias"
                  type="number"
                  className="w-24"
                  value={dias}
                  onChange={(e) => setDias(Math.trunc(Number(e.target.value) || 0))}
                />
              </div>
              <p className="text-xs text-muted-foreground">Positivo adia, negativo antecipa. Ex.: −3 antecipa três dias.</p>
            </div>
          )}

          <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3">
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <Checkbox checked={incluirConcluidos} onCheckedChange={(v) => setIncluirConcluidos(v === true)} />
              <span>
                Incluir etapas já concluídas (ou “não aplicável”)
                <span className="block text-xs text-muted-foreground">
                  Sem marcar, elas continuam com a data em que aconteceram.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <Checkbox checked={ajustarDiaUtil} onCheckedChange={(v) => setAjustarDiaUtil(v === true)} />
              <span>
                Fim de semana vai para a segunda-feira
              </span>
            </label>
          </div>

          <div className="rounded-lg border border-border p-3 text-sm space-y-1">
            {!items.length ? (
              <p className="text-muted-foreground">Esta fase ainda não tem etapas para remarcar.</p>
            ) : !plano.janelaAtual ? (
              <p className="text-muted-foreground">
                Nenhuma etapa desta fase tem data prevista (ou todas estão concluídas). Marque a opção acima ou preencha as datas
                etapa por etapa.
              </p>
            ) : plano.alteracoes.length === 0 ? (
              <p className="text-muted-foreground">
                {modo === "inicio" ? "Escolha uma data diferente da atual" : "Informe quantos dias mover"} para ver a prévia.
              </p>
            ) : (
              <>
                <p className="font-medium">
                  {plano.alteracoes.length} etapa(s) {descreveDeslocamento(plano.deslocamento)}
                  {plano.janelaNova && (
                    <>
                      {" "}· nova janela {dBR(plano.janelaNova.inicio)} → {dBR(plano.janelaNova.fim)}
                    </>
                  )}
                </p>
                <ul className="text-xs text-muted-foreground space-y-0.5">
                  {previa.map((a) => (
                    <li key={a.id}>
                      {dBR(a.de)} → <strong>{dBR(a.para)}</strong>
                    </li>
                  ))}
                  {plano.alteracoes.length > previa.length && <li>…e mais {plano.alteracoes.length - previa.length} etapa(s)</li>}
                </ul>
                {plano.ignorados > 0 && (
                  <p className="text-xs text-muted-foreground">{plano.ignorados} etapa(s) ficam fora desta mudança.</p>
                )}
                {comVisita > 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {comVisita} etapa(s) desta fase têm visita vinculada: a data prevista muda, mas a visita na agenda continua
                    no mesmo dia.
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={aplicar} disabled={salvando || plano.alteracoes.length === 0}>
            {salvando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CalendarClock className="h-4 w-4 mr-2" />}
            Aplicar nas etapas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
