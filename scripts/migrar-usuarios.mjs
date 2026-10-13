#!/usr/bin/env node
/* ============================================================================
   migrar-usuarios.mjs — traz as CONTAS de um projeto Supabase antigo para o
   projeto que o TreinaCheck usa hoje (o mesmo da agenda e da integração).

   Por que existe: em 11/10/2026 algumas instruções deste repositório passaram
   a mandar publicar tudo no projeto `psgekwifthuzduhpreay` — que o sistema
   NUNCA usou. O projeto oficial é o `pnaupodddxrbqbjilhft` ("Agendause"), onde
   estão as contas, os dados e o que está configurado na Vercel. Quem criou
   conta no projeto errado (ou em qualquer outro banco) não consegue entrar, e
   o login diz "e-mail ou senha não conferem". Este script recria essas contas
   no projeto oficial (sem tocar em nada no banco de origem).

   Precisa das chaves SECRETAS (service_role) dos dois projetos. Elas NUNCA vão
   para o repositório: passe por variável de ambiente ou por linha de comando.

   Uso:
     # 1) só mostrar o que seria feito (recomendado antes de tudo)
     ANTIGO_URL=https://psgekwifthuzduhpreay.supabase.co \
     ANTIGO_SERVICE_KEY=sb_secret_xxx \
     NOVO_SERVICE_KEY=eyJ...service_role... \
     node scripts/migrar-usuarios.mjs --dry-run

     # 2) aplicar e mandar o link de nova senha para cada conta trazida
     ... node scripts/migrar-usuarios.mjs --enviar-redefinicao

     # 3) garantir que a sua conta continue administradora
     ... node scripts/migrar-usuarios.mjs --admin meu@email.com

   Opções:
     --de <url>            URL do projeto de origem (padrão: psgekwifthuzduhpreay, o dos enganos)
     --chave-de <chave>    service_role do projeto antigo
     --para <url>          URL do projeto novo (padrão: VITE_SUPABASE_URL do .env)
     --chave-para <chave>  service_role do projeto novo
     --senha <texto>       senha temporária para as contas criadas
                           (padrão: senha aleatória + link de redefinição)
     --enviar-redefinicao  envia e-mail de nova senha para cada conta trazida
     --admin <emails>      lista separada por vírgula que recebe o papel admin
     --com-bases           copia também o nome e as bases (workspaces) da conta
     --dry-run             não grava nada, só relata
   ============================================================================ */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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

const tiraBarra = (u) => (u || "").replace(/\/+$/, "");

const SECO = temFlag("dry-run") || temFlag("seco");
const ENVIAR_REDEFINICAO = temFlag("enviar-redefinicao") || temFlag("enviar-redefinição");
const COM_BASES = temFlag("com-bases");
const SENHA_FIXA = valorDe("senha");
const ADMIN_EXTRA = (valorDe("admin") || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const ANTIGO_URL = tiraBarra(valorDe("de") || process.env.ANTIGO_URL || "https://psgekwifthuzduhpreay.supabase.co");
const ANTIGO_CHAVE = valorDe("chave-de") || process.env.ANTIGO_SERVICE_KEY || process.env.ANTIGO_SERVICE_ROLE_KEY || "";
const NOVO_URL = tiraBarra(valorDe("para") || process.env.NOVO_URL || process.env.SUPABASE_URL || env.VITE_SUPABASE_URL || "");
const NOVO_CHAVE = valorDe("chave-para") || process.env.NOVO_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const REDIRECT = valorDe("redirect") || "https://agendause.vercel.app/redefinir-senha";

/* ---------- utilidades ---------- */
const semSegredo = (t) => (t ? `${t.slice(0, 12)}...(${t.length} caracteres)` : "(vazio)");
const refDoProjeto = (u) => u.replace(/^https?:\/\//, "").split(".")[0];

const chamar = async (url, chave, caminho, init = {}) => {
  const r = await fetch(`${url}${caminho}`, {
    ...init,
    headers: {
      apikey: chave,
      Authorization: `Bearer ${chave}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const texto = await r.text();
  let corpo = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    corpo = texto;
  }
  return { ok: r.ok, status: r.status, corpo };
};

const listarUsuarios = async (url, chave) => {
  const todos = [];
  for (let pagina = 1; pagina <= 20; pagina += 1) {
    const { ok, corpo, status } = await chamar(url, chave, `/auth/v1/admin/users?page=${pagina}&per_page=1000`);
    if (!ok) throw new Error(`listar usuários falhou (${status}): ${JSON.stringify(corpo).slice(0, 200)}`);
    const usuarios = corpo?.users || [];
    todos.push(...usuarios);
    if (usuarios.length < 1000) break;
  }
  return todos;
};

const senhaAleatoria = () =>
  `Use${Math.random().toString(36).slice(-5)}${Math.random().toString(36).slice(-4).toUpperCase()}!${Math.floor(Math.random() * 90 + 10)}`;

const nomeDoUsuario = (u) => u.user_metadata?.full_name || u.user_metadata?.name || null;

/* ---------- execução ---------- */
const principal = async () => {
  console.log("=== Migração de contas — TreinaCheck ===");
  console.log(`origem : ${ANTIGO_URL}  (projeto ${refDoProjeto(ANTIGO_URL)})`);
  console.log(`destino: ${NOVO_URL}  (projeto ${refDoProjeto(NOVO_URL) || "(sem VITE_SUPABASE_URL no .env)"})`);
  console.log(`chave de origem : ${semSegredo(ANTIGO_CHAVE)}`);
  console.log(`chave de destino: ${semSegredo(NOVO_CHAVE)}`);
  console.log(SECO ? "modo: --dry-run (nada será gravado)\n" : "modo: gravando\n");

  if (!NOVO_URL) throw new Error("Informe o projeto novo (--para ou VITE_SUPABASE_URL no .env).");
  if (!ANTIGO_CHAVE || !NOVO_CHAVE) {
    throw new Error(
      "Faltam as chaves secretas (service_role). Elas ficam em Supabase → Project Settings → API → service_role.\n" +
        "Passe por ANTIGO_SERVICE_KEY e NOVO_SERVICE_KEY (não grave no repositório).",
    );
  }

  const [antigos, novos] = await Promise.all([listarUsuarios(ANTIGO_URL, ANTIGO_CHAVE), listarUsuarios(NOVO_URL, NOVO_CHAVE)]);
  const emailsNovos = new Set(novos.map((u) => (u.email || "").toLowerCase()).filter(Boolean));
  console.log(`contas na origem : ${antigos.length}`);
  console.log(`contas no destino: ${novos.length}`);
  console.log(`faltando         : ${antigos.filter((u) => u.email && !emailsNovos.has(u.email.toLowerCase())).length}\n`);

  let criados = 0;
  let pulados = 0;
  let emailsEnviados = 0;

  const perfil = [];
  const membros = [];

  for (const u of antigos) {
    const email = (u.email || "").toLowerCase();
    if (!email) {
      console.log(`- pulando conta sem e-mail (id ${u.id}, telefone ${u.phone || "—"})`);
      pulados += 1;
      continue;
    }
    if (emailsNovos.has(email)) {
      console.log(`= já existe: ${email}`);
      pulados += 1;
    } else {
      console.log(`+ criando: ${email}${nomeDoUsuario(u) ? `  (${nomeDoUsuario(u)})` : ""}`);
      if (!SECO) {
        const senha = SENHA_FIXA || senhaAleatoria();
        const { ok, corpo, status } = await chamar(NOVO_URL, NOVO_CHAVE, "/auth/v1/admin/users", {
          method: "POST",
          body: JSON.stringify({
            email,
            password: senha,
            email_confirm: true,
            user_metadata: { ...(u.user_metadata || {}), full_name: nomeDoUsuario(u) || undefined },
          }),
        });
        if (!ok && !/already|registered|exists/i.test(JSON.stringify(corpo))) {
          console.error(`  ! falhou (${status}): ${JSON.stringify(corpo).slice(0, 200)}`);
          pulados += 1;
          continue;
        }
        criados += 1;
      } else {
        criados += 1;
      }
    }

    perfil.push({ email, full_name: nomeDoUsuario(u) });

    if (ENVIAR_REDEFINICAO) {
      console.log(`  ~ enviando link de nova senha para ${email}`);
      if (!SECO) {
        const { ok } = await chamar(
          NOVO_URL,
          NOVO_CHAVE,
          `/auth/v1/recover?redirect_to=${encodeURIComponent(REDIRECT)}`,
          { method: "POST", body: JSON.stringify({ email, redirect_to: REDIRECT }) },
        );
        if (ok) emailsEnviados += 1;
      } else {
        emailsEnviados += 1;
      }
    }
  }

  /* nomes (profiles) — o trigger do banco já cria a linha; aqui só completamos */
  if (!SECO && perfil.length) {
    const usuariosNovos = await listarUsuarios(NOVO_URL, NOVO_CHAVE);
    const idPorEmail = new Map(usuariosNovos.map((u) => [(u.email || "").toLowerCase(), u.id]));
    const linhas = perfil
      .map((p) => ({ id: idPorEmail.get(p.email), email: p.email, full_name: p.full_name }))
      .filter((l) => l.id && l.full_name);
    if (linhas.length) {
      const { ok, corpo, status } = await chamar(NOVO_URL, NOVO_CHAVE, "/rest/v1/profiles?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(linhas),
      });
      console.log(ok ? `\nprofiles atualizados: ${linhas.length}` : `\n! profiles falhou (${status}): ${JSON.stringify(corpo).slice(0, 200)}`);
    }
  }

  /* bases (workspaces) — opcional */
  if (COM_BASES) {
    console.log("\n--com-bases: copiando membros por slug de base");
    const [wsAntigas, wsNovas, membrosAntigos] = await Promise.all([
      chamar(ANTIGO_URL, ANTIGO_CHAVE, "/rest/v1/workspaces?select=id,slug").then((r) => r.corpo || []),
      chamar(NOVO_URL, NOVO_CHAVE, "/rest/v1/workspaces?select=id,slug").then((r) => r.corpo || []),
      chamar(ANTIGO_URL, ANTIGO_CHAVE, "/rest/v1/workspace_members?select=workspace_id,user_id,role").then((r) => r.corpo || []),
    ]);
    const slugPorIdAntigo = new Map(wsAntigas.map((w) => [w.id, w.slug]));
    const idNovoPorSlug = new Map(wsNovas.map((w) => [w.slug, w.id]));
    const usuariosAntigos = new Map(antigos.map((u) => [u.id, u.email?.toLowerCase()]));
    const usuariosNovos = new Map((await listarUsuarios(NOVO_URL, NOVO_CHAVE)).map((u) => [(u.email || "").toLowerCase(), u.id]));

    const novosMembros = [];
    for (const m of membrosAntigos) {
      const slug = slugPorIdAntigo.get(m.workspace_id);
      const email = usuariosAntigos.get(m.user_id);
      const workspaceId = slug ? idNovoPorSlug.get(slug) : null;
      const userId = email ? usuariosNovos.get(email) : null;
      if (workspaceId && userId) {
        novosMembros.push({ workspace_id: workspaceId, user_id: userId, role: m.role || "member" });
        membros.push(email);
      }
    }
    if (novosMembros.length && !SECO) {
      const { ok, corpo, status } = await chamar(NOVO_URL, NOVO_CHAVE, "/rest/v1/workspace_members?on_conflict=workspace_id,user_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(novosMembros),
      });
      console.log(ok ? `membros copiados: ${novosMembros.length}` : `! membros falhou (${status}): ${JSON.stringify(corpo).slice(0, 200)}`);
    } else {
      console.log(`membros a copiar: ${novosMembros.length}`);
    }
  }

  /* papel de administrador */
  if (ADMIN_EXTRA.length && !SECO) {
    const usuariosNovos = await listarUsuarios(NOVO_URL, NOVO_CHAVE);
    const idPorEmail = new Map(usuariosNovos.map((u) => [(u.email || "").toLowerCase(), u.id]));
    const linhas = ADMIN_EXTRA.map((email) => ({ user_id: idPorEmail.get(email), role: "admin" })).filter((l) => l.user_id);
    if (linhas.length) {
      const { ok, corpo, status } = await chamar(NOVO_URL, NOVO_CHAVE, "/rest/v1/user_roles?on_conflict=user_id,role", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(linhas),
      });
      console.log(ok ? `admins garantidos: ${linhas.length}` : `! user_roles falhou (${status}): ${JSON.stringify(corpo).slice(0, 200)}`);
    } else {
      console.log("! --admin: nenhum dos e-mails existe no projeto novo (confira a grafia)");
    }
  }

  console.log("\n=== resumo ===");
  console.log(`criados          : ${criados}${SECO ? " (previsto)" : ""}`);
  console.log(`já existiam/pulados: ${pulados}`);
  console.log(`links enviados   : ${emailsEnviados}${SECO ? " (previsto)" : ""}`);
  if (!ENVIAR_REDEFINICAO) {
    console.log("\nDica: rode com --enviar-redefinicao para cada pessoa escolher a senha, ou use");
    console.log("Supabase → Authentication → Users → Reset password na conta desejada.");
  }
  console.log("\nO banco antigo não foi tocado: dá para repetir este script quantas vezes quiser.");
};

principal().catch((e) => {
  console.error(`\nERRO: ${e.message}`);
  process.exit(1);
});
