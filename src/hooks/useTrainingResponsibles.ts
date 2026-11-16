import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAuth } from "@/hooks/useAuth";

export type TrainingResponsible = {
  user_id: string;
  full_name: string | null;
  email: string | null;
};

/** Usuários da base ativa que podem ser atribuídos a uma visita. */
export const useTrainingResponsibles = (enabled = true) => {
  const { activeId } = useWorkspace();
  const { user } = useAuth();

  return useQuery<TrainingResponsible[]>({
    queryKey: ["training-responsibles", activeId, user?.id],
    enabled: enabled && Boolean(activeId && user?.id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_workspace_training_responsibles");
      if (error) throw error;
      return data ?? [];
    },
  });
};
