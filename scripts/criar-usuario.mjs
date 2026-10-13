#!/usr/bin/env node
/* ============================================================================
   criar-usuario.mjs — cria uma conta do TreinaCheck sem abrir o site.

   Para que serve: é o caminho garantido quando a tela Controle de Acessos
   ainda não consegue criar a conta (banco sem a migração
   20261013140000_admin_contas_sem_edge_function.sql e/ou Edge Function
   `admin-users` não publicada). Usa a API de administração do Supabase — a
   mesma que a Edge Function usaria — direto da sua máquina.

   Precisa da chave SECRETA (service_role) do projeto. Ela NUNCA vai para o
   repositório: passe por variável de ambiente na hora de rodar.

   Uso:
     SUPABASE_SERVICE_KEY=sb_secret_xxx \
     node scripts/criar-usuario.mjs \
       --email fulano@empresa.com \
       --nome "Fulano de Tal" \
       --senha "UmaSenhaForte1" \
       --admin

     # sem senha o script gera uma e manda o link "definir senha" por e-mail
     SUPABASE_SERVICE_KEY=sb_secret_xxx \
     node scripts/criar-usuario.mjs --email fulano@empresa.com --nome "Fulano"

   Opções:
     --email <e-mail>       obrigatório
     --nome <nome>          nome que aparece no sistema (padrão: antes do @)
     --senha <senha>        mínimo 6 caracteres (padrão: gerada + e-mail de acesso)
     --admin                cria já como administrador
     --telas <lista>        telas liberadas, separadas por vírgula
                            (schedules, clients, reports, notes)
     --sem-email            não envia o link de definição de senha
     --url <url>            projeto Supabase (padrão: VITE_SUPABASE_URL do .env)
     --chave <chave>        service_role (padrão: SUPABASE_SERVICE_KEY do ambiente)
     --simular              mostra o que faria, sem gravar nada
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

if (temFlag("ajuda") || temFlag("help")) {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("============ */")[0]);
  process.exit(0);
}

const lerEnv = () => {
  const caminho = resolve(RAIZ, ".env");
  const out = {};
  if (!existsSync(caminho)) return out;
  for (const linha of readFileSync(caminho, "utf8").split("\n")) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/i);
    if (m) out[m[1]] = m[2];
  }
  return out;
};
const env = lerEnv();

const tiraBarra = (u) => (u || "").replace(/\/+$/, "");
const URL_PROJETO = tiraBarra(valorDe("url") || process.env.SUPABASE_URL || env.VITE_SUPABASE_URL);
const CHAVE = valorDe("chave") || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const EMAIL = (valorDe("email") || "").trim().toLowerCase();
const NOME = (valorDe("nome") || "").trim();
const SENHA = valorDe("senha") || "";
const ADMIN = temFlag("admin");
const TELAS = (valorDe("telas") || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((screen) => ({ screen, actions: ["read", "write"] }));
const SEM_EMAIL = temFlag("sem-email");
const SIMULAR = temFlag("simular");
const EMAIL_ACESSO = "https://agendause.vercel.app/auth";

const refDoProjeto = (url) => (url || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] || null;
const semSegredo = (c) => (c ? `${c.slice(0, 8)}…${c.slice(-4)} (${c.length} caracteres)` : "(vazia)");
const senhaAleatoria = () =>
  `Use${Math.random().toString(36).slice(-5)}${Math.random().toString(36).slice(-4).toUpperCase()}!${Math.floor(Math.random() * 90 + 10)}`;

async function chamar(caminho, opcoes = {}) {
  let r;
  try {
    r = await fetch(`${URL_PROJETO}${caminho}`, {
    ...opcoes,
    headers: {
      apikey: CHAVE,
      Authorization: `Bearer ${CHAVE}`,
      "Content-Type": "application/json",
      ...(opcoes.headers || {}),
      },
    });
  } catch (e) {
    return { ok: false, status: 0, corpo: { message: `não consegui falar com ${URL_PROJETO} (${e.message})` } };
  }
  const texto = await r.text();
  let corpo = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    corpo = texto;
  }
  return { ok: r.ok, status: r.status, corpo };
}

const principal = async () => {
  console.log("=== Criar conta — TreinaCheck ===");
  console.log(`projeto : ${URL_PROJETO || "(sem VITE_SUPABASE_URL no .env)"}  ${refDoProjeto(URL_PROJETO) ? `(ref ${refDoProjeto(URL_PROJETO)})` : ""}`);
  console.log(`chave   : ${semSegredo(CHAVE)}`);
  console.log(`e-mail  : ${EMAIL || "(faltando --email)"}`);
  console.log(`nome    : ${NOME || "(vai usar a parte antes do @)"}`);
  console.log(`papel   : ${ADMIN ? "administrador" : "usuário padrão"}`);
  console.log(`telas   : ${ADMIN ? "todas (admin)" : TELAS.map((t) => t.screen).join(", ") || "(nenhuma)"}`);
  console.log(SIMULAR ? "modo    : --simular (nada será gravado)\n" : "modo    : gravando\n");

  if (!URL_PROJETO) throw new Error("Informe o projeto (--url ou VITE_SUPABASE_URL no .env).");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(EMAIL)) throw new Error("Informe um e-mail válido em --email.");
  if (SENHA && SENHA.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");
  if (SIMULAR) {
    console.log("Nada foi gravado (--simular).");
    return;
  }
  if (!CHAVE) {
    throw new Error(
      "Falta a chave secreta (service_role). Ela fica em Supabase → Project Settings → API → service_role.\n" +
        "Passe por variável de ambiente: SUPABASE_SERVICE_KEY=sb_secret_xxx node scripts/criar-usuario.mjs --email ...",
    );
  }
  const senha = SENHA || senhaAleatoria();
  const nome = NOME || EMAIL.split("@")[0];

  /* 1. conta no Auth */
  const criado = await chamar("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email: EMAIL, password: senha, email_confirm: true, user_metadata: { full_name: nome } }),
  });

  let id = criado.corpo?.id || criado.corpo?.user?.id || null;
  if (!criado.ok) {
    if (/already|registered|exists/i.test(JSON.stringify(criado.corpo))) {
      console.log("= a conta já existe neste banco; vou apenas ajustar nome, papel e permissões.");
      const lista = await chamar("/auth/v1/admin/users?page=1&per_page=1000");
      id = (lista.corpo?.users || []).find((u) => (u.email || "").toLowerCase() === EMAIL)?.id || null;
      if (!id) throw new Error("A conta existe mas não consegui descobrir o id dela.");
    } else {
      throw new Error(`Criar a conta falhou (${criado.status}): ${JSON.stringify(criado.corpo).slice(0, 300)}`);
    }
  } else {
    console.log(`+ conta criada (id ${id})${SENHA ? "" : ` com a senha temporária: ${senha}`}`);
  }

  /* 2. nome no perfil */
  const perfil = await chamar("/rest/v1/profiles?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{ id, email: EMAIL, full_name: nome }]),
  });
  console.log(perfil.ok ? `+ perfil com o nome "${nome}"` : `! perfil não atualizou (${perfil.status}): ${JSON.stringify(perfil.corpo).slice(0, 200)}`);

  /* 3. papel e permissões */
  const papeis = [{ user_id: id, role: ADMIN ? "admin" : "member", screen_permissions: ADMIN ? [] : TELAS, schedule_permissions: {} }];
  if (ADMIN) papeis.push({ user_id: id, role: "member", screen_permissions: [], schedule_permissions: {} });
  const papel = await chamar("/rest/v1/user_roles?on_conflict=user_id,role", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(papeis),
  });
  console.log(papel.ok ? `+ papel ${ADMIN ? "administrador" : "usuário padrão"} e permissões gravados` : `! papel não gravou (${papel.status}): ${JSON.stringify(papel.corpo).slice(0, 200)}`);

  /* 4. acesso: manda o link de definição de senha (ou avisa a senha) */
  if (!SEM_EMAIL) {
    const link = await chamar(`/auth/v1/recover?redirect_to=${encodeURIComponent(EMAIL_ACESSO)}`, {
      method: "POST",
      body: JSON.stringify({ email: EMAIL, redirect_to: EMAIL_ACESSO }),
    });
    console.log(link.ok ? "+ e-mail para definir a senha enviado" : `! e-mail não enviado (${link.status}): ${JSON.stringify(link.corpo).slice(0, 200)}`);
    if (!SENHA) console.log(`  (a senha temporária também vale: ${senha})`);
  }

  console.log("\nPronto. Entre em https://agendause.vercel.app/auth com " + EMAIL + ".");
};

principal().catch((e) => {
  console.error(`\n! ${e.message}`);
  process.exit(1);
});
