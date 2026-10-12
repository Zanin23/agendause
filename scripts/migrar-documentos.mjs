#!/usr/bin/env node
/* ============================================================================
   migrar-documentos.mjs — leva as empresas do relatório antigo para o projeto
   Supabase do TreinaCheck (o banco único da integração).

   Rode UMA VEZ, do seu computador, depois de publicar a migração
   `20261012120000_integracao_relatorio_implantacoes.sql` no projeto novo.

   Uso (sem precisar de chave secreta: as duas chaves são públicas):

     # 1) lendo direto do projeto antigo do relatório (dlnfuvhlkgnzesrnqgfd)
     node scripts/migrar-documentos.mjs

     # 2) a partir do "⬇︎ Exportar JSON" do site do relatório (funciona offline)
     node scripts/migrar-documentos.mjs --arquivo ~/Downloads/implantacoes-2026-10-12.json

     # conferindo antes de gravar
     node scripts/migrar-documentos.mjs --dry-run

     # sobrescrevendo as empresas que já existirem no destino
     node scripts/migrar-documentos.mjs --substituir

   Destino padrão: VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY do arquivo
   .env deste repositório (o mesmo projeto do TreinaCheck).
   ============================================================================ */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/* ---------- projeto antigo do relatório (valores públicos do repositório) ---------- */
const ANTIGO_URL = "https://dlnfuvhlkgnzesrnqgfd.supabase.co";
const ANTIGO_CHAVE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsbmZ1dmhsa2duemVzcm5xZ2ZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1NDQ4MjcsImV4cCI6MjEwNzEyMDgyN30.ew9xsAmQcBXtsPt93dz5yPY7AXtBT3WfM67WTaVjCzo";

/* ---------- argumentos ---------- */
const args = process.argv.slice(2);
const temFlag = (n) => args.includes(`--${n}`);
const valorDe = (n) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null;
};

if (temFlag("help") || temFlag("ajuda")) {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("============ */")[0]);
  process.exit(0);
}

const SECO = temFlag("dry-run") || temFlag("seco");
const SUBSTITUIR = temFlag("substituir");
const ARQUIVO = valorDe("arquivo");

/* ---------- .env do repositório (destino padrão) ---------- */
function lerEnv() {
  const caminho = resolve(RAIZ, ".env");
  const out = {};
  if (!existsSync(caminho)) return out;
  for (const linha of readFileSync(caminho, "utf8").split("\n")) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/i);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
const env = lerEnv();

const DESTINO_URL = (valorDe("para") || env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
const DESTINO_CHAVE = valorDe("chave-para") || env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
const ORIGEM_URL = (valorDe("de") || ANTIGO_URL).replace(/\/+$/, "");
const ORIGEM_CHAVE = valorDe("chave-de") || ANTIGO_CHAVE;

if (!DESTINO_URL || !DESTINO_CHAVE) {
  console.error(
    "Não encontrei o destino. Informe --para https://SEU-PROJETO.supabase.co --chave-para <anon key>\n" +
      "ou preencha VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no .env deste repositório.",
  );
  process.exit(1);
}

/* ---------- mesmas regras de id do app do relatório (app.js) ---------- */
function chaveNome(v) {
  let s = String(v == null ? "" : v).toLowerCase();
  try {
    s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  } catch {}
  return s.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 28);
}
function idDeNome(nome) {
  const k = chaveNome(nome) || "empresa";
  const cruza = String(nome || "").trim().toLowerCase();
  let hsh = 5381;
  for (let i = 0; i < cruza.length; i++) hsh = ((hsh << 5) + hsh + cruza.charCodeAt(i)) >>> 0;
  return "n" + k + "-" + hsh.toString(36);
}

/* ---------- REST ---------- */
const cabecalhos = (chave, extra = {}) => ({
  apikey: chave,
  Authorization: `Bearer ${chave}`,
  "Content-Type": "application/json",
  ...extra,
});

async function lerPaginas(url, chave, tabela) {
  const linhas = [];
  const passo = 500;
  for (let inicio = 0; ; inicio += passo) {
    const resp = await fetch(`${url}/rest/v1/${tabela}?select=id,dados,ordem&order=ordem.asc&limit=${passo}&offset=${inicio}`, {
      headers: cabecalhos(chave, { "Range-Unit": "items", Range: `${inicio}-${inicio + passo - 1}` }),
    });
    if (!resp.ok) throw new Error(`GET ${tabela} -> ${resp.status} ${await resp.text()}`);
    const pagina = await resp.json();
    linhas.push(...pagina);
    if (pagina.length < passo) break;
  }
  return linhas;
}

async function gravar(url, chave, linhas, { substituir }) {
  if (linhas.length === 0) return 0;
  const resp = await fetch(`${url}/rest/v1/documentos`, {
    method: "POST",
    headers: cabecalhos(chave, {
      Prefer: substituir ? "resolution=merge-duplicates,return=minimal" : "resolution=ignore-duplicates,return=minimal",
    }),
    body: JSON.stringify(linhas),
  });
  if (!resp.ok) throw new Error(`POST documentos -> ${resp.status} ${await resp.text()}`);
  return linhas.length;
}

/* ---------- de onde vêm as linhas ---------- */
async function linhasDoProjetoAntigo() {
  console.log(`Lendo ${ORIGEM_URL} …`);
  const linhas = await lerPaginas(ORIGEM_URL, ORIGEM_CHAVE, "documentos");
  console.log(`  ${linhas.length} linha(s) encontrada(s) no projeto antigo.`);
  return linhas;
}

function linhasDoArquivo(caminho) {
  const conteudo = JSON.parse(readFileSync(resolve(process.cwd(), caminho.replace(/^~(?=\/)/, process.env.HOME || "~")), "utf8"));
  const empresas = conteudo.empresas || (Array.isArray(conteudo) ? conteudo : []);
  if (!empresas.length) throw new Error("O arquivo não tem a lista `empresas`.");
  const linhas = empresas.map((e, i) => ({
    id: e.id || idDeNome(e.nome || e.name || ""),
    dados: e,
    ordem: typeof e.ordem === "number" ? e.ordem : i + 1,
  }));
  if (conteudo.data || conteudo.levantamento) {
    linhas.push({ id: "__meta__", dados: { data: conteudo.data || conteudo.levantamento }, ordem: -1 });
  }
  console.log(`  ${empresas.length} empresa(s) no arquivo${conteudo.data ? ` (levantamento de ${conteudo.data})` : ""}.`);
  return linhas;
}

/* ---------- principal ---------- */
(async () => {
  console.log("== Migração do Relatório de Implantações para o banco do TreinaCheck ==\n");
  console.log(`Destino: ${DESTINO_URL}`);
  console.log(`Modo: ${SUBSTITUIR ? "substituir o que já existe" : "só criar o que ainda não existe"}${SECO ? " · DRY-RUN (nada é gravado)" : ""}\n`);

  const origem = ARQUIVO ? linhasDoArquivo(ARQUIVO) : await linhasDoProjetoAntigo();

  const existentes = new Set((await lerPaginas(DESTINO_URL, DESTINO_CHAVE, "documentos")).map((l) => l.id));
  const novos = origem.filter((l) => !existentes.has(l.id));
  const repetidos = origem.filter((l) => existentes.has(l.id));
  const paraGravar = SUBSTITUIR ? origem : novos;

  console.log(`\nJá existem no destino: ${repetidos.length} linha(s).`);
  console.log(`A gravar: ${paraGravar.length} linha(s)${SUBSTITUIR && repetidos.length ? " (inclui sobrescrita das repetidas)" : ""}.`);

  if (SECO) {
    console.log("\nDRY-RUN: nada foi gravado. Rode sem --dry-run para valer.");
    return;
  }

  const gravadas = await gravar(DESTINO_URL, DESTINO_CHAVE, paraGravar, { substituir: SUBSTITUIR });
  console.log(`\n✔ ${gravadas} linha(s) gravada(s) em ${DESTINO_URL}.`);

  if (repetidos.length && !SUBSTITUIR) {
    console.log(
      "\nAs linhas repetidas foram mantidas como estão. Se quiser que o projeto antigo mande nelas,\n" +
        "rode de novo com --substituir (isso sobrescreve o que estiver no destino).",
    );
  }

  console.log(
    "\nPróximo passo: publique a integração (SQL) se ainda não publicou e rode\n" +
      "  select public.rel_sincronizar_agenda();\n" +
      "no SQL Editor — ou simplesmente abra a tela Implantações do TreinaCheck.",
  );
})().catch((e) => {
  console.error("\n✖ " + (e && e.message ? e.message : e));
  process.exit(1);
});
