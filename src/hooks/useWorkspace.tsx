import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";

export type Workspace = { id: string; slug: string; name: string };

type WorkspaceContextValue = {
  workspaces: Workspace[];
  activeId: string | null;
  active: Workspace | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setActive: (id: string) => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceContextValue>({
  workspaces: [],
  activeId: null,
  active: null,
  loading: true,
  error: null,
  refresh: async () => {},
  setActive: async () => {},
});

export const WorkspaceProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const qc = useQueryClient();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("active_workspace_id");
  });
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const setActiveId = useCallback((id: string | null) => {
    setActiveIdState(id);
    if (typeof window !== "undefined") {
      if (id) localStorage.setItem("active_workspace_id", id);
      else localStorage.removeItem("active_workspace_id");
    }
  }, []);

  const loadedForRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setWorkspaces([]);
      setActiveId(null);
      setErro(null);
      setLoading(false);
      return;
    }
    // Only block the UI on the very first load for this user. Later refreshes
    // (focus / token refresh) must never unmount the current screen.
    if (loadedForRef.current !== userId) setLoading(true);
    try {
      const [resWs, resProf] = await Promise.all([
        supabase.from("workspaces").select("id,slug,name").order("name"),
        supabase.from("profiles").select("active_workspace_id").eq("id", userId).maybeSingle(),
      ]);
      // Sem a lista de bases não há como decidir nada: falha explícita, com
      // caminho de volta (a tela mostra "Tentar de novo"), em vez de girar
      // para sempre em "Carregando...".
      if (resWs.error) throw resWs.error;

      const list = (resWs.data as Workspace[]) || [];
      setWorkspaces(list);
      const profileActive = (resProf.data as any)?.active_workspace_id ?? null;
      const cached = typeof window !== "undefined" ? localStorage.getItem("active_workspace_id") : null;
      let resolved: string | null = profileActive;
      if (!resolved && cached && list.some((w) => w.id === cached)) {
        // restore from cache and persist back to profile
        resolved = cached;
        await supabase.from("profiles").update({ active_workspace_id: cached } as any).eq("id", userId);
      }
      if (!resolved && list.length === 1) {
        resolved = list[0].id;
        await supabase.from("profiles").update({ active_workspace_id: resolved } as any).eq("id", userId);
      }
      setActiveId(resolved);
      loadedForRef.current = userId;
      setErro(null);
    } catch (e) {
      const bruto = (e as Error)?.message || String(e);
      setErro(
        /failed to fetch|network|load failed|fetch failed|timeout/i.test(bruto)
          ? "Não foi possível falar com o banco de dados. Verifique a internet; se o projeto Supabase estiver pausado, ele precisa ser reativado no painel."
          : bruto,
      );
    } finally {
      setLoading(false);
    }
  }, [userId, setActiveId]);

  useEffect(() => {
    load();
  }, [load]);

  const setActive = useCallback(
    async (id: string) => {
      if (!userId) return;
      const { error } = await supabase.from("profiles").update({ active_workspace_id: id } as any).eq("id", userId);
      if (error) throw error;
      setActiveId(id);
      await qc.invalidateQueries();
    },
    [userId, qc, setActiveId]
  );

  const active = workspaces.find((w) => w.id === activeId) || null;

  return (
    <WorkspaceContext.Provider value={{ workspaces, activeId, active, loading, error: erro, refresh: load, setActive }}>
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = () => useContext(WorkspaceContext);