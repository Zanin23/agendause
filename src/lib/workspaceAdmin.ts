import { supabase } from "@/integrations/supabase/client";

/**
 * Controle de bases de dados (workspaces).
 *
 * Todas as operações passam por RPCs `SECURITY DEFINER` que exigem
 * administrador e aplicam as travas de segurança no banco — a interface
 * nunca escreve direto na tabela `workspaces`.
 */
export type ManagedWorkspace = {
  id: string;
  slug: string;
  name: string;
  is_protected: boolean;
  created_at: string;
  members_count: number;
  active_users: number;
};

export type WorkspaceUsage = {
  total: number;
  tables: Record<string, number>;
  active_users: number;
};

type RpcError = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: RpcError | null }>;
};

const client = supabase as unknown as RpcClient;

export const MIGRATION_FILE = "supabase/migrations/20261019120000_controle_de_bases.sql";

export function mensagemDaBase(error: unknown): string {
  const e = (error ?? {}) as RpcError;
  const mensagem = e.message || (error instanceof Error ? error.message : String(error ?? ""));

  if (
    e.code === "PGRST202" ||
    e.code === "42883" ||
    /could not find the function|function .*does not exist|schema cache/i.test(mensagem)
  ) {
    return `O controle de bases ainda não foi ativado neste banco. Rode o arquivo ${MIGRATION_FILE} no SQL Editor do Supabase e tente de novo.`;
  }
  if (e.code === "42501" || /acesso restrito a administradores/i.test(mensagem)) {
    return "Apenas administradores podem criar, renomear ou excluir bases.";
  }
  return mensagem || "Não foi possível concluir a operação.";
}

async function chamar<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(mensagemDaBase(error));
  return data as T;
}

/** Lista as bases com proteção, quantidade de vínculos e de usuários ativos. */
export const listarBasesGerenciadas = () =>
  chamar<ManagedWorkspace[]>("admin_list_workspaces");

/** Cria uma base vazia e dá acesso a todos os usuários. */
export const criarBase = (name: string) =>
  chamar<ManagedWorkspace[]>("admin_create_workspace", { _name: name });

/** Muda apenas o nome de exibição (slug e registros ficam intactos). */
export const renomearBase = (id: string, name: string) =>
  chamar<ManagedWorkspace[]>("admin_rename_workspace", { _workspace_id: id, _name: name });

/** Exclui uma base criada pelo app, somente se estiver vazia. */
export const excluirBase = (id: string, confirmName: string) =>
  chamar<null>("admin_delete_workspace", { _workspace_id: id, _confirm_name: confirmName });

/** Quantos registros existem na base (usado antes de excluir). */
export const usoDaBase = (id: string) =>
  chamar<WorkspaceUsage>("admin_workspace_usage", { _workspace_id: id });
