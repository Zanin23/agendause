import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle,
  Building2,
  CalendarPlus,
  CheckCircle2,
  ClipboardList,
  CloudDownload,
  Database,
  FileJson,
  History,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { BackButton } from "@/components/BackButton";
import { SEO } from "@/components/SEO";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePermissions } from "@/hooks/usePermissions";
import { RELATORIO_ORIGINAL } from "@/data/relatorioOriginal";
import { supabase } from "@/integrations/supabase/client";
import {
  type ArquivoEmpresas,
  type Comparacao,
  type DocumentoEmpresa,
  compararEmpresas,
  lerEmpresas,
  nomeDaEmpresa,
  perdidasParaCsv,
  prepararRestauracao,
} from "@/lib/relatorioEmpresas";

/* ---------------------------------------------------------------------------
   Empresas perdidas — o relatório antigo × o relatório de agora.

   Para que serve: quando o app trocou de banco (11/10/2026), parte da
   carteira pode ter ficado só no banco antigo (`dlnfuvhlkgnzesrnqgfd`) ou num
   backup exportado. Esta tela lê esse material, compara com a tabela
   `documentos` do banco de agora e mostra — com o botão de restaurar — quem
   ficou para trás. Quem voltar para `documentos` aparece de novo no relatório
   e na tela Implantações, e pode receber um cronograma novo da agenda.
--------------------------------------------------------------------------- */

/* O endereço antigo do relatório. A chave é pública (estava no repositório do
   site e é a mesma que o navegador de qualquer visitante usa) e serve só para
   LER `documentos` — a tabela abre para quem tem a chave, igual ao site. */
const ANTIGO_PADRAO = {
  url: "https://dlnfuvhlkgnzesrnqgfd.supabase.co",
  anonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsbmZ1dmhsa2duemVzcm5xZ2ZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1NDQ4MjcsImV4cCI6MjEwNzEyMDgyN30.ew9xsAmQcBXtsPt93dz5yPY7AXtBT3WfM67WTaVjCzo",
};

const LS_ANTIGO = "agendause.empresasPerdidas.antigo";

const STATUS_LABEL: Record<string, string> = {
  cliente: "Aguardando cliente",
  desenvolvimento: "Aguardando desenvolvimento",
  andamento: "Em andamento",
  risco: "Atenção / risco",
  concluido: "Concluído",
};

const dia = (iso?: string | null) =>
  iso ? format(parseISO(String(iso).slice(0, 10) + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR }) : "—";

type Origem = "antigo" | "original" | "arquivo";

const EmpresasPerdidas = () => {
  const { isAdmin, hasScreenPermission, loading: roleLoading } = usePermissions();

  const [atuais, setAtuais] = useState<DocumentoEmpresa[]>([]);
  const [carregandoAtuais, setCarregandoAtuais] = useState(true);
  const [erroBanco, setErroBanco] = useState<string | null>(null);

  const [origem, setOrigem] = useState<Origem>("antigo");
  const [antigo, setAntigo] = useState(ANTIGO_PADRAO);
  const [mostrarConexao, setMostrarConexao] = useState(false);
  const [texto, setTexto] = useState("");
  const [buscando, setBuscando] = useState(false);

  const [arquivo, setArquivo] = useState<ArquivoEmpresas | null>(null);
  const [comparacao, setComparacao] = useState<Comparacao | null>(null);
  const [busca, setBusca] = useState("");
  const [selecionadas, setSelecionadas] = useState<Record<string, boolean>>({});
  const [trazerCronograma, setTrazerCronograma] = useState(true);
  const [manterOrdem, setManterOrdem] = useState(false);
  const [restaurando, setRestaurando] = useState(false);
  const arquivoInput = useRef<HTMLInputElement | null>(null);

  /* ------------------------------------------------------------------ banco de agora */
  const carregarAtuais = useCallback(async () => {
    setCarregandoAtuais(true);
    const { data, error } = await supabase.from("documentos").select("id,dados,ordem");
    if (error) {
      const faltaTabela = /does not exist|schema cache|relation/i.test(error.message);
      setErroBanco(
        faltaTabela
          ? "A tabela `documentos` ainda não existe neste projeto Supabase. Rode o SQL de integração (supabase/migrations/20261012120000_integracao_relatorio_implantacoes.sql) e recarregue."
          : error.message,
      );
      setCarregandoAtuais(false);
      return;
    }
    setErroBanco(null);
    setAtuais(
      ((data || []) as { id: string; dados: Record<string, unknown> | null; ordem: number | null }[])
        .filter((l) => l.id !== "__meta__")
        .map((l) => ({
          id: l.id,
          dados: { ...(l.dados || {}), id: l.id, nome: nomeDaEmpresa(l.dados as never) },
          ordem: l.ordem ?? 0,
        })),
    );
    setCarregandoAtuais(false);
  }, []);

  useEffect(() => {
    void carregarAtuais();
    try {
      const salvo = localStorage.getItem(LS_ANTIGO);
      if (salvo) setAntigo((a) => ({ ...a, ...(JSON.parse(salvo) as typeof a) }));
    } catch {
      /* conexão salva inválida: segue no padrão */
    }
  }, [carregarAtuais]);

  const guardarAntigo = useCallback((proximo: typeof ANTIGO_PADRAO) => {
    setAntigo(proximo);
    try {
      localStorage.setItem(LS_ANTIGO, JSON.stringify(proximo));
    } catch {
      /* sem localStorage: só não memoriza */
    }
  }, []);

  /* ------------------------------------------------------------------ comparação */
  const comparar = useCallback(
    (lido: ArquivoEmpresas) => {
      setArquivo(lido);
      const resultado = compararEmpresas(lido.documentos, atuais);
      setComparacao(resultado);
      setSelecionadas(Object.fromEntries(resultado.perdidas.map((p) => [p.id, true])));
      const quantidade = resultado.perdidas.length;
      if (quantidade === 0) {
        toast.success(
          `Nenhuma empresa perdida — as ${resultado.totalArquivo} empresa(s) do arquivo existem no banco de agora.`,
        );
      } else {
        toast.warning(
          `${quantidade} empresa(s) perdida(s): de ${resultado.totalArquivo} no arquivo, ${quantidade} não estão no banco de agora.`,
        );
      }
    },
    [atuais],
  );

  const buscarNoBancoAntigo = useCallback(async () => {
    if (!antigo.url || !antigo.anonKey) return toast.error("Informe a URL e a chave do banco antigo.");
    setBuscando(true);
    setArquivo(null);
    setComparacao(null);
    try {
      const endereco =
        `${antigo.url.replace(/\/$/, "")}/rest/v1/documentos` +
        `?select=id,dados,ordem&id=neq.__meta__&order=ordem.asc`;
      const resposta = await fetch(endereco, {
        headers: { apikey: antigo.anonKey, Authorization: `Bearer ${antigo.anonKey}` },
      });
      if (!resposta.ok) {
        const corpo = await resposta.text().catch(() => "");
        throw new Error(
          resposta.status === 401 || resposta.status === 403
            ? "O banco antigo recusou a chave (401/403). Confira a chave em “Conexão” ou use o arquivo JSON exportado pelo site do relatório."
            : `O banco antigo respondeu ${resposta.status}. ${corpo.slice(0, 160)}`,
        );
      }
      const linhas = (await resposta.json()) as unknown;
      const lista = Array.isArray(linhas) ? linhas : [];
      if (!lista.length) throw new Error("O banco antigo respondeu, mas não devolveu nenhuma empresa.");
      guardarAntigo(antigo);
      comparar(lerEmpresas(JSON.stringify({ documentos: lista })));
    } catch (e) {
      toast.error(
        (e as Error).message +
          " Você também pode usar “Dados ▾ → Exportar JSON” no site do relatório e colar o arquivo aqui.",
      );
    } finally {
      setBuscando(false);
    }
  }, [antigo, comparar, guardarAntigo]);

  const lerTexto = useCallback(
    (conteudo: string) => {
      try {
        comparar(lerEmpresas(conteudo));
      } catch (e) {
        toast.error((e as Error).message);
      }
    },
    [comparar],
  );

  const escolherArquivo = (f: File | null) => {
    if (!f) return;
    const leitor = new FileReader();
    leitor.onload = () => {
      const conteudo = String(leitor.result || "");
      setTexto(conteudo.length > 200_000 ? conteudo.slice(0, 200_000) : conteudo);
      lerTexto(conteudo);
    };
    leitor.onerror = () => toast.error("Não consegui ler o arquivo.");
    leitor.readAsText(f);
  };

  /* ------------------------------------------------------------------ restauração */
  const listaPerdidas = useMemo(() => {
    if (!comparacao) return [];
    const q = busca.trim().toLowerCase();
    return q
      ? comparacao.perdidas.filter((p) => (p.dados.nome || "").toLowerCase().includes(q))
      : comparacao.perdidas;
  }, [comparacao, busca]);

  const perdidasMarcadas = useMemo(
    () => listaPerdidas.filter((p) => selecionadas[p.id]),
    [listaPerdidas, selecionadas],
  );

  const restaurar = async () => {
    if (!perdidasMarcadas.length) return toast.error("Nenhuma empresa marcada para restaurar.");
    if (
      !confirm(
        `Restaurar ${perdidasMarcadas.length} empresa(s) no banco de agora?\n\n` +
          "Nada é apagado: empresas que já existem são ignoradas.",
      )
    )
      return;
    setRestaurando(true);
    try {
      const maiorOrdem = atuais.reduce((a, l) => Math.max(a, l.ordem || 0), 0);
      const linhas = prepararRestauracao(perdidasMarcadas, {
        ordemInicial: maiorOrdem + 1,
        manterOrdemOriginal: manterOrdem,
        trazerCronograma,
      });
      const { data, error } = await supabase
        .from("documentos")
        .upsert(linhas as never, { onConflict: "id", ignoreDuplicates: true })
        .select("id");
      if (error) throw error;
      const gravadas = (data || []).length;
      toast.success(
        `${gravadas} empresa(s) restaurada(s)` +
          (gravadas < linhas.length ? ` · ${linhas.length - gravadas} já existiam e foram mantidas` : ""),
      );
      await carregarAtuais();
      // tira da lista o que foi gravado: o que sobrar é o que não entrou
      const gravados = new Set(((data as { id: string }[] | null) || []).map((d) => d.id));
      const restantes = (comparacao?.perdidas || []).filter((p) => !gravados.has(p.id));
      if (comparacao) setComparacao({ ...comparacao, perdidas: restantes });
      setSelecionadas(Object.fromEntries(restantes.map((p) => [p.id, true])));
    } catch (e) {
      toast.error("Não foi possível restaurar: " + (e as Error).message);
    } finally {
      setRestaurando(false);
    }
  };

  const baixarCsv = () => {
    const csv = perdidasParaCsv(listaPerdidas);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `empresas-perdidas-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copiarLista = async () => {
    const lista = listaPerdidas.map((p) => `- ${nomeDaEmpresa(p.dados)}`).join("\n");
    await navigator.clipboard.writeText(lista);
    toast.success("Lista copiada");
  };

  /* ------------------------------------------------------------------ acessos */
  if (roleLoading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="p-12 text-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  if (!isAdmin && !hasScreenPermission("reports")) {
    return (
      <div className="min-h-screen bg-background">
        <SEO title="Acesso restrito — TreinaCheck" description="Página restrita." path="/implantacoes/perdidas" />
        <AppHeader />
        <main className="max-w-3xl mx-auto px-4 py-20 text-center">
          <BackButton to="/implantacoes" />
          <div className="mt-6 p-8 rounded-2xl border border-border bg-card/60">
            <h1 className="text-2xl font-semibold">Acesso Restrito</h1>
            <p className="text-muted-foreground mt-2">Você não tem permissão para ver as empresas do relatório.</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Empresas perdidas — TreinaCheck"
        description="Compare o relatório antigo com o de agora e restaure as empresas que ficaram para trás."
        path="/implantacoes/perdidas"
      />
      <AppHeader />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <BackButton to="/implantacoes" />
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mt-2 flex items-center gap-2">
              <History className="h-7 w-7 text-primary" /> Empresas perdidas
            </h1>
            <p className="text-muted-foreground mt-1 text-sm sm:text-base max-w-2xl">
              Traga a carteira antiga (banco antigo do relatório ou um arquivo exportado), compare com as empresas de
              agora e restaure só as que ficaram para trás — sem mexer em quem já está aqui.
            </p>
          </div>
          <Button variant="outline" onClick={() => void carregarAtuais()} disabled={carregandoAtuais}>
            {carregandoAtuais ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Reler o banco de agora
          </Button>
        </div>

        {erroBanco && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="p-4 flex gap-3 text-sm">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Não consegui ler as empresas de agora</p>
                <p className="text-muted-foreground mt-1">{erroBanco}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ---------------- passo 1: de onde vêm as empresas ---------------- */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Passo 1</p>
                <h2 className="text-lg font-semibold">De onde vêm as empresas antigas?</h2>
              </div>
              <div className="inline-flex rounded-md border border-input bg-background p-1 text-sm">
                <button
                  type="button"
                  onClick={() => setOrigem("antigo")}
                  className={`px-3 h-8 rounded-sm transition-colors flex items-center gap-1.5 ${
                    origem === "antigo" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Database className="h-3.5 w-3.5" /> Banco antigo
                </button>
                <button
                  type="button"
                  onClick={() => setOrigem("original")}
                  className={`px-3 h-8 rounded-sm transition-colors flex items-center gap-1.5 ${
                    origem === "original" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <ClipboardList className="h-3.5 w-3.5" /> Lista original
                </button>
                <button
                  type="button"
                  onClick={() => setOrigem("arquivo")}
                  className={`px-3 h-8 rounded-sm transition-colors flex items-center gap-1.5 ${
                    origem === "arquivo" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <FileJson className="h-3.5 w-3.5" /> JSON / dados.js
                </button>
              </div>
            </div>

            {origem === "original" ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Compara com a <strong>lista original do relatório</strong> (levantamento de {RELATORIO_ORIGINAL.data},
                  {` ${RELATORIO_ORIGINAL.empresas.length} empresas`}) — o <code className="text-xs">dados.js</code> que
                  ficou no repositório do site. É o material mais antigo que temos em mãos: serve para achar rápido quem
                  existia antes e desapareceu.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => comparar(lerEmpresas(JSON.stringify(RELATORIO_ORIGINAL)))}
                    disabled={carregandoAtuais}
                  >
                    <Search className="h-4 w-4 mr-2" /> Comparar com o banco de agora
                  </Button>
                </div>
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground">
                    Ver as {RELATORIO_ORIGINAL.empresas.length} empresas dessa lista
                  </summary>
                  <div className="flex flex-wrap gap-2 pt-3">
                    {RELATORIO_ORIGINAL.empresas.map((e) => (
                      <Badge key={e.nome} variant="outline">
                        {e.nome}
                      </Badge>
                    ))}
                  </div>
                </details>
              </div>
            ) : origem === "antigo" ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Lê a tabela <code className="text-xs">documentos</code> do projeto antigo do relatório (
                  <code className="text-xs">{antigo.url.replace(/^https?:\/\//, "")}</code>) — a mesma leitura que o
                  site fazia. Nada é alterado lá.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void buscarNoBancoAntigo()} disabled={buscando || carregandoAtuais}>
                    {buscando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CloudDownload className="h-4 w-4 mr-2" />}
                    Buscar e comparar
                  </Button>
                  <Button variant="ghost" onClick={() => setMostrarConexao((v) => !v)}>
                    {mostrarConexao ? "Ocultar conexão" : "Trocar endereço/chave"}
                  </Button>
                </div>
                {mostrarConexao && (
                  <div className="grid sm:grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1.5">
                      <Label>URL do banco antigo</Label>
                      <Input value={antigo.url} onChange={(e) => guardarAntigo({ ...antigo, url: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Chave pública (anon)</Label>
                      <Input
                        value={antigo.anonKey}
                        onChange={(e) => guardarAntigo({ ...antigo, anonKey: e.target.value })}
                        className="font-mono text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Aceito o JSON exportado pelo site do relatório (<strong>Dados ▾ → Exportar JSON</strong>), o{" "}
                  <code className="text-xs">dados.js</code> do repositório, uma lista de empresas ou as linhas de{" "}
                  <code className="text-xs">documentos</code>.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => arquivoInput.current?.click()}>
                    <Upload className="h-4 w-4 mr-2" /> Escolher arquivo
                  </Button>
                  <input
                    ref={arquivoInput}
                    type="file"
                    accept=".json,.js,.txt,application/json,text/javascript,text/plain"
                    className="hidden"
                    onChange={(e) => {
                      escolherArquivo(e.target.files?.[0] ?? null);
                      e.target.value = "";
                    }}
                  />
                  <Button onClick={() => lerTexto(texto)} disabled={!texto.trim() || carregandoAtuais}>
                    <Search className="h-4 w-4 mr-2" /> Comparar com o banco de agora
                  </Button>
                  {texto && (
                    <Button variant="ghost" onClick={() => setTexto("")}>
                      <X className="h-4 w-4 mr-2" /> Limpar
                    </Button>
                  )}
                </div>
                <Textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  rows={6}
                  placeholder='Cole aqui o conteúdo do arquivo (começa com {"app":"relatorio-implantacoes"…) ou o dados.js'
                  className="font-mono text-xs"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* ---------------- passo 2: o que a comparação encontrou ---------------- */}
        {comparacao && arquivo && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "No arquivo antigo", valor: comparacao.totalArquivo, hint: arquivo.formato },
                { label: "No banco de agora", valor: comparacao.totalAtual, hint: "documentos" },
                { label: "Perdidas", valor: comparacao.perdidas.length, hint: "não estão mais aqui" },
                { label: "Novas", valor: comparacao.extras.length, hint: "criadas depois do arquivo" },
              ].map((k) => (
                <Card key={k.label}>
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">{k.label}</p>
                    <p className="text-2xl font-semibold tabular-nums mt-0.5">{k.valor}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{k.hint}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {arquivo.avisos.length > 0 && (
              <Card className="border-border/70 bg-muted/30">
                <CardContent className="p-3 text-xs text-muted-foreground space-y-1">
                  {arquivo.avisos.map((a) => (
                    <p key={a}>• {a}</p>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* ---------------- passo 3: restaurar ---------------- */}
            <Card>
              <CardContent className="p-5 space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Passo 2</p>
                    <h2 className="text-lg font-semibold">
                      {comparacao.perdidas.length === 0
                        ? "Nada perdido: a carteira de agora tem todas as empresas do arquivo"
                        : `${comparacao.perdidas.length} empresa(s) para restaurar`}
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Restaurar grava a empresa em <code className="text-xs">documentos</code> com o mesmo id do
                      relatório. Ela volta a aparecer no relatório, na tela Implantações e pode receber um cronograma da
                      agenda.
                    </p>
                  </div>
                  {comparacao.perdidas.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={baixarCsv}>
                        Baixar CSV
                      </Button>
                      <Button variant="outline" onClick={() => void copiarLista()}>
                        Copiar lista
                      </Button>
                    </div>
                  )}
                </div>

                {comparacao.perdidas.length > 0 && (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative flex-1 min-w-[200px]">
                        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={busca}
                          onChange={(e) => setBusca(e.target.value)}
                          placeholder="Buscar empresa perdida…"
                          className="pl-9"
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setSelecionadas((s) => ({ ...s, ...Object.fromEntries(listaPerdidas.map((p) => [p.id, true])) }))
                        }
                      >
                        Marcar todas
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setSelecionadas({})}>
                        Desmarcar
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        {perdidasMarcadas.length} de {listaPerdidas.length} marcada(s)
                      </span>
                    </div>

                    <div className="rounded-lg border border-border divide-y divide-border max-h-[28rem] overflow-auto">
                      {listaPerdidas.map((p) => (
                        <label key={p.id} className="flex items-start gap-3 p-3 hover:bg-muted/40 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!selecionadas[p.id]}
                            onChange={(e) => setSelecionadas((s) => ({ ...s, [p.id]: e.target.checked }))}
                            className="mt-1 h-4 w-4 shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium break-words">{nomeDaEmpresa(p.dados)}</span>
                              <Badge variant="outline">{p.dados.tipo || "Outro"}</Badge>
                              <Badge variant="secondary">
                                {STATUS_LABEL[p.dados.status || ""] || p.dados.status || "—"}
                              </Badge>
                              {p.dados.cronograma && p.dados.cronograma.length > 0 && (
                                <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                                  <ClipboardList className="h-3 w-3" /> {p.dados.cronograma.length} etapa(s) no arquivo
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {p.dados.progresso ?? 0}% · atualizado {dia(p.dados.atualizado)} ·{" "}
                              <code className="text-[10px]">{p.id}</code>
                            </p>
                            {p.dados.statusText && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.dados.statusText}</p>
                            )}
                          </div>
                          <Link
                            to={`/cronogramas/novo?cliente=${encodeURIComponent(nomeDaEmpresa(p.dados))}`}
                            className="shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button variant="ghost" size="sm" title="Criar um cronograma novo para esta empresa">
                              <CalendarPlus className="h-4 w-4 mr-1.5" /> Cronograma
                            </Button>
                          </Link>
                        </label>
                      ))}
                      {listaPerdidas.length === 0 && (
                        <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma empresa com esse nome.</p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-sm">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={trazerCronograma}
                          onChange={(e) => setTrazerCronograma(e.target.checked)}
                          className="h-4 w-4"
                        />
                        Trazer o cronograma que veio no arquivo
                      </label>
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={manterOrdem}
                          onChange={(e) => setManterOrdem(e.target.checked)}
                          className="h-4 w-4"
                        />
                        Manter a posição original na lista
                      </label>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => void restaurar()} disabled={restaurando || perdidasMarcadas.length === 0}>
                        {restaurando ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <RotateCcw className="h-4 w-4 mr-2" />
                        )}
                        Restaurar {perdidasMarcadas.length} empresa(s)
                      </Button>
                      <Button variant="outline" asChild>
                        <Link to="/implantacoes">
                          <Building2 className="h-4 w-4 mr-2" /> Ver em Implantações
                        </Link>
                      </Button>
                    </div>
                  </>
                )}

                {comparacao.perdidas.length === 0 && (
                  <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" /> Tudo o que está no arquivo existe no banco de agora.
                  </div>
                )}
              </CardContent>
            </Card>

            {comparacao.extras.length > 0 && (
              <details className="rounded-lg border border-border bg-card">
                <summary className="cursor-pointer p-4 text-sm">
                  {comparacao.extras.length} empresa(s) existem só no banco de agora (não estão no arquivo)
                </summary>
                <div className="px-4 pb-4 flex flex-wrap gap-2">
                  {comparacao.extras.map((e) => (
                    <Badge key={e.id} variant="outline">
                      {nomeDaEmpresa(e.dados)}
                    </Badge>
                  ))}
                </div>
              </details>
            )}

            {comparacao.presentes.some((p) => p.situacao !== "ok") && (
              <details className="rounded-lg border border-border bg-card">
                <summary className="cursor-pointer p-4 text-sm">
                  {comparacao.presentes.filter((p) => p.situacao !== "ok").length} empresa(s) com id ou nome diferente
                  entre o arquivo e o banco
                </summary>
                <div className="px-4 pb-4 space-y-2 text-sm">
                  {comparacao.presentes
                    .filter((p) => p.situacao !== "ok")
                    .map((p) => (
                      <p key={p.arquivo.id} className="text-muted-foreground">
                        <strong className="text-foreground">{nomeDaEmpresa(p.arquivo.dados)}</strong> — arquivo{" "}
                        <code className="text-[11px]">{p.arquivo.id}</code> · banco{" "}
                        <code className="text-[11px]">{p.atual.id}</code> ({nomeDaEmpresa(p.atual.dados)})
                        {p.situacao === "id-diferente" ? " · mesma empresa, id criado de outra forma" : ""}
                      </p>
                    ))}
                </div>
              </details>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default EmpresasPerdidas;
