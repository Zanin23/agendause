import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Archive,
  ArchiveRestore,
  Check,
  Loader2,
  Lock,
  PenLine,
  PencilLine,
  UserCheck,
  UserRound,
  UserRoundPlus,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  arquivarResponsavel,
  cadastrarResponsavel,
  isCadastroIndisponivel,
  listarCandidatos,
  listarResponsaveis,
  mensagemDosResponsaveis,
  renomearResponsavel,
  MIGRATION_FILE_RESPONSAVEIS,
  type CadastroResponsavel,
  type CandidatoResponsavel,
} from "@/lib/responsaveis";

const LISTA_PADRAO = ["Matheus Zanin", "Pablo Cassiano", "João Pedro", "Claudinei"];
const NOME_MAX = 80;

const iniciais = (nome: string) =>
  nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte.charAt(0).toLocaleUpperCase("pt-BR"))
    .join("");

export const ResponsaveisAtendimentosCard = () => {
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const { activeId } = useWorkspace();
  const queryClient = useQueryClient();

  const [lista, setLista] = useState<CadastroResponsavel[] | null>(null);
  const [candidatos, setCandidatos] = useState<CandidatoResponsavel[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [migracaoPendente, setMigracaoPendente] = useState(false);

  const [modo, setModo] = useState<"usuario" | "nome">("usuario");
  const [profileId, setProfileId] = useState("");
  const [nomeLivre, setNomeLivre] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [renomeando, setRenomeando] = useState<CadastroResponsavel | null>(null);
  const [nomeEdicao, setNomeEdicao] = useState("");
  const [salvandoRenome, setSalvandoRenome] = useState(false);

  const [arquivando, setArquivando] = useState<CadastroResponsavel | null>(null);
  const [salvandoArquivo, setSalvandoArquivo] = useState(false);

  const carregar = useCallback(async () => {
    if (!isAdmin) return;
    setCarregando(true);
    setErro(null);
    try {
      const [pessoas, candidatas] = await Promise.all([listarResponsaveis(), listarCandidatos()]);
      setLista(pessoas ?? []);
      setCandidatos(candidatas ?? []);
      setMigracaoPendente(false);
    } catch (e) {
      setLista(null);
      setMigracaoPendente(isCadastroIndisponivel(e));
      setErro(mensagemDosResponsaveis(e));
    } finally {
      setCarregando(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void carregar();
  }, [carregar, activeId]);

  const atualizarAposMutacao = async () => {
    await carregar();
    await queryClient.invalidateQueries({ queryKey: ["training-responsibles"] });
  };

  const adicionar = async (event: FormEvent) => {
    event.preventDefault();
    if (salvando) return;
    const nome = nomeLivre.trim();
    if (modo === "usuario" && !profileId) {
      toast.error("Selecione um usuário da base para vincular.");
      return;
    }
    if (modo === "nome" && nome.length < 2) {
      toast.error("Informe um nome com pelo menos 2 caracteres.");
      return;
    }
    setSalvando(true);
    try {
      await cadastrarResponsavel(
        modo === "usuario" ? { profileId } : { displayName: nome },
      );
      toast.success("Responsável cadastrado! Já aparece nos novos agendamentos.");
      setProfileId("");
      setNomeLivre("");
      await atualizarAposMutacao();
    } catch (e) {
      toast.error(mensagemDosResponsaveis(e));
    } finally {
      setSalvando(false);
    }
  };

  const abrirRenomeacao = (pessoa: CadastroResponsavel) => {
    setRenomeando(pessoa);
    setNomeEdicao(pessoa.display_name);
  };

  const salvarRenomeacao = async () => {
    if (!renomeando || salvandoRenome) return;
    const nome = nomeEdicao.trim();
    if (nome.length < 2) {
      toast.error("Informe um nome com pelo menos 2 caracteres.");
      return;
    }
    setSalvandoRenome(true);
    try {
      await renomearResponsavel(renomeando.id, nome);
      toast.success("Nome atualizado.");
      setRenomeando(null);
      await atualizarAposMutacao();
    } catch (e) {
      toast.error(mensagemDosResponsaveis(e));
    } finally {
      setSalvandoRenome(false);
    }
  };

  const confirmarArquivamento = async () => {
    if (!arquivando || salvandoArquivo) return;
    setSalvandoArquivo(true);
    try {
      await arquivarResponsavel(arquivando.id, true);
      toast.success(`${arquivando.display_name} foi arquivada(o) e não aparece mais em novos agendamentos.`);
      setArquivando(null);
      await atualizarAposMutacao();
    } catch (e) {
      toast.error(mensagemDosResponsaveis(e));
    } finally {
      setSalvandoArquivo(false);
    }
  };

  const restaurar = async (pessoa: CadastroResponsavel) => {
    try {
      await arquivarResponsavel(pessoa.id, false);
      toast.success(`${pessoa.display_name} restaurada(o). Já aparece de novo nos agendamentos.`);
      await atualizarAposMutacao();
    } catch (e) {
      toast.error(mensagemDosResponsaveis(e));
    }
  };

  const ativos = (lista ?? []).filter((pessoa) => !pessoa.archived);
  const arquivados = (lista ?? []).filter((pessoa) => pessoa.archived);
  const podeEnviar = modo === "usuario" ? Boolean(profileId) : nomeLivre.trim().length >= 2;

  return (
    <section className="rounded-2xl border border-border bg-card/60 p-6">
      <header className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <UserCheck className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Responsáveis pelos atendimentos</h2>
          <p className="text-sm text-muted-foreground">
            Quem pode ser atribuído como responsável nos agendamentos de treinamentos e visitas desta base.
          </p>
        </div>
      </header>

      {/* Lista padrão do sistema — sempre disponível */}
      <div className="rounded-xl border border-border/70 bg-background/50 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Lista padrão do sistema — sempre disponível
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {LISTA_PADRAO.map((nome) => (
            <Badge key={nome} variant="secondary" className="text-xs font-medium">
              {nome}
            </Badge>
          ))}
        </div>
      </div>

      {adminLoading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Verificando permissões…
        </div>
      ) : !isAdmin ? (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-border/70 bg-background/50 p-4 text-sm text-muted-foreground">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            A lista acima é o que a equipe pode escolher ao agendar. Só <strong>administradores</strong> podem
            acrescentar, renomear ou arquivar responsáveis.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {erro && (
            <div
              role="alert"
              className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-foreground"
            >
              <p className="font-medium text-destructive">Não foi possível carregar o cadastro.</p>
              <p className="mt-1">{erro}</p>
              {migracaoPendente && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Detalhe técnico para o administrador do banco: <code className="font-mono">{MIGRATION_FILE_RESPONSAVEIS}</code>
                </p>
              )}
              <Button variant="ghost" size="sm" className="mt-3 h-8" onClick={() => void carregar()} disabled={carregando}>
                {carregando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Tentar de novo
              </Button>
            </div>
          )}

          {/* Cadastro ativo */}
          {lista && (
            <>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Cadastrados nesta base ({ativos.length})
                  </p>
                  {carregando && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                </div>

                {ativos.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                    Ninguém cadastrado ainda — só a lista padrão aparece nos agendamentos. Acrescente pessoas
                    abaixo.
                  </p>
                ) : (
                  <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-background/50">
                    {ativos.map((pessoa) => (
                      <li key={pessoa.id} className="flex items-center gap-3 px-3 py-2.5">
                        <span
                          aria-hidden="true"
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary"
                        >
                          {iniciais(pessoa.display_name)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{pessoa.display_name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {pessoa.profile_id ? pessoa.email ?? "Usuário da base" : "Nome livre · sem acesso ao sistema"}
                          </span>
                        </span>
                        <Badge variant="outline" className="hidden shrink-0 text-[10px] sm:inline-flex">
                          {pessoa.profile_id ? "Usuário" : "Nome livre"}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          aria-label={`Renomear ${pessoa.display_name}`}
                          title="Renomear"
                          onClick={() => abrirRenomeacao(pessoa)}
                        >
                          <PencilLine className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                          aria-label={`Arquivar ${pessoa.display_name}`}
                          title="Arquivar"
                          onClick={() => setArquivando(pessoa)}
                        >
                          <Archive className="h-4 w-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Arquivados */}
              {arquivados.length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Arquivados ({arquivados.length})
                  </p>
                  <ul className="divide-y divide-border overflow-hidden rounded-xl border border-dashed border-border/80">
                    {arquivados.map((pessoa) => (
                      <li key={pessoa.id} className="flex items-center gap-3 px-3 py-2 opacity-70">
                        <span
                          aria-hidden="true"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground"
                        >
                          {iniciais(pessoa.display_name)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{pessoa.display_name}</span>
                          <span className="block text-[11px] text-muted-foreground">Não aparece em novos agendamentos</span>
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 shrink-0"
                          onClick={() => void restaurar(pessoa)}
                        >
                          <ArchiveRestore className="mr-1.5 h-4 w-4" /> Restaurar
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Adicionar */}
              <form onSubmit={adicionar} className="rounded-xl border border-border bg-background/50 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Acrescentar responsável
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setModo("usuario")}
                    aria-pressed={modo === "usuario"}
                    className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                      modo === "usuario"
                        ? "border-primary/60 bg-primary/[0.08] text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <UserRound className="h-4 w-4" /> Usuário da base
                  </button>
                  <button
                    type="button"
                    onClick={() => setModo("nome")}
                    aria-pressed={modo === "nome"}
                    className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                      modo === "nome"
                        ? "border-primary/60 bg-primary/[0.08] text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <PenLine className="h-4 w-4" /> Nome livre
                  </button>
                </div>

                {modo === "usuario" ? (
                  <div className="mt-3 space-y-2">
                    <Label htmlFor="responsavel-candidato" className="text-xs">
                      Usuário com acesso a esta base
                    </Label>
                    {candidatos.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                        Todos os usuários desta base já estão na lista (padrão ou cadastro). Use a opção
                        “Nome livre” para alguém de fora.
                      </p>
                    ) : (
                      <select
                        id="responsavel-candidato"
                        value={profileId}
                        onChange={(event) => setProfileId(event.target.value)}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="">Selecione um usuário…</option>
                        {candidatos.map((candidato) => (
                          <option key={candidato.user_id} value={candidato.user_id}>
                            {candidato.full_name ?? candidato.email}
                            {candidato.email ? ` · ${candidato.email}` : ""}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    <Label htmlFor="responsavel-nome-livre" className="text-xs">
                      Nome exibido (sem criar acesso ao sistema)
                    </Label>
                    <Input
                      id="responsavel-nome-livre"
                      value={nomeLivre}
                      onChange={(event) => setNomeLivre(event.target.value)}
                      placeholder="Ex.: Maria da Recepção"
                      maxLength={NOME_MAX}
                      autoComplete="off"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Ideal para parceiros ou terceiros que atendem junto, mas nunca entram no sistema.
                    </p>
                  </div>
                )}

                <div className="mt-3 flex justify-end">
                  <Button type="submit" size="sm" disabled={!podeEnviar || salvando}>
                    {salvando ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <UserRoundPlus className="mr-2 h-4 w-4" />
                    )}
                    {salvando ? "Salvando…" : "Adicionar à lista"}
                  </Button>
                </div>
              </form>
            </>
          )}
        </div>
      )}

      <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        A lista padrão não pode ser removida. Ao arquivar alguém, o nome continua visível no histórico dos
        agendamentos e a pessoa pode ser restaurada quando quiser.
      </p>

      {/* Diálogo de renomeação */}
      <Dialog open={Boolean(renomeando)} onOpenChange={(open) => !open && setRenomeando(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Renomear responsável</DialogTitle>
            <DialogDescription>
              O novo nome passa a valer nos agendamentos novos e no histórico.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="responsavel-renomear">Nome exibido</Label>
            <Input
              id="responsavel-renomear"
              value={nomeEdicao}
              onChange={(event) => setNomeEdicao(event.target.value)}
              maxLength={NOME_MAX}
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void salvarRenomeacao();
                }
              }}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setRenomeando(null)} disabled={salvandoRenome}>
              Cancelar
            </Button>
            <Button onClick={() => void salvarRenomeacao()} disabled={salvandoRenome || nomeEdicao.trim().length < 2}>
              {salvandoRenome ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              Salvar nome
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de arquivamento */}
      <Dialog open={Boolean(arquivando)} onOpenChange={(open) => !open && setArquivando(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Arquivar {arquivando?.display_name}?</DialogTitle>
            <DialogDescription>
              A pessoa deixa de ser oferecida em novos agendamentos. Nada é apagado: o nome continua no
              histórico dos atendimentos e você pode restaurar a qualquer momento.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setArquivando(null)} disabled={salvandoArquivo}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => void confirmarArquivamento()} disabled={salvandoArquivo}>
              {salvandoArquivo ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Archive className="mr-2 h-4 w-4" />
              )}
              Arquivar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default ResponsaveisAtendimentosCard;
