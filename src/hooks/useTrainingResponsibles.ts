import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAuth } from "@/hooks/useAuth";

export type TrainingResponsible = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  display_name: string;
  /** true quando o responsável está arquivado (some das novas atribuições). */
  archived?: boolean;
};

/** Responsáveis atribuíveis aos atendimentos: lista padrão do sistema + cadastrados da base ativa. */
export const useTrainingResponsibles = (enabled = true) => {
  const { activeId } = useWorkspace();
  const { user } = useAuth();

  return useQuery<TrainingResponsible[]>({
    queryKey: ["training-responsibles", activeId, user?.id],
    enabled: enabled && Boolean(activeId && user?.id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_workspace_training_responsibles");
      if (error) throw error;
      return (data ?? []).map((row) => ({
        user_id: row.user_id,
        full_name: row.full_name,
        email: row.email,
        display_name: row.full_name ?? row.email ?? "Sem nome",
        archived: row.archived ?? false,
      }));
    },
  });
};
