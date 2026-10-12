#!/usr/bin/env node
/* ============================================================================
   empresas-perdidas.mjs — mostra (e, se você quiser, restaura) as empresas que
   existiam no relatório antigo e não existem mais no banco de agora.

   Ele NÃO grava nada por conta própria: primeiro só relata. Mesmo sem chave
   secreta — a tabela `documentos` é pública para leitura e escrita (é assim que
   o site do relatório funciona), então a anon key basta.

   Uso:

     # 1) comparar o banco antigo do relatório com o banco do TreinaCheck
     node scripts/empresas-perdidas.mjs

     # 2) comparar a partir de um arquivo exportado (Dados ▾ → Exportar JSON
     #    no site do relatório) ou do dados.js do repositório do relatório
     node scripts/empresas-perdidas.mjs --arquivo ~/Downloads/implantacoes-2026-10-12.json

     # 3) guardar a lista das perdidas em CSV para mandar para alguém
     node scripts/empresas-perdidas.mjs --csv empresas-perdidas.csv

     # 4) restaurar no banco de agora só as que faltam (id do relatório, sem
     #    sobrescrever quem já existe)
     node scripts/empresas-perdidas.mjs --aplicar

   Opções:
     --arquivo <caminho>   em vez do banco antigo, lê este arquivo
     --de <url>            URL do banco antigo (padrão dlnfuvhlkgnzesrnqgfd)
     --chave-de <chave>    chave pública (anon) do banco antigo
     --para <url>          URL do banco de agora (padrão: VITE_SUPABASE_URL do .env)
     --chave-para <chave>  chave pública (anon) do banco de agora
     --csv <caminho>       grava a lista das empresas perdidas em CSV
     --json <caminho>      grava o resultado completo em JSON
     --aplicar             grava as perdidas no banco de agora (ignore-duplicates)
     --sem-cronograma      ao restaurar, não traz o cronograma que veio no arquivo
     --manter-ordem        ao restaurar, mantém a posição original do arquivo
     --detalhado           lista também quem já existe e quem só existe no destino
     --ajuda               mostra esta ajuda
   ============================================================================ */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const temFlag = (n) => args.includes(`--${n}`);
const valorDe = (n) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null;
};

if (temFlag("ajuda") || temFlag("help")) {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("============ */")[0]);
  process.exit(0);
}

/* ---------- banco antigo do relatório (valores públicos do repositório) ---------- */
const ANTIGO_URL = "https://dlnfuvhlkgnzesrnqgfd.supabase.co";
const ANTIGO_CHAVE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsbmZ1dmhsa2duemVzcm5xZ2ZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1NDQ4MjcsImV4cCI6MjEwNzEyMDgyN30.ew9xsAmQcBXtsPt93dz5yPY7AXtBT3WfM67WTaVjCzo";

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
const ARQUIVO = valorDe("arquivo");
const CSV = valorDe("csv");
const JSON_SAIDA = valorDe("json");
const APLICAR = temFlag("aplicar");
const COM_CRONOGRAMA = !temFlag("sem-cronograma");
const MANTER_ORDEM = temFlag("manter-ordem");
const DETALHADO = temFlag("detalhado");

if (!DESTINO_URL || !DESTINO_CHAVE) {
  console.error(
    "Não encontrei o banco de agora. Informe --para https://SEU-PROJETO.supabase.co --chave-para <anon key>\n" +
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

async function lerDocumentos(url, chave) {
  const linhas = [];
  const passo = 500;
  for (let inicio = 0; ; inicio += passo) {
    const resp = await fetch(
      `${url}/rest/v1/documentos?select=id,dados,ordem&id=neq.__meta__&order=ordem.asc&limit=${passo}&offset=${inicio}`,
      { headers: cabecalhos(chave) },
    );
    if (!resp.ok) throw new Error(`GET documentos em ${url} -> ${resp.status} ${await resp.text()}`);
    const pagina = await resp.json();
    linhas.push(...pagina);
    if (pagina.length < passo) break;
  }
  return linhas;
}

async function gravarDocumentos(linhas) {
  if (!linhas.length) return 0;
  const resp = await fetch(`${DESTINO_URL}/rest/v1/documentos`, {
    method: "POST",
    headers: cabecalhos(DESTINO_CHAVE, {
      Prefer: "resolution=ignore-duplicates,return=representation",
    }),
    body: JSON.stringify(linhas),
  });
  if (!resp.ok) throw new Error(`POST documentos -> ${resp.status} ${await resp.text()}`);
  const gravadas = await resp.json();
  return Array.isArray(gravadas) ? gravadas.length : linhas.length;
}

/* ---------- leitura do arquivo (JSON exportado, dados.js, lista solta) ---------- */
function lerArquivo(caminho) {
  const absoluto = resolve(process.cwd(), caminho.replace(/^~(?=\/)/, process.env.HOME || "~"));
  const bruto = readFileSync(absoluto, "utf8");
  let obj;
  try {
    obj = JSON.parse(bruto);
  } catch {
    const i = bruto.indexOf("{");
    const j = bruto.lastIndexOf("}");
    if (i < 0 || j <= i) throw new Error("Não consegui ler o arquivo como JSON nem como dados.js.");
    obj = JSON.parse(bruto.slice(i, j + 1));
  }

  let candidatos = [];
  let meta = null;
  if (Array.isArray(obj)) candidatos = obj;
  else if (Array.isArray(obj.documentos)) candidatos = obj.documentos;
  else if (Array.isArray(obj.empresas)) {
    candidatos = obj.empresas;
    meta = { data: obj.data, geradoEm: obj.geradoEm };
  } else if (obj.dados && obj.nome) candidatos = [obj];
  else {
    const valores = Object.entries(obj).filter(([, v]) => v && typeof v === "object" && !Array.isArray(v));
    candidatos = valores.map(([k, v]) => ({ ...v, id: v.id || k }));
  }
  if (!candidatos.length) throw new Error("O arquivo não tem uma lista de empresas reconhecível.");

  const linhas = [];
  const vistos = new Set();
  candidatos.forEach((item, i) => {
    if (!item || typeof item !== "object") return;
    const ehLinha = item.dados && typeof item.dados === "object" && item.nome === undefined;
    const dados = ehLinha ? item.dados : item;
    const nome = String(dados.nome || dados.name || "").trim();
    if (!nome) return;
    const id = String((ehLinha ? item.id : dados.id) || idDeNome(nome));
    if (vistos.has(id)) return;
    vistos.add(id);
    const ordem = Number(ehLinha ? Number(item.ordem) : Number(dados.ordem ?? i));
    linhas.push({ id, dados: { ...dados, id, nome }, ordem: Number.isFinite(ordem) ? ordem : i });
  });
  return { linhas, meta, formato: meta ? "exportação do relatório / dados.js" : "lista ou tabela" };
}

/* ---------- comparação ---------- */
function comparar(origem, destino) {
  const porId = new Map(destino.map((d) => [d.id, d]));
  const porNome = new Map();
  destino.forEach((d) => {
    const k = chaveNome(d.dados?.nome);
    if (k && !porNome.has(k)) porNome.set(k, d);
  });

  const usados = new Set();
  const perdidas = [];
  const presentes = [];

  origem.forEach((linha) => {
    const mesmoId = porId.get(linha.id);
    if (mesmoId) {
      usados.add(mesmoId.id);
      presentes.push({ arquivo: linha, atual: mesmoId, situacao: chaveNome(mesmoId.dados?.nome) === chaveNome(linha.dados?.nome) ? "ok" : "nome-diferente" });
      return;
    }
    const mesmoNome = porNome.get(chaveNome(linha.dados?.nome));
    if (mesmoNome) {
      usados.add(mesmoNome.id);
      presentes.push({ arquivo: linha, atual: mesmoNome, situacao: "id-diferente" });
      return;
    }
    perdidas.push(linha);
  });

  return { perdidas, presentes, extras: destino.filter((d) => !usados.has(d.id)) };
}

/* ---------- CSV ---------- */
function paraCsv(linhas) {
  const campo = (v) => `"${String(v ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
  const cab = ["id", "nome", "tipo", "status", "progresso", "atualizado", "statusText", "cronograma(itens)"];
  const corpo = linhas.map((l) =>
    [
      l.id,
      l.dados?.nome,
      l.dados?.tipo,
      l.dados?.status,
      l.dados?.progresso ?? 0,
      l.dados?.atualizado,
      l.dados?.statusText,
      Array.isArray(l.dados?.cronograma) ? l.dados.cronograma.length : 0,
    ]
      .map(campo)
      .join(","),
  );
  return "\uFEFF" + [cab.map(campo).join(","), ...corpo].join("\n") + "\n";
}

/* ---------- principal ---------- */
(async () => {
  console.log("== Empresas perdidas: relatório antigo × banco de agora ==\n");
  console.log(`De agora: ${DESTINO_URL}`);

  const destino = await lerDocumentos(DESTINO_URL, DESTINO_CHAVE);
  let origem;
  if (ARQUIVO) {
    const lido = lerArquivo(ARQUIVO);
    origem = lido.linhas;
    console.log(`Origem   : arquivo ${ARQUIVO} (${lido.formato})`);
    if (lido.meta?.data) console.log(`           levantamento de ${lido.meta.data}`);
  } else {
    origem = await lerDocumentos(ORIGEM_URL, ORIGEM_CHAVE);
    console.log(`Origem   : banco antigo ${ORIGEM_URL}`);
  }

  const { perdidas, presentes, extras } = comparar(origem, destino);

  console.log("");
  console.log(`  empresas no arquivo/banco antigo : ${origem.length}`);
  console.log(`  empresas no banco de agora      : ${destino.length}`);
  console.log(`  PERDIDAS (no antigo, não agora) : ${perdidas.length}`);
  console.log(`  com id/nome diferente           : ${presentes.filter((p) => p.situacao !== "ok").length}`);
  console.log(`  criadas depois do arquivo       : ${extras.length}`);

  if (perdidas.length) {
    console.log("\nPerdidas:");
    perdidas
      .slice()
      .sort((a, b) => String(a.dados?.nome || "").localeCompare(String(b.dados?.nome || ""), "pt-BR"))
      .forEach((l) => {
        const itens = Array.isArray(l.dados?.cronograma) ? ` · ${l.dados.cronograma.length} etapa(s) no arquivo` : "";
        console.log(
          `  - ${String(l.dados?.nome || "Sem nome").padEnd(34, " ")} ${String(l.dados?.status || "?").padEnd(14, " ")}` +
            ` ${String(l.dados?.progresso ?? 0).padStart(3, " ")}% · ${l.id}${itens}`,
        );
      });
  } else {
    console.log("\nNenhuma empresa perdida: tudo o que está na origem existe no banco de agora. 👌");
  }

  if (DETALHADO) {
    const divergentes = presentes.filter((p) => p.situacao !== "ok");
    if (divergentes.length) {
      console.log("\nMesma empresa com id/nome diferente (não precisa restaurar):");
      divergentes.forEach((p) =>
        console.log(`  - ${p.arquivo.dados?.nome} · arquivo ${p.arquivo.id} · banco ${p.atual.id}`),
      );
    }
    if (extras.length) {
      console.log("\nExistem só no banco de agora:");
      extras.forEach((e) => console.log(`  - ${e.dados?.nome} (${e.id})`));
    }
  }

  if (CSV) {
    writeFileSync(resolve(process.cwd(), CSV), paraCsv(perdidas), "utf8");
    console.log(`\n✔ Lista das perdidas gravada em ${CSV}`);
  }
  if (JSON_SAIDA) {
    writeFileSync(
      resolve(process.cwd(), JSON_SAIDA),
      JSON.stringify(
        {
          em: new Date().toISOString(),
          origem: ARQUIVO ? `arquivo:${ARQUIVO}` : ORIGEM_URL,
          destino: DESTINO_URL,
          totais: { origem: origem.length, destino: destino.length, perdidas: perdidas.length, extras: extras.length },
          perdidas,
          divergentes: presentes.filter((p) => p.situacao !== "ok"),
          extras,
        },
        null,
        2,
      ),
      "utf8",
    );
    console.log(`✔ Resultado completo em ${JSON_SAIDA}`);
  }

  if (!APLICAR) {
    if (perdidas.length) {
      console.log(
        "\nNada foi gravado. Para trazer as perdidas para o banco de agora:\n" +
          "  node scripts/empresas-perdidas.mjs" +
          (ARQUIVO ? ` --arquivo ${ARQUIVO}` : "") +
          " --aplicar\n" +
          "\nPrefere pela interface? TreinaCheck → Implantações → “Empresas perdidas”.",
      );
    }
    return;
  }

  if (!perdidas.length) return;

  const maiorOrdem = destino.reduce((a, l) => Math.max(a, Number(l.ordem) || 0), 0);
  const linhas = perdidas.map((l, i) => {
    const dados = { ...l.dados, id: l.id, atualizado: l.dados?.atualizado || new Date().toISOString().slice(0, 10) };
    if (!COM_CRONOGRAMA) delete dados.cronograma;
    return { id: l.id, dados, ordem: MANTER_ORDEM ? l.ordem : maiorOrdem + 1 + i };
  });

  console.log(`\nGravando ${linhas.length} empresa(s) em ${DESTINO_URL} …`);
  const gravadas = await gravarDocumentos(linhas);
  console.log(`✔ ${gravadas} empresa(s) restaurada(s).`);
  console.log(
    "\nElas já aparecem na tela Implantações e no relatório. Para dar cronograma a elas:\n" +
      "  TreinaCheck → Implantações → “Criar cronograma” (ou /cronogramas/novo?cliente=NOME).",
  );
})().catch((e) => {
  console.error("\n✖ " + (e && e.message ? e.message : e));
  process.exit(1);
});
