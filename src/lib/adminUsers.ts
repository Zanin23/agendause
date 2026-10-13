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

type ApiError = { message: string; code?: string; context?: unknown; name?: string };
type ApiResult = { data: unknown; error: ApiError | null };
type AdminClient = {
  rpc: (name: "admin_list_users") => PromiseLike<ApiResult>;
  functions: { invoke: (name: string, options: { body: Record<string, unknown> }) => Promise<ApiResult> };
};

export async function adminFunctionError(error: ApiError, data?: unknown): Promise<string> {
  let serverMessage = (data as { error?: string } | null)?.error;
  const response = error.context;
  if (response instanceof Response) {
    try {
      serverMessage ||= (await response.clone().json())?.error;
    } catch { /* O gateway pode responder sem JSON. */ }
    if (response.status === 401) return "Sua sessão expirou. Saia e entre novamente.";
    if (response.status === 403) return "Acesso restrito a administradores.";
    if (response.status === 404) return "A função admin-users não está publicada no Supabase deste site. É necessário publicar a função para gerenciar as contas.";
  }
  if (serverMessage) return serverMessage;
  if (error.name === "FunctionsFetchError" || error.name === "FunctionsRelayError" || /Failed to send a request to the Edge Function/i.test(error.message)) {
    return "Não foi possível acessar a função admin-users. Verifique a conexão e se a função está publicada no projeto Supabase deste site.";
  }
  return error.message;
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
