import { createContext, useContext, useEffect, useRef, useState, ReactNode, useCallback } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

import { normalizeProfileName } from "@/lib/profileName";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  fullName: string;
  profileLoading: boolean;
  profileError: string | null;
  updateFullName: (name: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  loading: true,
  fullName: "",
  profileLoading: true,
  profileError: null,
  updateFullName: async () => {},
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const [profile, setProfile] = useState<{ userId: string; name: string | null } | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Keep the last known identity so token refreshes (which fire whenever the tab
  // regains focus) do not create new object identities and re-render the whole app.
  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const apply = (s: Session | null, forceUser = false) => {
      const nextId = s?.user?.id ?? null;
      setSession(s);
      if (forceUser || nextId !== lastUserIdRef.current) {
        lastUserIdRef.current = nextId;
        setUser(s?.user ?? null);
      }
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      apply(s, event === "USER_UPDATED");
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      apply(s);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const userId = user?.id;
  useEffect(() => {
    let cancelled = false;
    setProfileError(null);
    if (!userId) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    const loadProfile = async () => {
      try {
        const { data, error } = await supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle();
        if (error) throw error;
        if (!cancelled) setProfile({ userId, name: data?.full_name ?? null });
      } catch {
        if (!cancelled) setProfileError("Não foi possível carregar seu nome. Verifique sua conexão.");
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    };
    void loadProfile();
    return () => { cancelled = true; };
  }, [userId]);

  const updateFullName = useCallback(async (value: string) => {
    if (!userId) throw new Error("Entre novamente para alterar seu nome.");
    const name = normalizeProfileName(value);
    // RLS permite escrever somente no perfil da conta autenticada. Upsert
    // também atende contas que ainda não possuem uma linha em profiles.
    const { data, error } = await supabase.from("profiles")
      .upsert({ id: userId, full_name: name }, { onConflict: "id" })
      .select("full_name").single();
    if (error) throw new Error("Não foi possível salvar seu nome. Verifique a conexão e tente novamente.");
    if (lastUserIdRef.current === userId) {
      setProfile({ userId, name: data.full_name });
      setProfileError(null);
    }
  }, [userId]);

  const metadataName = typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "";
  const fullName = (profile?.userId === userId ? profile?.name : null) || metadataName;

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut, fullName, profileLoading, profileError, updateFullName }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);