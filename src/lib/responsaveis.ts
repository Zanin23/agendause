import { supabase } from "@/integrations/supabase/client";

/**
 * Cadastro de responsáveis pelos atendimentos (treinamentos e visitas),
 * por base ativa — gerenciado apenas por administradores.
 *
 * Todas as operações passam por RPCs `SECURITY DEFINER` que exigem
 * administrador e aplicam as travas no banco — a interface nunca escreve
 * direto na tabela `workspace_responsibles`.
 */

export const MIGRATION_FILE_RESPONSAVEIS = "supabase/migrations/20261127120000_responsaveis_atendimentos.sql";

export type CadastroResponsavel = {
  id: string;
  profile_id: string | null;
  display_name: string;
  email: string | null;
  archived: boolean;
  created_at: string;
};

export type CandidatoResponsavel = {
  user_id: string;
  full_name: string | null;
  email: string | null;
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

export function mensagemDosResponsaveis(error: unknown): string {
  const e = (error ?? {}) as RpcError;
  const mensagem = e.message || (error instanceof Error ? error.message : String(error ?? ""));

  if (
    e.code === "PGRST202" ||
    e.code === "42883" ||
    /could not find the function|function .*does not exist|schema cache/i.test(mensagem)
  ) {
    return `O cadastro de responsáveis ainda não foi ativado neste banco. Rode o arquivo ${MIGRATION_FILE_RESPONSAVEIS} no SQL Editor do Supabase e tente de novo.`;
  }
  if (e.code === "42501" || /acesso restrito a administradores/i.test(mensagem)) {
    return "Apenas administradores podem gerenciar a lista de responsáveis.";
  }
  if (e.code === "23514" || /não pertence|mesma base/i.test(mensagem)) {
    return "Essa pessoa não pode ser vinculada: ela precisa fazer parte desta base.";
  }
  return mensagem || "Não foi possível concluir a operação.";
}

function isMissingFunction(error: unknown): boolean {
  const e = (error ?? {}) as RpcError;
  const mensagem = e.message || (error instanceof Error ? error.message : String(error ?? ""));
  return (
    e.code === "PGRST202" ||
    e.code === "42883" ||
    /could not find the function|function .*does not exist|schema cache/i.test(mensagem)
  );
}
export const isCadastroIndisponivel = isMissingFunction;

async function chamar<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw error; // o card já converte com mensagemDosResponsaveis
  return data as T;
}

/** Lista o cadastro da base ativa (ativos e arquivados). */
export const listarResponsaveis = () =>
  chamar<CadastroResponsavel[]>("list_workspace_responsibles");

/** Usuários da base que podem ser vinculados (fora da lista padrão e ainda não cadastrados). */
export const listarCandidatos = () =>
  chamar<CandidatoResponsavel[]>("list_workspace_responsible_candidates");

/** Cadastra: vincula um usuário da base (profileId) ou um nome livre (displayName). */
export const cadastrarResponsavel = (input: { displayName?: string; profileId?: string }) =>
  chamar<string>("create_workspace_responsible", {
    _display_name: input.displayName ?? null,
    _profile_id: input.profileId ?? null,
  });

/** Renomeia o rótulo exibido (mantém o vínculo). */
export const renomearResponsavel = (id: string, displayName: string) =>
  chamar<void>("rename_workspace_responsible", { _id: id, _display_name: displayName });

/** Arquiva (some das novas atribuições) ou restaura. */
export const arquivarResponsavel = (id: string, archived: boolean) =>
  chamar<void>("set_workspace_responsible_archived", { _id: id, _archived: archived });
