import { useCallback, useEffect, useMemo, useState } from "react";
import { Shield, ShieldCheck, Search, KeyRound, Loader2, Mail, RefreshCw, UserCog } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { AppHeader } from "@/components/AppHeader";
import { BackButton } from "@/components/BackButton";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type AdminUser = {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed: boolean;
  workspace: string | null;
  roles: string[];
};

const formatDate = (v?: string | null) =>
  v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

const Admin = () => {
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useIsAdmin();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<AdminUser | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const call = useCallback(async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("admin-users", { body: payload });
    if (error) throw new Error((data as any)?.error || error.message);
    if ((data as any)?.error) throw new Error((data as any).error);
    return data as any;
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await call({ action: "list" });
      setUsers(data.users ?? []);
    } catch (e: any) {
      toast.error(e.message || "Erro ao carregar contas");
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => {
    if (!roleLoading && isAdmin) load();
    if (!roleLoading && !isAdmin) setLoading(false);
  }, [roleLoading, isAdmin, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.email ?? "").toLowerCase().includes(q) ||
        (u.full_name ?? "").toLowerCase().includes(q),
    );
  }, [users, query]);

  const savePassword = async () => {
    if (!target) return;
    if (password.length < 6) return toast.error("A senha deve ter pelo menos 6 caracteres");
    if (password !== confirm) return toast.error("As senhas não coincidem");
    try {
      setSaving(true);
      await call({ action: "set_password", user_id: target.id, password });
      toast.success(`Senha de ${target.email} atualizada`);
      setTarget(null);
      setPassword("");
      setConfirm("");
    } catch (e: any) {
      toast.error(e.message || "Erro ao atualizar senha");
    } finally {
      setSaving(false);
    }
  };

  const sendReset = async (u: AdminUser) => {
    if (!u.email) return;
    try {
      setBusyId(u.id);
      await call({ action: "send_reset", email: u.email, redirect_to: `${window.location.origin}/auth` });
      toast.success("E-mail de redefinição enviado");
    } catch (e: any) {
      toast.error(e.message || "Erro ao enviar e-mail");
    } finally {
      setBusyId(null);
    }
  };

  const toggleAdmin = async (u: AdminUser) => {
    const makeAdmin = !u.roles.includes("admin");
    try {
      setBusyId(u.id);
      await call({ action: "set_admin", user_id: u.id, admin: makeAdmin });
      setUsers((prev) =>
        prev.map((p) =>
          p.id === u.id
            ? { ...p, roles: makeAdmin ? [...p.roles, "admin"] : p.roles.filter((r) => r !== "admin") }
            : p,
        ),
      );
      toast.success(makeAdmin ? "Agora é administrador" : "Acesso de administrador removido");
    } catch (e: any) {
      toast.error(e.message || "Erro ao alterar permissão");
    } finally {
      setBusyId(null);
    }
  };

  if (roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <SEO title="Administração — TreinaCheck" description="Área administrativa do sistema." path="/admin" />
        <AppHeader />
        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
          <BackButton />
          <section className="mt-6 rounded-2xl border border-border bg-card/60 p-8 text-center">
            <Shield className="h-10 w-10 mx-auto text-muted-foreground" />
            <h1 className="text-2xl font-semibold mt-4">Acesso restrito</h1>
            <p className="text-muted-foreground mt-2">
              Somente administradores podem visualizar as contas do sistema.
            </p>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Administração — TreinaCheck" description="Gerencie contas e senhas do sistema." path="/admin" />
      <AppHeader />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-6">
        <div>
          <BackButton />
          <div className="flex flex-wrap items-end justify-between gap-3 mt-3">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Administração</h1>
              <p className="text-muted-foreground mt-1">
                Contas cadastradas no sistema — ajuste senhas e permissões.
              </p>
            </div>
            <Button variant="outline" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="ml-2">Atualizar</span>
            </Button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome ou e-mail"
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="py-16 text-center text-muted-foreground">Carregando contas...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">Nenhuma conta encontrada.</div>
        ) : (
          <div className="space-y-3">
            {filtered.map((u) => {
              const admin = u.roles.includes("admin");
              return (
                <article
                  key={u.id}
                  className="rounded-2xl border border-border bg-card/60 p-4 sm:p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-semibold truncate">{u.full_name || "Sem nome"}</h2>
                      {admin && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5">
                          <ShieldCheck className="h-3 w-3" /> Admin
                        </span>
                      )}
                      {!u.email_confirmed && (
                        <span className="rounded-full bg-muted text-muted-foreground text-xs px-2 py-0.5">
                          E-mail não confirmado
                        </span>
                      )}
                      {u.id === user?.id && (
                        <span className="rounded-full bg-muted text-muted-foreground text-xs px-2 py-0.5">
                          Você
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{u.email}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Base: {u.workspace ?? "—"} · Criada em {formatDate(u.created_at)} · Último acesso{" "}
                      {formatDate(u.last_sign_in_at)}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 shrink-0">
                    <Button
                      size="sm"
                      onClick={() => {
                        setTarget(u);
                        setPassword("");
                        setConfirm("");
                      }}
                    >
                      <KeyRound className="h-4 w-4 mr-2" /> Definir senha
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => sendReset(u)}
                      disabled={busyId === u.id || !u.email}
                    >
                      <Mail className="h-4 w-4 mr-2" /> Enviar redefinição
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleAdmin(u)}
                      disabled={busyId === u.id || u.id === user?.id}
                    >
                      <UserCog className="h-4 w-4 mr-2" />
                      {admin ? "Remover admin" : "Tornar admin"}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Definir nova senha</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              A senha de <strong>{target?.email}</strong> será alterada imediatamente.
            </p>
            <div className="space-y-2">
              <Label htmlFor="new-pass">Nova senha</Label>
              <Input
                id="new-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-pass">Confirmar senha</Label>
              <Input
                id="confirm-pass"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTarget(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={savePassword} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <KeyRound className="h-4 w-4 mr-2" />}
              Salvar senha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Admin;