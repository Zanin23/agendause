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
  const [activeId, setActiveIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("active_workspace_id");
  });
  const [loading, setLoading] = useState(true);

  const setActiveId = useCallback((id: string | null) => {
    setActiveIdState(id);
    if (typeof window !== "undefined") {
      if (id) localStorage.setItem("active_workspace_id", id);
      else localStorage.removeItem("active_workspace_id");
    }
  }, []);

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
    const list = (ws as Workspace[]) || [];
    setWorkspaces(list);
    const profileActive = (prof as any)?.active_workspace_id ?? null;
    const cached = typeof window !== "undefined" ? localStorage.getItem("active_workspace_id") : null;
    let resolved: string | null = profileActive;
    if (!resolved && cached && list.some((w) => w.id === cached)) {
      // restore from cache and persist back to profile
      resolved = cached;
      await supabase.from("profiles").update({ active_workspace_id: cached } as any).eq("id", user.id);
    }
    if (!resolved && list.length === 1) {
      resolved = list[0].id;
      await supabase.from("profiles").update({ active_workspace_id: resolved } as any).eq("id", user.id);
    }
    setActiveId(resolved);
    setLoading(false);
  }, [user, setActiveId]);

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
    [user, qc, setActiveId]
  );

  const active = workspaces.find((w) => w.id === activeId) || null;

  return (
    <WorkspaceContext.Provider value={{ workspaces, activeId, active, loading, refresh: load, setActive }}>
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = () => useContext(WorkspaceContext);