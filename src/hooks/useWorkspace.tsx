import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";

export type Workspace = { id: string; slug: string; name: string };

type WorkspaceContextValue = {
  workspaces: Workspace[];
  activeId: string | null;
  active: Workspace | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setActive: (id: string) => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceContextValue>({
  workspaces: [],
  activeId: null,
  active: null,
  loading: true,
  refresh: async () => {},
  setActive: async () => {},
});

export const WorkspaceProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setWorkspaces([]);
      setActiveId(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: ws }, { data: prof }] = await Promise.all([
      supabase.from("workspaces").select("id,slug,name").order("name"),
      supabase.from("profiles").select("active_workspace_id").eq("id", user.id).maybeSingle(),
    ]);
    setWorkspaces((ws as Workspace[]) || []);
    setActiveId((prof as any)?.active_workspace_id ?? null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const setActive = useCallback(
    async (id: string) => {
      if (!user) return;
      const { error } = await supabase.from("profiles").update({ active_workspace_id: id } as any).eq("id", user.id);
      if (error) throw error;
      setActiveId(id);
      await qc.invalidateQueries();
    },
    [user, qc]
  );

  const active = workspaces.find((w) => w.id === activeId) || null;

  return (
    <WorkspaceContext.Provider value={{ workspaces, activeId, active, loading, refresh: load, setActive }}>
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = () => useContext(WorkspaceContext);