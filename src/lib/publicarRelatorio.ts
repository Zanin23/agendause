import { supabase } from "@/integrations/supabase/client";

/* ---------------------------------------------------------------------------
   Publicar a situação da agenda no relatório de implantações.

   A função `rel_sincronizar_agenda()` foi feita para o RELATÓRIO ser o dono do
   texto/status dele: quando a empresa já existe em `documentos`, o status só é
   atualizado se a chamada pedir (`p_forcar_status = true`) — é a opção
   documentada "agenda manda também no status e no progresso".

   Usamos isso justamente quando alguém muda o status (ou pausa/retoma) dentro
   do cronograma: aí a agenda está dizendo, de propósito, qual é a situação.
   Erro aqui nunca deve travar a mudança de status — é só um aviso.
--------------------------------------------------------------------------- */

export async function publicarStatusNoRelatorio(workspaceId?: string | null): Promise<string | null> {
  const args: { p_forcar_status: boolean; p_workspace?: string } = { p_forcar_status: true };
  if (workspaceId) args.p_workspace = workspaceId;
  const { error } = await supabase.rpc("rel_sincronizar_agenda", args);
  return error ? error.message : null;
}
