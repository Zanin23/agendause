import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  Database,
  Loader2,
  Lock,
  PencilLine,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useWorkspace, type Workspace } from "@/hooks/useWorkspace";
import {
  criarBase,
  excluirBase,
  listarBasesGerenciadas,
  mensagemDaBase,
  renomearBase,
  usoDaBase,
  type ManagedWorkspace,
  type WorkspaceUsage,
} from "@/lib/workspaceAdmin";

const NOME_MIN = 2;
const NOME_MAX = 60;

const nomeValido = (nome: string) => {
  const limpo = nome.trim();
  return limpo.length >= NOME_MIN && limpo.length <= NOME_MAX;
};

export const BasesDeDadosCard = () => {
  const { workspaces, activeId, loading, setActive, refresh } = useWorkspace();
  const { isAdmin, loading: adminLoading } = useIsAdmin();

  const [bases, setBases] = useState<ManagedWorkspace[] | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [carregandoInfo, setCarregandoInfo] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const [novaAberta, setNovaAberta] = useState(false);
  const [novaNome, setNovaNome] = useState("");
  const [novaAbrir, setNovaAbrir] = useState(true);
  const [salvandoNova, setSalvandoNova] = useState(false);

  const [renomear, setRenomear] = useState<Workspace | null>(null);
  const [nomeRenomear, setNomeRenomear] = useState("");
  const [salvandoRenomear, setSalvandoRenomear] = useState(false);

  const [excluir, setExcluir] = useState<Workspace | null>(null);
  const [uso, setUso] = useState<WorkspaceUsage | null>(null);
  const [carregandoUso, setCarregandoUso] = useState(false);
  const [confirmacao, setConfirmacao] = useState("");
  const [excluindo, setExcluindo] = useState(false);

  const carregarInfo = useCallback(async () => {
    if (!isAdmin) return;
    setCarregandoInfo(true);
    try {
      setBases(await listarBasesGerenciadas());
      setInfoError(null);
    } catch (e) {
      setBases(null);
      setInfoError(mensagemDaBase(e));
    } finally {
      setCarregandoInfo(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) void carregarInfo();
  }, [isAdmin, carregarInfo]);

  const metaDe = (id: string) => bases?.find((b) => b.id === id) ?? null;
  // Enquanto a lista de gestão não chegou, trata tudo como protegido para
  // nunca habilitar uma exclusão por engano.
  const protegida = (id: string) => (metaDe(id) ? Boolean(metaDe(id)?.is_protected) : true);

  const trocarBase = async (id: string) => {
    if (id === activeId) return;
    try {
      setPendingId(id);
      await setActive(id);
      toast.success("Base ativa alterada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao trocar base");
    } finally {
      setPendingId(null);
    }
  };

  const abrirNova = () => {
    setNovaNome("");
    setNovaAbrir(true);
    setNovaAberta(true);
  };

  const criar = async (event: React.FormEvent) => {
    event.preventDefault();
    const nome = novaNome.trim();
    if (!nomeValido(nome)) {
      toast.error(`Informe um nome de ${NOME_MIN} a ${NOME_MAX} caracteres.`);
      return;
    }
    setSalvandoNova(true);
    try {
      const [criada] = await criarBase(nome);
      await refresh();
      if (novaAbrir && criada?.id) await setActive(criada.id);
      await carregarInfo();
      setNovaAberta(false);
      setNovaNome("");
      toast.success(`Base “${criada?.name ?? nome}” criada.`);
    } catch (e) {
      toast.error(mensagemDaBase(e));
    } finally {
      setSalvandoNova(false);
    }
  };

  const abrirRenomear = (w: Workspace) => {
    setRenomear(w);
    setNomeRenomear(w.name);
  };

  const salvarRenomear = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!renomear) return;
    const nome = nomeRenomear.trim();
    if (!nomeValido(nome)) {
      toast.error(`Informe um nome de ${NOME_MIN} a ${NOME_MAX} caracteres.`);
      return;
    }
    if (nome === renomear.name) {
      setRenomear(null);
      return;
    }
    setSalvandoRenomear(true);
    try {
      await renomearBase(renomear.id, nome);
      await refresh();
      await carregarInfo();
      setRenomear(null);
      toast.success("Nome atualizado. Nenhum registro foi alterado.");
    } catch (e) {
      toast.error(mensagemDaBase(e));
    } finally {
      setSalvandoRenomear(false);
    }
  };

  const abrirExcluir = async (w: Workspace) => {
    setExcluir(w);
    setConfirmacao("");
    setUso(null);
    // Base protegida: nem chega a consultar registros — o diálogo só explica.
    if (protegida(w.id)) {
      setUso({ total: 0, tables: {}, active_users: 0 });
      setCarregandoUso(false);
      return;
    }
    setCarregandoUso(true);
    try {
      setUso(await usoDaBase(w.id));
    } catch (e) {
      toast.error(mensagemDaBase(e));
    } finally {
      setCarregandoUso(false);
    }
  };

  const fecharExcluir = () => {
    if (excluindo) return;
    setExcluir(null);
    setUso(null);
    setConfirmacao("");
  };

  const excluirDeVez = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!excluir) return;
    setExcluindo(true);
    try {
      await excluirBase(excluir.id, confirmacao.trim());
      await refresh();
      await carregarInfo();
      toast.success(`Base “${excluir.name}” excluída.`);
      setExcluir(null);
      setUso(null);
      setConfirmacao("");
    } catch (e) {
      toast.error(mensagemDaBase(e));
    } finally {
      setExcluindo(false);
    }
  };

  const gerenciamentoIndisponivel = isAdmin && Boolean(infoError);
  const semPermissaoDeGestao = !adminLoading && !isAdmin;

  const motivoBloqueio = (w: Workspace): string | null => {
    if (protegida(w.id)) {
      return "Esta base já existia antes do controle de bases e está protegida. Nenhum dado é alterado.";
    }
    if (w.id === activeId) {
      return "Esta é a sua base ativa. Troque para outra base antes de excluir.";
    }
    if (!uso) {
      return "Não foi possível conferir os registros desta base. Nada foi apagado; tente de novo.";
    }
    if (uso.active_users) {
      return "Há usuários com esta base ativa. Todos precisam trocar de base antes da exclusão.";
    }
    if (uso.total > 0) {
      return `Esta base tem ${uso.total} registro(s) e não pode ser excluída enquanto não estiver vazia. Nada foi apagado.`;
    }
    return null;
  };

  const bloqueio = excluir ? motivoBloqueio(excluir) : null;
  const podeExcluir = Boolean(excluir) && !carregandoUso && !bloqueio && confirmacao.trim() === excluir?.name;

  return (
    <section className="rounded-2xl border border-border bg-card/60 p-5 sm:p-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Bases de dados</h2>
            <p className="text-sm text-muted-foreground">
              Troque a base ativa e, se você for administrador, crie, renomeie ou exclua bases.
            </p>
          </div>
        </div>
        {isAdmin && (
          <Button onClick={abrirNova} disabled={gerenciamentoIndisponivel} className="w-full sm:w-auto">
            <Plus className="h-4 w-4" />
            Nova base
          </Button>
        )}
      </header>

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/[0.05] p-3 text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <p>
          As bases que já existiam são <strong className="text-foreground">protegidas</strong>: renomear muda
          apenas o nome de exibição e a exclusão só fica disponível para bases novas e vazias. Nenhum
          registro é apagado por essas ações.
        </p>
      </div>

      {gerenciamentoIndisponivel && (
        <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-relaxed">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
          <div>
            <p className="font-semibold text-foreground">Controle de bases ainda não ativado</p>
            <p className="mt-1 text-muted-foreground">{infoError}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="mt-4 inline-flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando bases...
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {workspaces.map((w) => {
            const ativa = w.id === activeId;
            const itemProtegido = protegida(w.id);
            const pendente = pendingId === w.id;
            return (
              <li
                key={w.id}
                className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
                  ativa ? "border-primary/60 bg-primary/[0.06]" : "border-border"
                }`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{w.name}</span>
                    {ativa && (
                      <Badge className="gap-1">
                        <Check className="h-3 w-3" /> Ativa
                      </Badge>
                    )}
                    {isAdmin && itemProtegido && (
                      <Badge variant="outline" className="gap-1 text-muted-foreground">
                        <Lock className="h-3 w-3" /> Protegida
                      </Badge>
                    )}
                    {isAdmin && !itemProtegido && (
                      <Badge variant="secondary" className="gap-1">
                        <Sparkles className="h-3 w-3" /> Criada pelo app
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Identificador interno: {w.slug}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  {!ativa && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => trocarBase(w.id)}
                      disabled={pendingId !== null}
                    >
                      {pendente ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      Usar esta base
                    </Button>
                  )}
                  {isAdmin && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => abrirRenomear(w)}
                        title="Renomear (só o nome de exibição)"
                        aria-label={`Renomear a base ${w.name}`}
                      >
                        <PencilLine className="h-4 w-4" />
                        <span className="sm:hidden">Renomear</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => abrirExcluir(w)}
                        disabled={!metaDe(w.id) || gerenciamentoIndisponivel}
                        title={
                          itemProtegido
                            ? "Base protegida: não pode ser excluída"
                            : "Excluir base (somente se estiver vazia)"
                        }
                        aria-label={`Excluir a base ${w.name}`}
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive disabled:text-muted-foreground"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sm:hidden">Excluir</span>
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {semPermissaoDeGestao && (
        <p className="mt-4 text-xs text-muted-foreground">
          Apenas administradores podem criar, renomear ou excluir bases. Você continua podendo trocar a
          base ativa acima.
        </p>
      )}

      {/* -------------------- Nova base -------------------- */}
      <Dialog
        open={novaAberta}
        onOpenChange={(aberta) => {
          if (!salvandoNova) setNovaAberta(aberta);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova base de dados</DialogTitle>
            <DialogDescription>
              A base nasce vazia. Nenhuma outra base é alterada.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={criar} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nova-base-nome">Nome da base</Label>
              <Input
                id="nova-base-nome"
                autoFocus
                value={novaNome}
                onChange={(event) => setNovaNome(event.target.value)}
                placeholder="Ex.: Filial Campinas"
                minLength={NOME_MIN}
                maxLength={NOME_MAX}
                required
              />
              <p className="text-xs text-muted-foreground">
                O identificador interno é gerado automaticamente a partir do nome.
              </p>
            </div>
            <label className="flex cursor-pointer select-none items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={novaAbrir}
                onChange={(event) => setNovaAbrir(event.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              Entrar nesta base depois de criar
            </label>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setNovaAberta(false)}
                disabled={salvandoNova}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={salvandoNova || !nomeValido(novaNome)}>
                {salvandoNova ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {salvandoNova ? "Criando..." : "Criar base"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* -------------------- Renomear -------------------- */}
      <Dialog
        open={Boolean(renomear)}
        onOpenChange={(aberta) => {
          if (!aberta && !salvandoRenomear) setRenomear(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Renomear base</DialogTitle>
            <DialogDescription>
              Só o nome de exibição muda. O identificador interno e todos os registros continuam iguais.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={salvarRenomear} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="base-nome">Novo nome</Label>
              <Input
                id="base-nome"
                autoFocus
                value={nomeRenomear}
                onChange={(event) => setNomeRenomear(event.target.value)}
                minLength={NOME_MIN}
                maxLength={NOME_MAX}
                required
              />
              {renomear && (
                <p className="text-xs text-muted-foreground">
                  Identificador interno: {renomear.slug} (não muda)
                </p>
              )}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setRenomear(null)}
                disabled={salvandoRenomear}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={salvandoRenomear || !nomeValido(nomeRenomear)}>
                {salvandoRenomear ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PencilLine className="h-4 w-4" />
                )}
                {salvandoRenomear ? "Salvando..." : "Salvar nome"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* -------------------- Excluir -------------------- */}
      <Dialog open={Boolean(excluir)} onOpenChange={(aberta) => !aberta && fecharExcluir()}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir base</DialogTitle>
            <DialogDescription>
              Esta ação é definitiva e só é permitida para bases novas, vazias e sem usuários ativos.
            </DialogDescription>
          </DialogHeader>

          {excluir && (
            <div className="space-y-4">
              <div className="rounded-xl border border-destructive/30 bg-destructive/[0.06] p-3">
                <p className="text-sm font-medium">{excluir.name}</p>
                <p className="text-xs text-muted-foreground">Identificador interno: {excluir.slug}</p>
              </div>

              {carregandoUso && (
                <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Conferindo registros desta base...
                </p>
              )}

              {!carregandoUso && bloqueio && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
                >
                  <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
                  <span>{bloqueio}</span>
                </div>
              )}

              {!carregandoUso && !bloqueio && (
                <form onSubmit={excluirDeVez} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="confirmar-exclusao">
                      Digite <strong>{excluir.name}</strong> para confirmar
                    </Label>
                    <Input
                      id="confirmar-exclusao"
                      autoFocus
                      value={confirmacao}
                      onChange={(event) => setConfirmacao(event.target.value)}
                      placeholder={excluir.name}
                      autoComplete="off"
                    />
                  </div>
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={fecharExcluir}
                      disabled={excluindo}
                    >
                      Cancelar
                    </Button>
                    <Button type="submit" variant="destructive" disabled={!podeExcluir || excluindo}>
                      {excluindo ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      {excluindo ? "Excluindo..." : "Excluir base"}
                    </Button>
                  </div>
                </form>
              )}

              {!carregandoUso && bloqueio && (
                <Button type="button" variant="outline" onClick={fecharExcluir} className="w-full">
                  Fechar
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
};
