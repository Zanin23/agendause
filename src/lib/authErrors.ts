/* ---------------------------------------------------------------------------
   Tradução dos erros de login do Supabase para o que fazer na prática.

   Por que existe: quando o servidor de login responde com erro de
   infraestrutura (HTTP 500–530) o cliente do Supabase monta a mensagem com
   `JSON.stringify(response)` — o resultado é literalmente `{}`. A tela então
   mostrava um "{}" no lugar da explicação. Aqui o erro cru (objeto, string ou
   Response) vira uma frase em português, com o próximo passo, e o `{}` nunca
   chega ao usuário.
--------------------------------------------------------------------------- */

/** 500–530 = problema de servidor/infraestrutura (não é a senha do usuário). */
export const STATUS_DE_INFRA = [500, 501, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 527, 528, 529, 530];

export const ehStatusDeInfra = (status?: number) => typeof status === "number" && STATUS_DE_INFRA.includes(status);

export type DetalheErroAuth = {
  nome: string;
  mensagem: string;
  status?: number;
  codigo?: string;
};

const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "");

/** Extrai nome, mensagem, status e código de qualquer coisa que tenha sido lançada. */
export function extrairErroAuth(err: unknown): DetalheErroAuth {
  if (typeof err === "string") return { nome: "", mensagem: err };
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    const mensagem =
      texto(e.message) || texto(e.error_description) || texto(e.msg) || texto(e.error) || "";
    const status =
      typeof e.status === "number" ? e.status : typeof e.statusCode === "number" ? (e.statusCode as number) : undefined;
    const codigo = texto(e.code) || texto(e.error_code) || undefined;
    return { nome: texto(e.name), mensagem, status, codigo: codigo || undefined };
  }
  return { nome: "", mensagem: "" };
}

/** A mensagem é JSON (`{}`, `{"a":1}`) ou lixo de serialização? */
export const mensagemInutil = (mensagem: string) => {
  const m = (mensagem || "").trim();
  return !m || m === "{}" || m === "[]" || m === "[object Object]" || /^[[{]/.test(m);
};

/** Tenta tirar algo útil de uma mensagem que é JSON. */
export function mensagemDeJson(mensagem: string): string {
  const m = (mensagem || "").trim();
  if (!/^[[{]/.test(m)) return "";
  try {
    const dados = JSON.parse(m) as Record<string, unknown>;
    return texto(dados?.message) || texto(dados?.msg) || texto(dados?.error_description) || texto(dados?.error) || "";
  } catch {
    return "";
  }
}

export type ContextoLogin = { projeto?: string; painel?: string };

export function mensagemServidorFora(status: number | undefined, ctx: ContextoLogin = {}, codigoDoSupabase?: string): string {
  const marcas = [status ? `erro ${status}` : "", codigoDoSupabase ?? ""].filter(Boolean).join(" · ");
  const codigo = marcas ? ` (${marcas})` : "";
  const painel = ctx.painel ? ` Abra ${ctx.painel} — ` : " Abra o painel do Supabase — ";
  return (
    `O servidor de login está fora do ar ou instável${codigo}. Isso é problema do servidor, não da sua senha. ` +
    `A causa mais comum é o projeto do Supabase estar pausado (o plano gratuito pausa depois de dias sem uso).` +
    painel +
    (ctx.projeto ? `confira se o projeto ${ctx.projeto} aparece como “Paused” e clique em “Restore/Resume”; ` : "veja se o projeto aparece como “Paused” e clique em “Restore/Resume”; ") +
    `se estiver ativo, tente de novo em alguns minutos e use “Não consigo entrar → Verificar o acesso” para registrar o que está respondendo.`
  );
}

export function mensagemErroSemDetalhe(status: number | undefined, codigo?: string, ctx: ContextoLogin = {}): string {
  const partes = [status ? `código ${status}` : "", codigo ? `motivo “${codigo}”` : ""].filter(Boolean).join(" · ");
  return (
    `O servidor de login respondeu com um erro sem detalhes${partes ? ` (${partes})` : ""}. ` +
    `Isso normalmente é instabilidade momentânea${ctx.projeto ? ` no projeto ${ctx.projeto}` : ""}; tente novamente em alguns minutos. ` +
    `Se continuar, use “Não consigo entrar → Verificar o acesso”, copie o diagnóstico e envie para o suporte.`
  );
}

/**
 * Converte o erro cru do login em uma frase útil (com o próximo passo).
 * Aceita Error, AuthApiError, AuthRetryableFetchError, Response ou string.
 */
export function explicarErroDeLogin(err: unknown, ctx: ContextoLogin = {}): string {
  const detalhe = extrairErroAuth(err);
  const { nome, status, codigo } = detalhe;
  const bruto = mensagemInutil(detalhe.mensagem) ? mensagemDeJson(detalhe.mensagem) : detalhe.mensagem;
  const m = `${bruto} ${detalhe.mensagem} ${codigo ?? ""}`.toLowerCase();

  // Servidor/infraestrutura: nunca é a senha da pessoa.
  if (ehStatusDeInfra(status) || (nome === "AuthRetryableFetchError" && !bruto)) {
    return mensagemServidorFora(status, ctx, codigo);
  }
  if (/invalid login credentials|invalid_grant|invalid credentials|invalid_credentials/.test(m))
    return "E-mail ou senha não conferem neste banco. Se a sua conta foi criada antes de 11/10 (o sistema trocou de banco nesse dia), use “Esqueci minha senha” ou peça ao administrador para recriar a conta.";
  if (/email not confirmed|email_not_confirmed/.test(m))
    return "A conta existe, mas o e-mail ainda não foi confirmado. Peça ao administrador para confirmar o acesso (Admin → contas).";
  if (/failed to fetch|networkerror|load failed|network request failed|fetch failed/.test(m))
    return "Não foi possível falar com o servidor de login. Veja se a internet está ok e rode “Verificar o acesso” abaixo — se o banco estiver pausado no Supabase, nada entra até reativá-lo.";
  if (/too many requests|rate limit|over_request_rate_limit|over_email_send_rate_limit/.test(m))
    return "Muitas tentativas em pouco tempo. Espere alguns minutos e tente de novo.";
  if (/provider is not enabled|unsupported provider|validation_failed/.test(m))
    return "O login com Google ainda não está habilitado neste banco. Entre com e-mail e senha (ou habilite o Google no Supabase → Authentication → Providers).";
  if (/signups not allowed|signup_disabled|signup is disabled/.test(m))
    return "O cadastro público está desativado — as contas são criadas pelo administrador.";
  if (/user not found|user_not_found/.test(m))
    return "Não existe conta com este e-mail neste banco. Peça ao administrador para criar o acesso (Admin → Controle de Acessos → Novo Usuário).";
  if (/weak password|password.*(weak|short)|password_too_short|password should be at least|at least \d+ characters/.test(m))
    return "A senha informada não atende aos requisitos mínimos. Use pelo menos 6 caracteres.";

  if (!bruto) return mensagemErroSemDetalhe(status, codigo, ctx);
  return bruto;
}
