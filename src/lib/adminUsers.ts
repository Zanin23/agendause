export type AdminUser = {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed: boolean;
  workspace: string | null;
  roles: string[];
  screen_permissions: { screen: string; actions: string[] }[];
  schedule_permissions: Record<string, string>;
};

export type LiteSchedule = { id: string; client_name: string };
export type AdminUsersResult = { users: AdminUser[]; all_schedules: LiteSchedule[] };
export type ScreenPermission = { screen: string; actions: string[] };

/** Ações administrativas da tela Controle de Acessos. */
export type AdminActionPayload =
  | {
      action: "create_user";
      email: string;
      password: string;
      full_name: string;
      role: "admin" | "member";
      screen_permissions: ScreenPermission[];
      schedule_permissions: Record<string, string>;
    }
  | { action: "set_password"; user_id: string; password: string }
  | { action: "set_admin"; user_id: string; admin: boolean }
  | {
      action: "set_permissions";
      user_id: string;
      screen_permissions: ScreenPermission[];
      schedule_permissions: Record<string, string>;
    }
  | { action: "send_reset"; email: string; redirect_to?: string };

type ApiError = { message: string; code?: string; context?: unknown; name?: string };
type ApiResult = { data: unknown; error: ApiError | null };
type AdminClient = {
  rpc: (name: "admin_list_users") => PromiseLike<ApiResult>;
  functions: { invoke: (name: string, options: { body: Record<string, unknown> }) => Promise<ApiResult> };
};
type AdminActionClient = {
  rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<ApiResult>;
  functions: { invoke: (name: string, options: { body: Record<string, unknown> }) => Promise<ApiResult> };
  auth?: {
    resetPasswordForEmail?: (
      email: string,
      options?: { redirectTo?: string },
    ) => PromiseLike<{ error: ApiError | null }>;
  };
};

/** RPC equivalente a cada ação da Edge Function `admin-users`. */
const RPC_POR_ACAO = {
  create_user: "admin_create_user",
  set_password: "admin_set_password",
  set_admin: "admin_set_admin",
  set_permissions: "admin_set_permissions",
} as const;

/** PostgREST devolve estes códigos quando a função ainda não existe no banco. */
const RPC_AUSENTE = ["PGRST202", "42883"];

/** Nem a RPC nova nem a Edge Function responderam: falta publicar uma das duas. */
const MENSAGEM_PENDENTE =
  "A gestão de contas ainda não está publicada neste banco. Em “Conferir publicação no Supabase”, logo acima nesta tela, o botão copia o SQL e abre o editor: cole, clique em Run e confira de novo (ou publique a Edge Function admin-users).";
const PENDENTE_DE_PUBLICACAO = /não está publicada|não foi possível acessar a função|Verifique a conexão|Failed to send a request/i;

export const SQL_LISTA = "20261013130000_admin_list_users.sql";
export const SQL_CONTAS = "20261013140000_admin_contas_sem_edge_function.sql";

export type PublicacaoNivel = "ok" | "opcional" | "faltando" | "erro";
export type PublicacaoItem = {
  chave: string;
  rotulo: string;
  nivel: PublicacaoNivel;
  detalhe: string;
  /** Arquivo SQL que resolve a pendência (quando existe um). */
  arquivo?: string;
};

/**
 * Confere, com a própria sessão do administrador, o que está publicado neste
 * banco: cada RPC do Controle de Acessos e a Edge Function `admin-users`.
 *
 * As "provas" chamam as RPCs com dados de propósito inválidos (e-mail sem
 * domínio, user_id nulo). Se a função existe, ela responde com erro de
 * validação ANTES de gravar qualquer coisa — então nada é criado, apagado ou
 * alterado por esta conferência.
 */
export async function checkAdminPublication(client: AdminActionClient): Promise<PublicacaoItem[]> {
  const itens: PublicacaoItem[] = [];

  const avaliar = (chave: string, rotulo: string, arquivo: string, error: ApiError | null): PublicacaoItem => {
    if (!error) return { chave, rotulo, nivel: "ok", detalhe: "publicada neste banco" };
    const texto = (error.message ?? "").trim();
    if (RPC_AUSENTE.includes(error.code ?? "") || /does not exist|schema cache|Could not find the function/i.test(texto)) {
      return { chave, rotulo, nivel: "faltando", detalhe: "ainda não foi publicada neste banco", arquivo };
    }
    if (error.code === "42501" && /administrador|sess[aã]o/i.test(texto)) {
      return { chave, rotulo, nivel: "erro", detalhe: texto };
    }
    // Recusa vinda de dentro da função = a função existe e está funcionando.
    return { chave, rotulo, nivel: "ok", detalhe: `publicada (a prova respondeu: ${texto || "sem detalhe"})` };
  };

  const provaCriar = await client.rpc("admin_create_user", {
    _email: "verificacao@sem-dominio",
    _password: "123",
    _full_name: "Verificação",
    _role: "member",
    _screen_permissions: [],
    _schedule_permissions: {},
  });
  itens.push(avaliar("criar", "Criar conta (admin_create_user)", SQL_CONTAS, provaCriar.error));

  const provaSenha = await client.rpc("admin_set_password", { _user_id: null, _password: "12" });
  itens.push(avaliar("senha", "Definir senha (admin_set_password)", SQL_CONTAS, provaSenha.error));

  const provaAdmin = await client.rpc("admin_set_admin", { _user_id: null, _admin: true });
  itens.push(avaliar("admin", "Administrador sim/não (admin_set_admin)", SQL_CONTAS, provaAdmin.error));

  const provaPermissoes = await client.rpc("admin_set_permissions", {
    _user_id: null,
    _screen_permissions: [],
    _schedule_permissions: {},
  });
  itens.push(avaliar("permissoes", "Permissões (admin_set_permissions)", SQL_CONTAS, provaPermissoes.error));

  const provaLista = await client.rpc("admin_list_users");
  itens.push(avaliar("listar", "Listar contas (admin_list_users)", SQL_LISTA, provaLista.error));

  try {
    const { error } = await client.functions.invoke("admin-users", { body: { action: "list" } });
    itens.push(
      error
        ? {
            chave: "funcao",
            rotulo: "Edge Function admin-users",
            nivel: "opcional",
            detalhe: "não publicada — não faz falta: as funções do banco acima já resolvem tudo",
          }
        : { chave: "funcao", rotulo: "Edge Function admin-users", nivel: "ok", detalhe: "publicada neste projeto" },
    );
  } catch (e) {
    itens.push({
      chave: "funcao",
      rotulo: "Edge Function admin-users",
      nivel: "opcional",
      detalhe: `não publicada (${(e as Error).message}) — não faz falta: as funções do banco acima já resolvem tudo`,
    });
  }

  return itens;
}

export async function adminFunctionError(error: ApiError, data?: unknown): Promise<string> {
  let serverMessage = (data as { error?: string } | null)?.error;
  const response = error.context;
  if (response instanceof Response) {
    try {
      serverMessage ||= (await response.clone().json())?.error;
    } catch { /* O gateway pode responder sem JSON. */ }
    if (response.status === 401) return "Sua sessão expirou. Saia e entre novamente.";
    if (response.status === 403) return "Acesso restrito a administradores.";
    if (response.status === 404) {
      return "A gestão de contas ainda não está publicada neste banco. Use “Conferir publicação no Supabase”, nesta tela, para copiar o SQL e colar no SQL Editor (ou publique a Edge Function admin-users).";
    }
  }
  if (serverMessage) return serverMessage;
  if (error.name === "FunctionsFetchError" || error.name === "FunctionsRelayError" || /Failed to send a request to the Edge Function/i.test(error.message)) {
    return "Não foi possível acessar a função admin-users. Verifique a conexão e se a função está publicada no projeto Supabase deste site.";
  }
  return error.message;
}

/** Mensagens do banco (RPC) em português, já no tom da tela. */
export function adminRpcError(error: ApiError): string {
  const message = (error.message ?? "").trim();
  if (error.code === "42501" || /permission denied/i.test(message)) {
    if (/permission denied for (table|schema)|não autoriza gravar em auth\.users/i.test(message)) {
      return "O banco recusou a gravação em auth.users. Publique a Edge Function admin-users (ou rode scripts/criar-usuario.mjs com a chave service_role) para criar contas.";
    }
    return message || "Acesso restrito a administradores.";
  }
  if (error.code === "PGRST301" || /JWT|jwt/i.test(message)) {
    return "Sua sessão expirou. Saia e entre novamente.";
  }
  if (!message) return "O banco não respondeu como esperado. Tente novamente.";
  return message;
}

/** Argumentos de cada RPC (mesmos nomes usados nas funções SQL). */
function rpcArgs(payload: AdminActionPayload): Record<string, unknown> | undefined {
  switch (payload.action) {
    case "create_user":
      return {
        _email: payload.email,
        _password: payload.password,
        _full_name: payload.full_name,
        _role: payload.role,
        _screen_permissions: payload.screen_permissions ?? [],
        _schedule_permissions: payload.schedule_permissions ?? {},
      };
    case "set_password":
      return { _user_id: payload.user_id, _password: payload.password };
    case "set_admin":
      return { _user_id: payload.user_id, _admin: payload.admin };
    case "set_permissions":
      return {
        _user_id: payload.user_id,
        _screen_permissions: payload.screen_permissions ?? [],
        _schedule_permissions: payload.schedule_permissions ?? {},
      };
    default:
      return undefined;
  }
}

async function callEdgeFunction(client: AdminActionClient, payload: AdminActionPayload) {
  const { data, error } = await client.functions.invoke("admin-users", { body: payload });
  if (error) throw new Error(await adminFunctionError(error, data));
  if ((data as { error?: string } | null)?.error) throw new Error((data as { error: string }).error);
  return data;
}

/**
 * Executa uma ação administrativa.
 *
 * Ordem de propósito: RPC do banco primeiro (migração
 * 20261013140000_admin_contas_sem_edge_function.sql), Edge Function depois.
 * Assim criar conta/senha/permissões funciona sem depender do deploy da função
 * — e continua funcionando em banco que ainda não recebeu a migração.
 */
export async function callAdminAction(client: AdminActionClient, payload: AdminActionPayload) {
  if (payload.action === "send_reset") {
    // O envio de e-mail é público no GoTrue (é o mesmo "Esqueci minha senha" da
    // tela de login), então não precisa de Edge Function nem de RPC.
    const reset = client.auth?.resetPasswordForEmail;
    if (reset) {
      const options = payload.redirect_to ? { redirectTo: payload.redirect_to } : undefined;
      const { error } = await reset(payload.email, options);
      if (error) throw new Error(/rate|limit/i.test(error.message) ? "Muitos pedidos de redefinição seguidos. Aguarde alguns minutos e tente de novo." : error.message);
      return { success: true };
    }
    return callEdgeFunction(client, payload);
  }

  const { data, error } = await client.rpc(RPC_POR_ACAO[payload.action], rpcArgs(payload));
  if (!error) {
    const serverError = (data as { error?: string } | null)?.error;
    if (serverError) throw new Error(serverError);
    return data;
  }
  if (RPC_AUSENTE.includes(error.code ?? "")) {
    // Banco ainda sem a migração: mantém o comportamento antigo.
    try {
      return await callEdgeFunction(client, payload);
    } catch (e) {
      const detalhe = (e as Error).message;
      if (PENDENTE_DE_PUBLICACAO.test(detalhe)) {
        throw new Error(`${MENSAGEM_PENDENTE} (${detalhe})`);
      }
      throw e;
    }
  }
  throw new Error(adminRpcError(error));
}

export async function loadAdminUsers(client: AdminClient): Promise<AdminUsersResult> {
  const result = await client.rpc("admin_list_users");
  let data = result.data;
  if (result.error) {
    // Compatibilidade durante a publicação: só usa a função antiga se a RPC
    // ainda não existe. Não tenta contornar erros de autorização ou de rede.
    if (!["PGRST202", "42883"].includes(result.error.code ?? "")) {
      throw new Error(result.error.code === "42501"
        ? "Acesso restrito a administradores autenticados."
        : result.error.message);
    }
    const legacy = await client.functions.invoke("admin-users", { body: { action: "list" } });
    if (legacy.error) {
      throw new Error(`A consulta de usuários ainda precisa ser atualizada no Supabase (migração admin_list_users). ${await adminFunctionError(legacy.error, legacy.data)}`);
    }
    data = legacy.data;
  }
  const payload = data as Partial<AdminUsersResult> & { error?: string } | null;
  if (payload?.error) throw new Error(payload.error);
  if (!Array.isArray(payload?.users) || !Array.isArray(payload?.all_schedules)) {
    throw new Error("O servidor retornou uma lista de usuários inválida. Tente atualizar novamente.");
  }
  return { users: payload.users, all_schedules: payload.all_schedules };
}
