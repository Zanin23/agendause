import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Keep the last known identity so token refreshes (which fire whenever the tab
  // regains focus) do not create new object identities and re-render the whole app.
  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const apply = (s: Session | null) => {
      const nextId = s?.user?.id ?? null;
      setSession(s);
      if (nextId !== lastUserIdRef.current) {
        lastUserIdRef.current = nextId;
        setUser(s?.user ?? null);
      }
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      apply(s);
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      apply(s);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);